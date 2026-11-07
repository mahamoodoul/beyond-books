import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.modules.three_d.seed import DEMO_HEART_SLUG, seed_demo_heart
from tests.helpers import create_course

Login = Callable[..., TestClient]
FIX = Path(__file__).resolve().parents[2] / "packages" / "three-d-contracts" / "fixtures"
HEART = "The heart has four chambers. The left ventricle pumps blood to the body."


def _chapter(t: TestClient, lessons: list[tuple[str, str]]) -> tuple[str, list[str]]:
    cid = create_course(t)
    ch = t.post(f"/api/v1/courses/{cid}/chapters", json={"title": "Circulation"}).json()["id"]
    ids = []
    for title, body in lessons:
        content: dict[str, Any] = (
            {"sections": [{"title": title, "body_markdown": body}]} if body else {}
        )
        ids.append(
            t.post(
                f"/api/v1/chapters/{ch}/lessons", json={"title": title, "content": content}
            ).json()["id"]
        )
    return ch, ids


def _heart_spec() -> dict[str, Any]:
    spec: dict[str, Any] = json.loads((FIX / "scene_heart_01.json").read_text())
    spec["asset_refs"] = [{"asset_id": DEMO_HEART_SLUG, "version": 1}]
    spec["animation_refs"] = []
    return spec


@pytest.fixture
def seeded(db: Session) -> None:
    seed_demo_heart(db)


def test_chapter_board_and_bulk_generation(login: Login, seeded: None) -> None:
    t = login("t@example.com")
    ch, (heart, solar, empty) = _chapter(
        t, [("The heart", HEART), ("Planets", "Planets orbit the Sun."), ("Empty", "")]
    )
    t.post(f"/api/v1/lessons/{heart}/scenes", json={"spec": _heart_spec()})

    r = t.post(f"/api/v1/chapters/{ch}/ai/scenes", json={"only_missing": True})
    assert r.status_code == 202, r.text
    items = {i["lesson_title"]: i for i in r.json()["items"]}
    assert items["The heart"]["status"] == "skipped" and "already" in items["The heart"]["reason"]
    assert items["Empty"]["status"] == "skipped" and "no content" in items["Empty"]["reason"]
    assert items["Planets"]["job_id"] and items["Planets"]["status"] == "completed"

    board = t.get(f"/api/v1/chapters/{ch}/scenes").json()
    by_lesson = {b["lesson_title"]: b for b in board}
    assert set(by_lesson) == {"The heart", "Planets"}
    assert by_lesson["The heart"]["parts"] == 4 and by_lesson["The heart"]["explained"] == 4
    assert by_lesson["Planets"]["scene"]["origin"] == "ai"
    assert all(b["scene"]["status"] == "draft" for b in board)  # never auto-published

    again = t.post(f"/api/v1/chapters/{ch}/ai/scenes", json={"only_missing": False}).json()["items"]
    assert sum(1 for i in again if i["job_id"]) == 2  # regenerates for both lessons with content


def test_bulk_generation_stops_at_budget(login: Login, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.core.config import get_settings

    monkeypatch.setenv("EDU3D_AI_MAX_JOBS_PER_COURSE_PER_DAY", "1")
    get_settings.cache_clear()
    t = login("t@example.com")
    ch, _ = _chapter(t, [("A", "Planets orbit the Sun."), ("B", "Atoms have electrons.")])
    items = t.post(f"/api/v1/chapters/{ch}/ai/scenes", json={}).json()["items"]
    assert items[0]["job_id"] and items[1]["status"] == "skipped"
    assert "limit" in items[1]["reason"]


def test_duplicate_and_available_parts(login: Login, seeded: None) -> None:
    t = login("t@example.com")
    _, (heart,) = _chapter(t, [("The heart", HEART)])
    spec = _heart_spec()
    spec["components"] = spec["components"][:2]  # use 2 of the 5 model parts
    scene = t.post(f"/api/v1/lessons/{heart}/scenes", json={"spec": spec}).json()

    parts = t.get(f"/api/v1/scenes/{scene['id']}/available-parts").json()
    names = {p["mesh_name"]: p for p in parts}
    assert set(names) == {
        "aorta",
        "left_atrium",
        "left_ventricle",
        "right_atrium",
        "right_ventricle",
    }
    assert sum(p["in_scene"] for p in parts) == 2 and all(
        p["source"] == DEMO_HEART_SLUG for p in parts
    )

    dup = t.post(f"/api/v1/scenes/{scene['id']}/duplicate")
    assert dup.status_code == 201
    d = dup.json()
    assert d["id"] != scene["id"] and d["title"].endswith("(copy)") and d["status"] == "draft"
    assert d["spec"]["scene_id"] != scene["spec"]["scene_id"]
    assert len(t.get(f"/api/v1/lessons/{heart}/scenes").json()) == 2


def test_chapter_studio_access(login: Login, seeded: None) -> None:
    t = login("t@example.com")
    other = login("o@example.com")
    student = login("s@example.com", "student")
    ch, (heart,) = _chapter(t, [("The heart", HEART)])
    sid = t.post(f"/api/v1/lessons/{heart}/scenes", json={"spec": _heart_spec()}).json()["id"]
    for c in (other, student):
        assert c.get(f"/api/v1/chapters/{ch}/scenes").status_code in (403, 404)
        assert c.post(f"/api/v1/chapters/{ch}/ai/scenes", json={}).status_code in (403, 404)
        assert c.get(f"/api/v1/scenes/{sid}/available-parts").status_code in (403, 404)
        assert c.post(f"/api/v1/scenes/{sid}/duplicate").status_code in (403, 404)
