"""3D library + Blender MCP: AI-written build briefs and the "blender" 3D provider.

Blender itself is not available in CI, so the build step (`_build`) is replaced by a stub that
returns a real GLB; everything around it (task lifecycle, job polling, storage, library) is real.
"""

import time
from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.integrations.blender import provider as bp
from app.integrations.interfaces import LLMUsage, ProviderPermanentError, ProviderTaskStatus
from app.modules.operations import runner
from app.modules.three_d.mesh import MeshPart, box, write_glb

Login = Callable[..., TestClient]


def _glb() -> bytes:
    return write_glb(
        [
            MeshPart("left_ventricle", box(0.5, 0.5, 0.5), (0.8, 0.1, 0.1, 1.0)),
            MeshPart(
                "aorta arch", box(0.2, 0.6, 0.2), (0.9, 0.2, 0.2, 1.0), translation=(0, 0, 0.6)
            ),
        ]
    )


FINAL = (
    '{"title": "Heart", "parts": [{"name": "left_ventricle", "label": "Left ventricle", '
    '"description": "Pumps oxygen-rich blood to the body."}]}'
)


@pytest.fixture
def blender(monkeypatch: pytest.MonkeyPatch) -> dict[str, Any]:
    """The blender provider with Blender 'running' and the Claude build stubbed."""
    import threading

    # "gate": the build waits until the test opens it (deterministic, no sleep-based timing)
    gate = threading.Event()
    gate.set()
    state: dict[str, Any] = {"prompts": [], "delay": 0.0, "gate": gate}
    monkeypatch.setenv("EDU3D_ANTHROPIC_API_KEY", "test-key")
    from app.core.config import get_settings

    get_settings.cache_clear()

    async def fake_build(self: Any, task_id: str, prompt: str) -> Any:
        import asyncio

        state["prompts"].append(prompt)
        await asyncio.sleep(state["delay"])
        while not state["gate"].is_set():
            await asyncio.sleep(0.01)
        parts = bp.parts_metadata(["left_ventricle", "aorta arch"], FINAL)
        return _glb(), parts, LLMUsage("anthropic", "claude-opus-5-5", 1200, 800, "msg_1")

    monkeypatch.setattr(bp.BlenderMCPProvider, "_build", fake_build)
    monkeypatch.setattr(
        bp.BlenderMCPProvider, "health", lambda self: (True, "Blender is reachable.")
    )
    monkeypatch.setattr(runner, "INLINE_POLL_INTERVAL_S", 0.05)  # real value: 15 s
    bp.BlenderMCPProvider._runs.clear()
    return state


def _wait(t: TestClient, job_id: str, timeout: float = 10) -> dict[str, Any]:
    end = time.time() + timeout
    while time.time() < end:
        job: dict[str, Any] = t.get(f"/api/v1/jobs/{job_id}").json()
        if job["status"] in {"completed", "failed"}:
            return job
        time.sleep(0.05)
    raise AssertionError(f"job {job_id} did not finish")


# --------------------------------------------------------------- prompt drafts
def test_prompt_draft_writes_an_in_depth_brief(login: Login) -> None:
    t = login("t@example.com")
    r = t.post(
        "/api/v1/three-d/prompt-drafts",
        json={"topic": "human brain", "subject": "Biology", "level": "Year 9"},
    )
    assert r.status_code == 202, r.text
    job = r.json()
    assert job["status"] == "completed", job
    out = job["result"]
    assert out["title"] and "human brain" in out["prompt"]
    assert [p["name"] for p in out["parts"]] == ["outer_shell", "core", "support"]
    assert out["prompt_version"].startswith("three_d_prompt_draft@")

    s = login("s@example.com", "student")
    assert s.post("/api/v1/three-d/prompt-drafts", json={"topic": "x y"}).status_code == 403
    assert t.post("/api/v1/three-d/prompt-drafts", json={"topic": "x"}).status_code == 422


