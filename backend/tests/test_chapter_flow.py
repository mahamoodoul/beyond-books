"""Chapter studio flow: chapter prompt, source text, generate everything, publish chapter."""

from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.modules.ai_engine import workflows
from app.modules.ai_engine.fake import FakeLLMProvider
from app.modules.three_d.seed import seed_demo_heart
from tests.helpers import HEART_PAGES, create_course, make_pdf, upload_and_complete

Login = Callable[..., TestClient]
PROMPT = "Grade 8 students. Use a football-training analogy. Keep sentences short."


class _Recording(FakeLLMProvider):
    tasks: list[str] = []

    def generate_structured[T: BaseModel](self, **kw: Any) -> Any:
        _Recording.tasks.append(kw["task"])
        return super().generate_structured(**kw)


@pytest.fixture
def recorded(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    _Recording.tasks = []
    monkeypatch.setattr(workflows, "get_llm_provider", lambda: _Recording())
    return _Recording.tasks


def _chapter_with_source(t: TestClient) -> tuple[str, str]:
    cid = create_course(t)
    doc = upload_and_complete(t, cid, make_pdf(HEART_PAGES))["document"]["id"]
    ch = t.post(
        f"/api/v1/courses/{cid}/chapters",
        json={
            "title": "The heart",
            "source_refs": [{"document_id": doc, "page_start": 1, "page_end": len(HEART_PAGES)}],
        },
    ).json()["id"]
    return cid, ch


def test_chapter_prompt_is_saved_and_steers_every_generation(
    login: Login, recorded: list[str]
) -> None:
    t = login("t@example.com")
    _, ch = _chapter_with_source(t)

    r = t.patch(f"/api/v1/chapters/{ch}", json={"ai_instructions": f"  {PROMPT}  "})
    assert r.status_code == 200, r.text
    assert t.get(f"/api/v1/chapters/{ch}").json()["ai_instructions"] == PROMPT

    lesson = t.post(f"/api/v1/chapters/{ch}/ai/lesson").json()
    assert lesson["status"] == "completed", lesson
    quiz = t.post(f"/api/v1/chapters/{ch}/ai/assessment").json()
    assert quiz["status"] == "completed", quiz
    scenes = t.post(f"/api/v1/chapters/{ch}/ai/scenes", json={}).json()["items"]
    assert scenes[0]["status"] == "completed", scenes

    assert len(recorded) == 3
    assert all("Teacher's instructions" in task and PROMPT in task for task in recorded)

    # Clearing the prompt removes it from later generations.
    t.patch(f"/api/v1/chapters/{ch}", json={"ai_instructions": ""})
    t.post(f"/api/v1/chapters/{ch}/ai/lesson")
    assert PROMPT not in recorded[-1]


def test_chapter_source_text(login: Login) -> None:
    t = login("t@example.com")
    _, ch = _chapter_with_source(t)
    src = t.get(f"/api/v1/chapters/{ch}/source").json()
    assert src["strategy"] == "chapter_page_ranges" and src["passages"]
    assert src["characters"] == sum(len(p["text"]) for p in src["passages"])
    assert src["passages"][0]["document_title"]

    empty = t.post(f"/api/v1/courses/{create_course(t)}/chapters", json={"title": "X"}).json()
    assert t.get(f"/api/v1/chapters/{empty['id']}/source").json() == {
        "strategy": "none",
        "truncated": False,
        "characters": 0,
        "passages": [],
    }

    other = login("other@example.com")
    assert other.get(f"/api/v1/chapters/{ch}/source").status_code in (403, 404)


def test_publish_chapter_makes_everything_visible_under_the_course(
    login: Login, db: Session
) -> None:
    seed_demo_heart(db)  # the AI scene plan picks the library heart model
    t = login("t@example.com")
    s = login("s@example.com", "student")
    cid, ch = _chapter_with_source(t)
    t.patch(f"/api/v1/chapters/{ch}", json={"ai_instructions": PROMPT})
    lesson_id = t.post(f"/api/v1/chapters/{ch}/ai/lesson").json()["result"]["lesson_id"]
    quiz_id = t.post(f"/api/v1/chapters/{ch}/ai/assessment").json()["result"]["assessment_id"]
    plan = t.post(f"/api/v1/chapters/{ch}/ai/scenes", json={}).json()["items"][0]
    assert t.get(f"/api/v1/chapters/{ch}/scenes").json(), plan
    empty = t.post(f"/api/v1/chapters/{ch}/lessons", json={"title": "Blank"}).json()["id"]
    t.post(f"/api/v1/courses/{cid}/enrollments", json={"student_email": "s@example.com"})

    # Nothing is visible before publishing.
    assert s.get(f"/api/v1/lessons/{lesson_id}").status_code == 404

    r = t.post(f"/api/v1/chapters/{ch}/publish", json={"include_course": True})
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["chapter_status"] == "published" and out["course_status"] == "published"
    assert out["lessons_published"] == 1 and out["assessments_published"] == 1
    assert out["scenes_published"] == 1, out
    assert [(x["kind"], x["id"]) for x in out["skipped"]] == [("lesson", empty)]

    outline = s.get(f"/api/v1/courses/{cid}/outline").json()
    chapter = next(c for c in outline["chapters"] if c["id"] == ch)
    assert [lesson["id"] for lesson in chapter["lessons"]] == [lesson_id]
    assert chapter["lessons"][0]["scene_count"] == 1
    assert s.get(f"/api/v1/lessons/{lesson_id}/scenes").json()[0]["status"] == "published"
    assert s.get(f"/api/v1/assessments/{quiz_id}").status_code == 200
    # Students never see the teacher's chapter prompt.
    assert s.get(f"/api/v1/chapters/{ch}").json()["ai_instructions"] == ""

    # Publishing again is safe (idempotent).
    again = t.post(f"/api/v1/chapters/{ch}/publish", json={}).json()
    assert again["lessons_published"] == 1 and again["course_status"] == "published"


def test_publish_chapter_keeps_course_draft_unless_asked(login: Login) -> None:
    t = login("t@example.com")
    _, ch = _chapter_with_source(t)
    out = t.post(f"/api/v1/chapters/{ch}/publish", json={}).json()
    assert out["chapter_status"] == "published" and out["course_status"] == "draft"
    assert login("other@example.com").post(
        f"/api/v1/chapters/{ch}/publish", json={}
    ).status_code in (403, 404)
