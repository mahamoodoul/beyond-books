from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.modules.ai_engine.scene_planning import convert_plan
from app.modules.ai_engine.schemas import GeneratorParamLLM, SceneComponentLLM, ScenePlanLLM
from app.modules.ai_engine.validation import OutputRejectedError
from app.modules.three_d.seed import DEMO_HEART_SLUG, seed_demo_heart
from tests.helpers import create_course

Login = Callable[..., TestClient]


@pytest.fixture
def seeded(db: Session) -> None:
    seed_demo_heart(db)


def _lesson(t: TestClient, body: str, title: str = "The heart") -> str:
    cid = create_course(t)
    ch = t.post(f"/api/v1/courses/{cid}/chapters", json={"title": title}).json()["id"]
    content = {"sections": [{"title": title, "body_markdown": body}]}
    return str(
        t.post(f"/api/v1/chapters/{ch}/lessons", json={"title": title, "content": content}).json()[
            "id"
        ]
    )


def test_plan_reuses_matching_library_asset(login: Login, seeded: None) -> None:
    t = login("t@example.com")
    lid = _lesson(t, "The heart has four chambers. The left ventricle pumps blood to the body.")
    job = t.post(f"/api/v1/lessons/{lid}/ai/scene").json()
    assert job["status"] == "completed", job
    assert job["result"]["decision"] == "reuse_asset"
    scenes = t.get(f"/api/v1/lessons/{lid}/scenes").json()
    assert len(scenes) == 1 and scenes[0]["status"] == "draft"  # never auto-published
    spec = scenes[0]["spec"]
    assert spec["asset_refs"][0]["asset_id"] == DEMO_HEART_SLUG
    lv = next(c for c in spec["components"] if c["mesh_name"] == "left_ventricle")
    assert "left ventricle" in spec["explanations"][lv["explanation_ref"]].lower()


def test_plan_uses_procedural_generator(login: Login) -> None:
    t = login("t@example.com")
    lid = _lesson(t, "Planets orbit the Sun. Earth is the third planet.", "Solar system")
    job = t.post(f"/api/v1/lessons/{lid}/ai/scene").json()
    assert job["result"]["decision"] == "procedural"
    spec = t.get(f"/api/v1/lessons/{lid}/scenes").json()[0]["spec"]
    assert spec["procedural"][0]["generator"] == "solar_system"


def test_plan_suggests_generation_without_spending(login: Login) -> None:
    t = login("t@example.com")
    lid = _lesson(t, "Volcanoes form where magma reaches the surface.", "Volcanoes")
    job = t.post(f"/api/v1/lessons/{lid}/ai/scene").json()
    assert job["result"]["decision"] == "generate_asset"
    assert job["result"]["generation_prompt"]
    assert t.get(f"/api/v1/lessons/{lid}/scenes").json() == []
    assert t.get("/api/v1/assets").json() == []  # nothing generated automatically


def _plan(**kw: Any) -> ScenePlanLLM:
    base: dict[str, Any] = {
        "decision": "reuse_asset",
        "asset_id": "",
        "generator": "",
        "generator_params": [],
        "title": "T",
        "components": [],
        "generation_prompt": "",
        "rationale": "r",
    }
    return ScenePlanLLM(**{**base, **kw})


CAT = {
    "assets": [{"id": "heart_x", "version": 2, "parts": ["left_ventricle", "aorta"]}],
    "generators": [],
}


def test_convert_plan_rejects_unknown_asset_and_filters_parts() -> None:
    with pytest.raises(OutputRejectedError):
        convert_plan(_plan(asset_id="ghost"), CAT, "L")
    spec, _ = convert_plan(
        _plan(
            asset_id="heart_x",
            components=[
                SceneComponentLLM(mesh_name="aorta", label="Aorta", explanation="Main artery."),
                SceneComponentLLM(mesh_name="made_up", label="X", explanation="y"),
            ],
        ),
        CAT,
        "L",
    )
    assert spec is not None
    assert [c.mesh_name for c in spec.components] == ["aorta"]
    assert spec.asset_refs[0].version == 2


def test_convert_plan_clamps_generator_params() -> None:
    spec, _ = convert_plan(
        _plan(
            decision="procedural",
            generator="solar_system",
            generator_params=[
                GeneratorParamLLM(name="planet_count", value=50),
                GeneratorParamLLM(name="evil", value=1),
            ],
        ),
        CAT,
        "L",
    )
    assert spec is not None
    assert spec.procedural[0].params == {"planet_count": 8}


def test_generation_job_polls_then_stores_pending_version(login: Login) -> None:
    t = login("t@example.com")
    r = t.post(
        "/api/v1/assets/generation-jobs",
        json={"name": "Volcano", "prompt": "A cross-section of a volcano"},
    )
    assert r.status_code == 202, r.text
    job = t.get(f"/api/v1/jobs/{r.json()['job_id']}").json()
    assert job["status"] == "completed" and job["attempt_count"] == 2  # one pending poll
    asset = t.get(f"/api/v1/assets/{r.json()['asset']['id']}").json()
    assert asset["latest_version"] == 1 and asset["review_status"] == "pending"
    assert asset["provider"] == "fake" and "AI-generated" in asset["license_name"]


def test_generation_budget(login: Login, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.core.config import get_settings

    monkeypatch.setenv("EDU3D_THREE_D_MAX_GENERATIONS_PER_USER_PER_DAY", "1")
    get_settings.cache_clear()
    t = login("t@example.com")
    body = {"name": "A", "prompt": "A simple cube model"}
    assert t.post("/api/v1/assets/generation-jobs", json=body).status_code == 202
    r = t.post("/api/v1/assets/generation-jobs", json=body)
    assert r.status_code == 429
    assert len(t.get("/api/v1/assets").json()) == 1  # no orphan asset from the refused request


def test_unverified_provider_fails_cleanly(login: Login, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.core.config import get_settings

    monkeypatch.setenv("EDU3D_THREE_D_PROVIDER", "tripo")
    monkeypatch.setenv("EDU3D_TRIPO_API_KEY", "test-key")
    get_settings.cache_clear()
    t = login("t@example.com")
    r = t.post("/api/v1/assets/generation-jobs", json={"name": "A", "prompt": "A simple cube"})
    job = t.get(f"/api/v1/jobs/{r.json()['job_id']}").json()
    assert job["status"] == "failed" and job["error_code"] == "PROVIDER_ERROR"
    assert "verify" in job["error_message"]


def test_asset_search(login: Login, seeded: None) -> None:
    t = login("t@example.com")
    assert [a["slug"] for a in t.get("/api/v1/assets/search?q=heart chambers").json()] == [
        DEMO_HEART_SLUG
    ]
    assert t.get("/api/v1/assets/search?q=volcano").json() == []


def test_ai_scene_reports_origin_and_rationale(login: Login, seeded: None) -> None:
    t = login("t@example.com")
    lid = _lesson(t, "The heart has four chambers. The left ventricle pumps blood.")
    t.post(f"/api/v1/lessons/{lid}/ai/scene")
    scene = t.get(f"/api/v1/lessons/{lid}/scenes").json()[0]
    assert scene["origin"] == "ai" and scene["planning_rationale"]