def test_prompt_draft_budget(login: Login, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.core.config import get_settings

    monkeypatch.setenv("EDU3D_THREE_D_MAX_GENERATIONS_PER_USER_PER_DAY", "1")
    get_settings.cache_clear()
    t = login("t@example.com")
    for _ in range(4):
        assert t.post("/api/v1/three-d/prompt-drafts", json={"topic": "cell"}).status_code == 202
    r = t.post("/api/v1/three-d/prompt-drafts", json={"topic": "cell"})
    assert r.status_code == 429 and r.json()["error"]["code"] == "PROMPT_DRAFT_BUDGET_EXCEEDED"


# ------------------------------------------------------------------- health
def test_provider_health(login: Login, monkeypatch: pytest.MonkeyPatch) -> None:
    t = login("t@example.com")
    assert t.get("/api/v1/three-d/provider-health?name=fake").json() == {
        "name": "fake",
        "ok": True,
        "message": "Ready.",
    }
    # No API key configured in tests → blender is not configured.
    assert t.get("/api/v1/three-d/provider-health?name=blender").json()["ok"] is False

    monkeypatch.setenv("EDU3D_ANTHROPIC_API_KEY", "test-key")
    monkeypatch.setenv("EDU3D_BLENDER_PORT", "1")  # nothing listens on port 1
    from app.core.config import get_settings

    get_settings.cache_clear()
    out = t.get("/api/v1/three-d/provider-health?name=blender").json()
    assert out["ok"] is False and "not reachable at localhost:1" in out["message"]
    assert "blender" in {p["name"] for p in t.get("/api/v1/three-d/providers").json()}


def test_dev_only_providers_cannot_be_picked_in_production() -> None:
    from app.core.config import Settings
    from app.integrations import providers

    prod = Settings(  # type: ignore[call-arg]
        environment="production",
        jwt_secret="x" * 40,
        cookie_secure=True,
        llm_provider="anthropic",
        anthropic_api_key="k",
        three_d_provider="llm",
        jobs_run_inline=False,
    )
    assert "blender" not in {p.name for p in providers.available("three_d", prod)}
    with pytest.raises(ValueError):
        providers.build_three_d(prod, "blender")


# ----------------------------------------------------------- provider logic
def test_parts_metadata_merges_claude_labels_with_exported_objects() -> None:
    parts = bp.parts_metadata(["left_ventricle", "aorta arch", "valve.001"], "Done!\n" + FINAL)
    assert parts == [
        {
            "name": "left_ventricle",
            "label": "Left ventricle",
            "description": "Pumps oxygen-rich blood to the body.",
        },
        {"name": "aorta_arch", "label": "aorta arch", "description": ""},
        {"name": "valve001", "label": "valve001", "description": ""},
    ]
    assert bp.parts_metadata(["a"], "not json")[0]["name"] == "a"


def test_code_tool_results_are_parsed_and_errors_raised() -> None:
    import asyncio

    class Text:
        def __init__(self, text: str) -> None:
            self.text = text

    class Result:
        def __init__(self, text: str, error: bool = False) -> None:
            self.content, self.is_error = [Text(text)], error  # mcp >= 2 field name

    class FakeMCP:
        def __init__(self, reply: Any) -> None:
            self.reply, self.calls = reply, []

        async def call_tool(self, name: str, args: dict[str, Any]) -> Any:
            self.calls.append((name, args))
            return self.reply

    p = bp.BlenderMCPProvider.__new__(bp.BlenderMCPProvider)
    ok = FakeMCP(Result('Code executed successfully: hi\nEDU3D_JSON:{"objects": ["a"]}\n'))
    assert asyncio.run(p._code(ok, "print(1)")) == {"objects": ["a"]}
    assert ok.calls[0][0] == "execute_blender_code"
    bad = FakeMCP(Result("Error executing code: NameError: x"))
    with pytest.raises(ProviderPermanentError, match="NameError"):
        asyncio.run(p._code(bad, "x"))


def test_export_script_targets_the_build_scene() -> None:
    code = bp._EXPORT.format(scene="edu3d_abc", path="out/m.glb", mark=bp.MARK)
    assert "win.scene = scene" in code and "export_apply=True" in code
    assert "use_active_scene=True" in code and "'out/m.glb'" in code
    compile(code, "<export>", "exec")
    compile(bp._SETUP.format(scene="s", mark=bp.MARK), "<setup>", "exec")
    compile(bp._CLEANUP.format(scene="s", previous="Scene"), "<cleanup>", "exec")


def test_create_task_refuses_when_blender_is_not_running(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.core.config import Settings
    from app.integrations import providers

    s = Settings(anthropic_api_key="k", blender_port=1)  # type: ignore[call-arg]
    p = providers.build_three_d(s, "blender")
    with pytest.raises(ProviderPermanentError, match="not reachable"):
        p.create_task(prompt="heart", idempotency_key="job-1")


# --------------------------------------------------------- end-to-end (API)
def test_blender_generation_lands_in_the_library(login: Login, blender: dict[str, Any]) -> None:
    t = login("t@example.com")
    draft = t.post("/api/v1/three-d/prompt-drafts", json={"topic": "human heart"}).json()
    r = t.post(
        "/api/v1/assets/generation-jobs",
        json={
            "name": draft["result"]["title"],
            "prompt": draft["result"]["prompt"],
            "provider": "blender",
        },
    )
    assert r.status_code == 202, r.text
    job = _wait(t, r.json()["job_id"])
    assert job["status"] == "completed", job
    assert blender["prompts"] == [draft["result"]["prompt"]]

    asset = t.get(f"/api/v1/assets/{job['result']['asset_id']}").json()
    assert asset["review_status"] == "pending" and asset["latest_version"] == 1
    meta = asset["versions"][0]["metadata_json"]
    assert sorted(meta["node_names"]) == ["aorta_arch", "left_ventricle"]
    assert meta["parts"][0]["label"] == "Left ventricle"
    assert any(a["id"] == asset["id"] for a in t.get("/api/v1/assets").json())


def test_slow_builds_are_polled_in_the_background(
    login: Login, blender: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    blender["gate"].clear()  # the build can't finish until we say so
    monkeypatch.setattr(runner, "INLINE_QUICK_POLLS", 0)
    t = login("t@example.com")
    r = t.post(
        "/api/v1/assets/generation-jobs",
        json={"name": "Heart", "prompt": "A human heart", "provider": "blender"},
    )
    assert r.status_code == 202  # returned while the build is still running
    assert t.get(f"/api/v1/jobs/{r.json()['job_id']}").json()["status"] == "retrying"
    blender["gate"].set()
    assert _wait(t, r.json()["job_id"])["status"] == "completed"


def test_failed_build_reports_the_reason(
    login: Login, blender: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    async def broken(self: Any, task_id: str, prompt: str) -> Any:
        raise ProviderPermanentError("Blender reported an error: NameError: bmesh")

    monkeypatch.setattr(bp.BlenderMCPProvider, "_build", broken)
    t = login("t@example.com")
    r = t.post(
        "/api/v1/assets/generation-jobs",
        json={"name": "Heart", "prompt": "A human heart", "provider": "blender"},
    )
    job = _wait(t, r.json()["job_id"])
    assert job["status"] == "failed" and "NameError: bmesh" in job["error_message"]
    assert bp.BlenderMCPProvider._runs == {} or all(
        run.status == ProviderTaskStatus.FAILED for run in bp.BlenderMCPProvider._runs.values()
    )


def test_long_ai_written_prompts_are_accepted(login: Login, blender: dict[str, Any]) -> None:
    """Regression: a 6,000-character brief used to overflow the 5,000-character description."""
    t = login("t@example.com")
    brief = "1. Parts: `left_ventricle` - pumps blood. " * 150
    assert 5000 < len(brief) <= 8000
    r = t.post(
        "/api/v1/assets/generation-jobs",
        json={"name": "Heart", "prompt": brief, "provider": "blender"},
    )
    assert r.status_code == 202, r.text
    job = _wait(t, r.json()["job_id"])
    assert job["status"] == "completed", job
    assert blender["prompts"] == [brief]  # Blender gets the full prompt
    asset = t.get(f"/api/v1/assets/{job['result']['asset_id']}").json()
    assert len(asset["description"]) == 5000 and asset["description"].endswith("…")


def test_root_cause_unwraps_exception_groups() -> None:
    inner = AttributeError("'CallToolResult' object has no attribute 'x'")
    group = ExceptionGroup("outer", [ExceptionGroup("inner", [inner])])
    assert bp._root_cause(group) is inner
    assert bp._root_cause(inner) is inner


# ------------------------------------------------- 3D viewer: part deep dive
def _library_asset(t: TestClient, blender: dict[str, Any]) -> str:
    r = t.post(
        "/api/v1/assets/generation-jobs",
        json={"name": "Heart", "prompt": "A human heart", "provider": "blender"},
    )
    job = _wait(t, r.json()["job_id"])
    assert job["status"] == "completed", job
    asset_id: str = job["result"]["asset_id"]
    return asset_id


def test_part_deep_dive_card_is_generated_then_cached(
    login: Login, blender: dict[str, Any], db: Any
) -> None:
    from app.modules.ai_engine.models import AIUsageRecord

    t = login("t@example.com")
    asset_id = _library_asset(t, blender)
    used_before = db.query(AIUsageRecord).count()

    r = t.post(f"/api/v1/assets/{asset_id}/ai/part-deep-dive", json={"part": "left_ventricle"})
    assert r.status_code == 202, r.text
    job = r.json()
    assert job["status"] == "completed", job
    card = job["result"]["card"]
    assert job["result"]["cached"] is False
    assert card["summary"] and card["function"] and card["check_question"]
    # Connections only to parts that exist in this model (the fake also invents "not_a_part").
    assert [c["part"] for c in card["connections"]] == ["aorta_arch"]

    # Saved with the model: visible on the asset and free the second time.
    meta = t.get(f"/api/v1/assets/{asset_id}").json()["versions"][0]["metadata_json"]
    assert meta["insights"]["left_ventricle"]["summary"] == card["summary"]
    again = t.post(f"/api/v1/assets/{asset_id}/ai/part-deep-dive", json={"part": "left_ventricle"})
    assert again.json()["result"] == {"part": "left_ventricle", "card": card, "cached": True}
    assert db.query(AIUsageRecord).count() == used_before + 1


def test_part_deep_dive_validation_and_access(login: Login, blender: dict[str, Any]) -> None:
    t = login("t@example.com")
    asset_id = _library_asset(t, blender)
    url = f"/api/v1/assets/{asset_id}/ai/part-deep-dive"
    assert t.post(url, json={"part": "spleen"}).status_code == 404  # not in this model
    assert login("other@example.com").post(url, json={"part": "left_ventricle"}).status_code == 404
    assert login("s@example.com", "student").post(url, json={"part": "x"}).status_code == 403


def test_teacher_edits_part_text_in_the_studio(login: Login, blender: dict[str, Any]) -> None:
    t = login("t@example.com")
    asset_id = _library_asset(t, blender)
    url = f"/api/v1/assets/{asset_id}/parts"
    r = t.patch(
        f"{url}/aorta_arch",
        json={"label": "Aortic arch", "description": "  Curves over the heart.  "},
    )
    assert r.status_code == 200, r.text
    parts = {p["name"]: p for p in r.json()["versions"][0]["metadata_json"]["parts"]}
    assert parts["aorta_arch"] == {
        "name": "aorta_arch",
        "label": "Aortic arch",
        "description": "Curves over the heart.",
        "source": "teacher",
        "reviewed": True,
    }
    assert parts["left_ventricle"]["label"] == "Left ventricle"  # others untouched

    assert (
        t.patch(f"{url}/left_ventricle", json={"description": "Pumps blood."}).json()["versions"][
            0
        ]["metadata_json"]["parts"][0]["label"]
        == "Left ventricle"
    )  # label kept when only the text changes
    assert t.patch(f"{url}/spleen", json={"label": "x"}).status_code == 404
    assert (
        login("other@example.com").patch(f"{url}/aorta_arch", json={"label": "x"}).status_code
        == 404
    )


def test_generated_model_can_be_used_in_a_lesson(login: Login, blender: dict[str, Any]) -> None:
    """Studio "Use in a lesson": same spec shape as the frontend's specFromAsset."""
    from tests.helpers import create_course

    t = login("t@example.com")
    asset = t.get(f"/api/v1/assets/{_library_asset(t, blender)}").json()
    t.post(f"/api/v1/assets/{asset['id']}/review", json={"decision": "approved"})
    cid = create_course(t)
    ch = t.post(f"/api/v1/courses/{cid}/chapters", json={"title": "Heart"}).json()["id"]
    lid = t.post(f"/api/v1/chapters/{ch}/lessons", json={"title": "L"}).json()["id"]
    parts = asset["versions"][0]["metadata_json"]["parts"]
    spec = {
        "schema_version": "1.0",
        "scene_id": "studio_use_in_lesson",
        "title": asset["name"],
        "asset_refs": [{"asset_id": asset["slug"], "version": 1}],
        "camera": {"preset": "three_quarter", "min_distance": 2, "max_distance": 12},
        "components": [
            {
                "component_id": p["name"],
                "mesh_name": p["name"],
                "label": p["label"],
                "actions": ["highlight", "show_explanation"],
                **({"explanation_ref": f"exp_{p['name']}"} if p["description"] else {}),
            }
            for p in parts
        ],
        "controls": ["rotate", "zoom", "select_component"],
        "explanations": {f"exp_{p['name']}": p["description"] for p in parts if p["description"]},
    }
    r = t.post(f"/api/v1/lessons/{lid}/scenes", json={"spec": spec})
    assert r.status_code == 201, r.text
    assert r.json()["spec"]["asset_refs"][0]["asset_id"] == asset["slug"]


def test_guided_tour_narration_is_ordered_complete_and_cached(
    login: Login, blender: dict[str, Any], db: Any
) -> None:
    from app.modules.ai_engine.models import AIUsageRecord

    t = login("t@example.com")
    asset_id = _library_asset(t, blender)
    before = db.query(AIUsageRecord).count()
    job = t.post(f"/api/v1/assets/{asset_id}/ai/tour").json()
    assert job["status"] == "completed", job
    tour = job["result"]["tour"]
    assert tour["intro"]
    # The AI's order is kept (the fake reverses), invented parts dropped, every real part once.
    nodes = t.get(f"/api/v1/assets/{asset_id}").json()["versions"][0]["metadata_json"]["node_names"]
    assert [s["part"] for s in tour["steps"]] == list(reversed(nodes))
    assert all(s["connection"] for s in tour["steps"])

    meta = t.get(f"/api/v1/assets/{asset_id}").json()["versions"][0]["metadata_json"]
    assert meta["tour"]["steps"] == tour["steps"]
    again = t.post(f"/api/v1/assets/{asset_id}/ai/tour").json()
    assert again["result"]["cached"] is True
    assert db.query(AIUsageRecord).count() == before + 1  # second request was free

    assert login("other@example.com").post(f"/api/v1/assets/{asset_id}/ai/tour").status_code == 404


# ------------------------------------------- part descriptions + review (3D library)
def test_generation_writes_missing_descriptions_as_drafts(
    login: Login, blender: dict[str, Any]
) -> None:
    t = login("t@example.com")
    asset_id = _library_asset(t, blender)
    parts = {
        p["name"]: p
        for p in t.get(f"/api/v1/assets/{asset_id}").json()["versions"][0]["metadata_json"]["parts"]
    }
    # Claude wrote one in Blender; the other was missing and was written right after generation.
    assert parts["left_ventricle"]["description"] == "Pumps oxygen-rich blood to the body."
    assert parts["aorta_arch"]["description"] == "The aorta_arch has a job in this model."
    assert all(p["source"] == "ai" and p["reviewed"] is False for p in parts.values())
    assert "invented_part" not in parts


def test_write_missing_descriptions_then_approve_all(login: Login) -> None:
    from app.modules.three_d.demo_heart import build_heart_glb

    t = login("t@example.com")
    data = build_heart_glb()
    a = t.post("/api/v1/assets", json={"name": "Heart", "license_name": "CC0"}).json()
    up = t.post(
        f"/api/v1/assets/{a['id']}/versions/upload-url", json={"size_bytes": len(data)}
    ).json()
    t.put(up["url"], content=data, headers=up["headers"])
    t.post(f"/api/v1/assets/{a['id']}/versions/1/complete")
    nodes = t.get(f"/api/v1/assets/{a['id']}").json()["versions"][0]["metadata_json"]["node_names"]

    # A teacher writes one text first; AI must never overwrite it.
    t.patch(f"/api/v1/assets/{a['id']}/parts/{nodes[0]}", json={"description": "Teacher text."})
    job = t.post(f"/api/v1/assets/{a['id']}/ai/part-descriptions").json()
    assert job["status"] == "completed", job
    assert job["result"] == {"written": len(nodes) - 1, "missing": 0}
    parts = {
        p["name"]: p
        for p in t.get(f"/api/v1/assets/{a['id']}").json()["versions"][0]["metadata_json"]["parts"]
    }
    assert parts[nodes[0]]["description"] == "Teacher text." and parts[nodes[0]]["reviewed"] is True
    assert all(parts[n]["source"] == "ai" and not parts[n]["reviewed"] for n in nodes[1:])
    assert t.post(f"/api/v1/assets/{a['id']}/ai/part-descriptions").json()["result"]["written"] == 0

    # "Approve all": approving the model marks every description reviewed.
    r = t.post(f"/api/v1/assets/{a['id']}/review", json={"decision": "approved"})
    assert r.status_code == 200
    final = t.get(f"/api/v1/assets/{a['id']}").json()["versions"][0]["metadata_json"]["parts"]
    assert all(p["reviewed"] is True for p in final)

    assert (
        login("other@example.com")
        .post(f"/api/v1/assets/{a['id']}/ai/part-descriptions")
        .status_code
        == 404
    )


# ----------------------------------------------- 3D library "In progress" list
def test_in_progress_list_shows_running_then_ready(
    login: Login, blender: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    blender["gate"].clear()
    monkeypatch.setattr(runner, "INLINE_QUICK_POLLS", 0)
    t = login("t@example.com")
    r = t.post(
        "/api/v1/assets/generation-jobs",
        json={"name": "Heart", "prompt": "A human heart", "provider": "blender"},
    ).json()
    rows = t.get("/api/v1/assets/generation-jobs").json()  # not swallowed by /assets/{asset_id}
    assert [(x["asset_name"], x["status"], x["provider"]) for x in rows] == [
        ("Heart", "retrying", "blender")
    ]
    assert rows[0]["prompt_preview"] == "A human heart" and rows[0]["has_model"] is False

    blender["gate"].set()
    _wait(t, r["job_id"])
    done = t.get("/api/v1/assets/generation-jobs").json()
    assert done[0]["status"] == "completed" and done[0]["has_model"] is True
    assert login("other@example.com").get("/api/v1/assets/generation-jobs").json() == []


def test_failed_generation_is_listed_and_retry_reuses_the_entry(
    login: Login, blender: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    calls = {"n": 0}
    original = bp.BlenderMCPProvider._build

    async def flaky(self: Any, task_id: str, prompt: str) -> Any:
        calls["n"] += 1
        if calls["n"] == 1:
            raise ProviderPermanentError("Blender reported an error: NameError: bmesh")
        return await original(self, task_id, prompt)

    monkeypatch.setattr(bp.BlenderMCPProvider, "_build", flaky)
    t = login("t@example.com")
    r = t.post(
        "/api/v1/assets/generation-jobs",
        json={"name": "Heart", "prompt": "A human heart", "provider": "blender"},
    ).json()
    asset_id = r["asset"]["id"]
    assert _wait(t, r["job_id"])["status"] == "failed"
    failed = t.get("/api/v1/assets/generation-jobs").json()
    assert failed[0]["status"] == "failed" and "NameError: bmesh" in failed[0]["error_message"]

    retry = t.post(f"/api/v1/assets/{asset_id}/generation-jobs/retry")
    assert retry.status_code == 202, retry.text
    assert _wait(t, retry.json()["id"])["status"] == "completed"
    rows = t.get("/api/v1/assets/generation-jobs").json()
    assert len(rows) == 1 and rows[0]["status"] == "completed"  # the retry replaced the failure
    assert t.get(f"/api/v1/assets/{asset_id}").json()["latest_version"] == 1  # same library entry

    assert (
        login("other@example.com")
        .post(f"/api/v1/assets/{asset_id}/generation-jobs/retry")
        .status_code
        == 404
    )


# ------------------------------------------------------- saved prompt drafts
def test_ai_prompts_are_saved_reusable_and_editable(login: Login) -> None:
    t = login("t@example.com")
    job = t.post(
        "/api/v1/three-d/prompt-drafts", json={"topic": "Human brain", "level": "Year 9"}
    ).json()
    draft_id = job["result"]["draft_id"]
    t.post("/api/v1/three-d/prompt-drafts", json={"topic": "Plant cell"})

    saved = t.get("/api/v1/three-d/prompt-drafts").json()
    assert [d["topic"] for d in saved] == ["Plant cell", "Human brain"]  # newest first
    brain = t.get("/api/v1/three-d/prompt-drafts?topic=brain").json()
    assert [d["id"] for d in brain] == [draft_id]
    assert brain[0]["prompt"] == job["result"]["prompt"] and brain[0]["level"] == "Year 9"
    assert brain[0]["parts"] and brain[0]["edited"] is False

    r = t.patch(
        f"/api/v1/three-d/prompt-drafts/{draft_id}",
        json={"prompt": "Edited brief: show the four lobes."},
    )
    assert r.status_code == 200 and r.json()["edited"] is True
    assert (
        t.get("/api/v1/three-d/prompt-drafts?topic=brain").json()[0]["prompt"]
        == "Edited brief: show the four lobes."
    )

    other = login("other@example.com")
    assert other.get("/api/v1/three-d/prompt-drafts").json() == []
    assert (
        other.patch(f"/api/v1/three-d/prompt-drafts/{draft_id}", json={"title": "x"}).status_code
        == 404
    )
    assert other.delete(f"/api/v1/three-d/prompt-drafts/{draft_id}").status_code == 404
    assert t.delete(f"/api/v1/three-d/prompt-drafts/{draft_id}").status_code == 204
    assert t.get("/api/v1/three-d/prompt-drafts?topic=brain").json() == []


# ------------------------------------------- Chapter Studio: save into the lesson
def test_generated_model_is_saved_into_the_lesson_instantly(
    login: Login, blender: dict[str, Any]
) -> None:
    from tests.helpers import create_course

    t = login("t@example.com")
    cid = create_course(t)
    ch = t.post(f"/api/v1/courses/{cid}/chapters", json={"title": "Heart"}).json()["id"]
    lid = t.post(f"/api/v1/chapters/{ch}/lessons", json={"title": "The heart"}).json()["id"]

    r = t.post(
        "/api/v1/assets/generation-jobs",
        json={"name": "Heart", "prompt": "A human heart", "provider": "blender", "lesson_id": lid},
    )
    assert r.status_code == 202, r.text
    job = _wait(t, r.json()["job_id"])
    assert job["status"] == "completed" and job["result"]["scene_id"], job["result"]

    scenes = t.get(f"/api/v1/lessons/{lid}/scenes").json()
    assert [s["id"] for s in scenes] == [job["result"]["scene_id"]]
    assert scenes[0]["status"] == "draft"  # saved, not published
    labels = {c["mesh_name"]: c["label"] for c in scenes[0]["spec"]["components"]}
    assert labels["left_ventricle"] == "Left ventricle"
    asset = t.get(f"/api/v1/assets/{job['result']['asset_id']}").json()
    assert asset["review_status"] == "approved"
    parts = asset["versions"][0]["metadata_json"]["parts"]
    assert all(p["reviewed"] is False for p in parts)  # descriptions still to review

    row = t.get("/api/v1/assets/generation-jobs").json()[0]
    assert row["lesson_title"] == "The heart" and row["scene_id"] == job["result"]["scene_id"]

    other = login("other@example.com")
    denied = other.post(
        "/api/v1/assets/generation-jobs",
        json={"name": "X", "prompt": "A human heart", "provider": "blender", "lesson_id": lid},
    )
    assert denied.status_code in (403, 404)


def test_dismiss_removes_a_failed_build_and_its_empty_entry(
    login: Login, blender: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    async def broken(self: Any, task_id: str, prompt: str) -> Any:
        raise ProviderPermanentError("Blender reported an error: NameError: bmesh")

    monkeypatch.setattr(bp.BlenderMCPProvider, "_build", broken)
    t = login("t@example.com")
    r = t.post(
        "/api/v1/assets/generation-jobs",
        json={"name": "Heart", "prompt": "A human heart", "provider": "blender"},
    ).json()
    _wait(t, r["job_id"])
    assert t.get("/api/v1/assets/generation-jobs").json()[0]["status"] == "failed"

    other = login("other@example.com")
    assert other.post(f"/api/v1/assets/generation-jobs/{r['job_id']}/dismiss").status_code == 404
    assert t.post(f"/api/v1/assets/generation-jobs/{r['job_id']}/dismiss").status_code == 204
    assert t.get("/api/v1/assets/generation-jobs").json() == []
    assert t.get(f"/api/v1/assets/{r['asset']['id']}").status_code == 404  # empty entry removed
