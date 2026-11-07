"""Lesson reader "Explain with AI": 1-3 selected words, explained in context, with images."""

from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient

from tests.helpers import create_course

Login = Callable[..., TestClient]
BODY = (
    "Picture a brick wall. The basic building blocks of your body are **cells**. "
    "Red blood cells carry oxygen around the body."
)
IMAGES = [
    {
        "title": "Red blood cells",
        "thumb_url": "https://upload.wikimedia.org/thumb/rbc.jpg",
        "full_url": "https://upload.wikimedia.org/rbc.jpg",
        "source_url": "https://commons.wikimedia.org/wiki/File:rbc.jpg",
        "description": "Human red blood cells",
        "license": "CC BY-SA 4.0",
        "author": "Someone",
        "width": 720,
        "height": 480,
    }
]


@pytest.fixture
def images(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    """No internet in tests: record the queries and return a fixed image."""
    queries: list[str] = []

    def fake(query: str, limit: int = 6, timeout_s: float = 8.0) -> list[dict[str, Any]]:
        queries.append(query)
        return IMAGES

    monkeypatch.setattr("app.modules.ai_engine.selection_explain.search_images", fake)
    return queries


def _published_lesson(t: TestClient) -> tuple[str, str]:
    cid = create_course(t)
    ch = t.post(f"/api/v1/courses/{cid}/chapters", json={"title": "Cells"}).json()["id"]
    content = {"sections": [{"title": "Building blocks", "body_markdown": BODY}]}
    lid = t.post(
        f"/api/v1/chapters/{ch}/lessons", json={"title": "Cells", "content": content}
    ).json()["id"]
    t.patch(f"/api/v1/courses/{cid}", json={"status": "published"})
    t.patch(f"/api/v1/chapters/{ch}", json={"status": "published"})
    t.post(f"/api/v1/lessons/{lid}/publish")
    return cid, lid


def _explain(c: TestClient, lid: str, text: str) -> Any:
    return c.post(f"/api/v1/lessons/{lid}/ai/explain-selection", json={"text": text})


def test_student_gets_explanation_and_images(login: Login, images: list[str]) -> None:
    t = login("t@example.com")
    cid, lid = _published_lesson(t)
    s = login("s@example.com", "student")
    t.post(f"/api/v1/courses/{cid}/enrollments", json={"student_email": "s@example.com"})

    r = _explain(s, lid, "red blood cells")
    assert r.status_code == 202, r.text
    job = s.get(f"/api/v1/jobs/{r.json()['id']}").json()
    assert job["status"] == "completed", job
    out = job["result"]
    assert out["words"] == "red blood cells"
    assert out["sentence"] == "Red blood cells carry oxygen around the body."  # found server-side
    assert out["card"]["explanation"] and out["card"]["key_points"]
    assert out["images"][0]["license"] == "CC BY-SA 4.0"
    assert images == ["red blood cells diagram"]  # the AI-written image query

    # the same words again: the stored answer comes back, no new AI call
    again = _explain(s, lid, "Red  blood cells")
    assert again.json()["id"] == r.json()["id"]
    assert len(images) == 1


def test_selection_rules(login: Login, images: list[str]) -> None:
    t = login("t@example.com")
    cid, lid = _published_lesson(t)
    s = login("s@example.com", "student")
    t.post(f"/api/v1/courses/{cid}/enrollments", json={"student_email": "s@example.com"})

    assert _explain(s, lid, "carry oxygen around the body").status_code == 422  # > 3 words
    assert _explain(s, lid, "photosynthesis").status_code == 404  # not in this lesson
    assert _explain(s, lid, "**cells**").status_code == 202  # markdown is ignored
    # teachers can use it in their own lessons (student preview)
    assert _explain(t, lid, "brick wall").status_code == 202


def test_only_readers_of_the_lesson(login: Login, images: list[str]) -> None:
    t = login("t@example.com")
    _, lid = _published_lesson(t)
    outsider = login("x@example.com", "student")  # not enrolled
    assert _explain(outsider, lid, "cells").status_code == 404
    assert images == []


def test_context_sentence_without_list_markers() -> None:
    from app.modules.ai_engine.selection_explain import _find_context

    content = {
        "sections": [
            {
                "title": "Blood",
                "body_markdown": "Parts:\n- **Red blood cells** carry oxygen.\n2. Plasma is wet.",
            }
        ]
    }
    assert _find_context(content, "red blood cells") == ("Blood", "Red blood cells carry oxygen.")
    assert _find_context(content, "plasma") == ("Blood", "Plasma is wet.")
