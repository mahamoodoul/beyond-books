import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.modules.ai_engine.animation_planning import convert_animation
from app.modules.ai_engine.schemas import AnimationPlanLLM, AnimationStepLLM
from app.modules.ai_engine.validation import OutputRejectedError
from app.modules.three_d.contracts import SceneSpec
from app.modules.three_d.seed import DEMO_HEART_SLUG, seed_demo_heart
from tests.helpers import create_course

Login = Callable[..., TestClient]
FIX = Path(__file__).resolve().parents[2] / "packages" / "three-d-contracts" / "fixtures"


def _fixture(name: str) -> dict[str, Any]:
    data: dict[str, Any] = json.loads((FIX / name).read_text())
    return data


@pytest.fixture
def seeded(db: Session) -> None:
    seed_demo_heart(db)


def _scene(t: TestClient, publish_lesson: bool = False) -> tuple[str, str, str]:
    cid = create_course(t)
    ch = t.post(f"/api/v1/courses/{cid}/chapters", json={"title": "Heart"}).json()["id"]
    content = {
        "sections": [
            {
                "title": "Heart",
                "body_markdown": "Blood enters the right atrium. The left ventricle pumps blood.",
            }
        ]
    }
    lid = t.post(f"/api/v1/chapters/{ch}/lessons", json={"title": "L", "content": content}).json()[
        "id"
    ]
    if publish_lesson:
        t.patch(f"/api/v1/courses/{cid}", json={"status": "published"})
        t.patch(f"/api/v1/chapters/{ch}", json={"status": "published"})
        t.post(f"/api/v1/lessons/{lid}/publish")
    spec = _fixture("scene_heart_01.json")
    spec["asset_refs"] = [{"asset_id": DEMO_HEART_SLUG, "version": 1}]
    spec["animation_refs"] = []
    sid = t.post(f"/api/v1/lessons/{lid}/scenes", json={"spec": spec}).json()["id"]
    return cid, lid, sid


def test_animation_crud_adds_ref_and_publishes_with_scene(login: Login, seeded: None) -> None:
    t = login("t@example.com")
    s = login("s@example.com", "student")
    cid, _, sid = _scene(t, publish_lesson=True)
    t.post(f"/api/v1/courses/{cid}/enrollments", json={"student_email": "s@example.com"})
    r = t.post(
        f"/api/v1/scenes/{sid}/animations", json={"spec": _fixture("animation_blood_flow_01.json")}
    )
    assert r.status_code == 201, r.text
    assert t.get(f"/api/v1/scenes/{sid}").json()["spec"]["animation_refs"] == ["blood_flow_01"]

    assert t.post(f"/api/v1/scenes/{sid}/publish").status_code == 200
    resolved = s.get(f"/api/v1/scenes/{sid}/resolved").json()
    assert [a["animation_id"] for a in resolved["animations"]] == ["blood_flow_01"]

    # Editing after publish does not change what students play.
    anim = r.json()
    new = anim["spec"]
    new["title"] = "Changed"
    t.patch(f"/api/v1/animations/{anim['id']}", json={"expected_version": 1, "spec": new})
    assert (
        s.get(f"/api/v1/scenes/{sid}/resolved").json()["animations"][0]["title"]
        == "Blood flow through the heart"
    )


def test_animation_rejects_unknown_targets_and_paths(login: Login, seeded: None) -> None:
    t = login("t@example.com")
    _, _, sid = _scene(t)
    bad = _fixture("animation_blood_flow_01.json")
    bad["steps"][1]["target_component"] = "aorta_ghost"
    r = t.post(f"/api/v1/scenes/{sid}/animations", json={"spec": bad})
    assert r.status_code == 422 and r.json()["error"]["code"] == "ANIMATION_INVALID"
    bad = _fixture("animation_blood_flow_01.json")
    bad["steps"][4]["path_id"] = "nowhere"
    assert t.post(f"/api/v1/scenes/{sid}/animations", json={"spec": bad}).status_code == 422


def test_publish_fails_if_scene_edit_breaks_animation(login: Login, seeded: None) -> None:
    t = login("t@example.com")
    _, _, sid = _scene(t)
    t.post(
        f"/api/v1/scenes/{sid}/animations", json={"spec": _fixture("animation_blood_flow_01.json")}
    )
    scene = t.get(f"/api/v1/scenes/{sid}").json()
    spec = scene["spec"]
    spec["components"] = [c for c in spec["components"] if c["component_id"] != "right_atrium"]
    t.patch(f"/api/v1/scenes/{sid}", json={"expected_version": scene["version"], "spec": spec})
    r = t.post(f"/api/v1/scenes/{sid}/publish")
    assert r.status_code == 422 and "right_atrium" in json.dumps(r.json())


def test_delete_animation_removes_ref(login: Login, seeded: None) -> None:
    t = login("t@example.com")
    _, _, sid = _scene(t)
    aid = t.post(
        f"/api/v1/scenes/{sid}/animations", json={"spec": _fixture("animation_blood_flow_01.json")}
    ).json()["id"]
    assert t.delete(f"/api/v1/animations/{aid}").status_code == 204
    assert t.get(f"/api/v1/scenes/{sid}").json()["spec"]["animation_refs"] == []


def test_ai_animation_planning(login: Login, seeded: None) -> None:
    t = login("t@example.com")
    _, _, sid = _scene(t)
    job = t.post(f"/api/v1/scenes/{sid}/ai/animation").json()
    assert job["status"] == "completed", job
    anims = t.get(f"/api/v1/scenes/{sid}/animations").json()
    assert len(anims) == 1 and anims[0]["origin"] == "ai" and anims[0]["problems"] == []
    assert anims[0]["spec"]["steps"][0]["action"] == "camera_focus"


def test_other_teacher_cannot_touch_animations(login: Login, seeded: None) -> None:
    t = login("t@example.com")
    other = login("o@example.com")
    _, _, sid = _scene(t)
    aid = t.post(
        f"/api/v1/scenes/{sid}/animations", json={"spec": _fixture("animation_blood_flow_01.json")}
    ).json()["id"]
    assert other.get(f"/api/v1/scenes/{sid}/animations").status_code == 404
    assert other.delete(f"/api/v1/animations/{aid}").status_code == 404
    assert other.post(f"/api/v1/scenes/{sid}/ai/animation").status_code == 404


def _neutral(**kw: Any) -> AnimationStepLLM:
    base: dict[str, Any] = {
        "target_component": "",
        "duration_ms": 2000,
        "explanation": "x",
        "visible": True,
        "opacity": 1.0,
        "axis": "y",
        "degrees": 0.0,
        "path_id": "",
    }
    return AnimationStepLLM(**{**base, **kw})


def test_convert_animation_drops_invalid_steps_and_clamps() -> None:
    scene = SceneSpec.model_validate({**_fixture("scene_heart_01.json"), "animation_refs": []})
    plan = AnimationPlanLLM(
        title="Tour",
        steps=[
            _neutral(action="highlight_component", target_component="ghost"),
            _neutral(action="set_opacity", target_component="left_ventricle", opacity=7),
            _neutral(
                action="show_flow_particles", target_component="right_ventricle", path_id="nope"
            ),
            _neutral(action="wait", duration_ms=10**9),
        ],
    )
    anim = convert_animation(plan, scene, set())
    assert [s.action for s in anim.steps] == ["set_opacity", "wait"]
    assert anim.steps[0].opacity == 1.0  # type: ignore[union-attr]
    assert anim.steps[1].duration_ms == 30_000
    with pytest.raises(OutputRejectedError):
        convert_animation(
            AnimationPlanLLM(
                title="x", steps=[_neutral(action="camera_focus", target_component="ghost")]
            ),
            scene,
            set(),
        )
