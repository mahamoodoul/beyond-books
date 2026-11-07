"""Course page: chapter overview counts, AI split of a complex chapter, teacher-added chapters."""

from collections.abc import Callable
from typing import Any

from fastapi.testclient import TestClient

from tests.helpers import create_course, make_pdf, upload_and_complete

Login = Callable[..., TestClient]
TOPICS = ["The heart", "Arteries", "Veins", "Capillaries", "Blood", "The lungs"]
# Six full-length pages, so the chapter has several text chunks (sub-topics) to split.
PAGES = [
    f"{t}\n\n" + (f"{t} is an important part of the circulatory system. " * 40) for t in TOPICS
]


def _course(t: TestClient) -> tuple[str, str, str]:
    cid = create_course(t)
    doc = upload_and_complete(t, cid, make_pdf(PAGES))["document"]["id"]
    intro = t.post(f"/api/v1/courses/{cid}/chapters", json={"title": "Intro"}).json()["id"]
    big = t.post(
        f"/api/v1/courses/{cid}/chapters",
        json={
            "title": "The whole circulatory system",
            "source_refs": [{"document_id": doc, "page_start": 1, "page_end": len(PAGES)}],
        },
    ).json()["id"]
    t.post(f"/api/v1/courses/{cid}/chapters", json={"title": "Review"})
    return cid, intro, big


def _titles(t: TestClient, cid: str) -> list[str]:
    return [c["title"] for c in t.get(f"/api/v1/courses/{cid}/chapters").json()]


def test_chapter_overview_counts(login: Login) -> None:
    t = login("t@example.com")
    cid, intro, _ = _course(t)
    lesson = t.post(
        f"/api/v1/chapters/{intro}/lessons",
        json={"title": "L1", "content": {"sections": [{"title": "A", "body_markdown": "Text."}]}},
    ).json()
    t.post(f"/api/v1/lessons/{lesson['id']}/publish")
    t.post(f"/api/v1/chapters/{intro}/lessons", json={"title": "L2"})
    t.put(f"/api/v1/chapters/{intro}/objectives", json=[{"text": "Explain the heart"}])

    rows = t.get(f"/api/v1/courses/{cid}/chapter-overview").json()
    assert [r["title"] for r in rows] == ["Intro", "The whole circulatory system", "Review"]
    first = rows[0]
    assert (first["lessons"], first["published_lessons"], first["objectives"]) == (2, 1, 1)
    assert (first["scenes"], first["quizzes"]) == (0, 0)
    assert login("s@example.com", "student").get(
        f"/api/v1/courses/{cid}/chapter-overview"
    ).status_code in (403, 404)


def test_split_complex_chapter_proposal_then_apply(login: Login) -> None:
    t = login("t@example.com")
    cid, _, big = _course(t)
    t.patch(f"/api/v1/chapters/{big}", json={"ai_instructions": "Year 9"})

    job = t.post(f"/api/v1/chapters/{big}/ai/split").json()
    assert job["status"] == "completed", (job["error_code"], job["error_message"])
    proposal = job["result"]["chapters"]
    assert len(proposal) >= 2
    assert all(c["source_refs"] for c in proposal)  # grounded in the chapter's pages
    # Nothing changes until the teacher applies the (edited) proposal.
    assert _titles(t, cid) == ["Intro", "The whole circulatory system", "Review"]

    body: dict[str, Any] = {
        "chapters": [
            {
                "title": f"Part {i + 1}: {c['title']}"[:200],
                "description": c["description"],
                "source_refs": c["source_refs"],
                "objectives": [o["text"] for o in c["objectives"]],
            }
            for i, c in enumerate(proposal[:2])
        ],
        "remove_original": True,
    }
    r = t.post(f"/api/v1/chapters/{big}/split", json=body)
    assert r.status_code == 200, r.text
    created = r.json()
    titles = _titles(t, cid)
    assert titles[0] == "Intro" and titles[-1] == "Review"
    assert titles[1:3] == [c["title"] for c in created]  # inserted where the original was
    assert "The whole circulatory system" not in titles
    positions = [c["position"] for c in t.get(f"/api/v1/courses/{cid}/chapters").json()]
    assert positions == list(range(1, len(titles) + 1))
    new = t.get(f"/api/v1/chapters/{created[0]['id']}").json()
    assert new["ai_instructions"] == "Year 9"  # the chapter prompt carries over
    assert new["objectives"]


def test_split_keeps_a_chapter_that_has_content(login: Login) -> None:
    t = login("t@example.com")
    cid, _, big = _course(t)
    t.post(f"/api/v1/chapters/{big}/lessons", json={"title": "Existing lesson"})
    proposal = t.post(f"/api/v1/chapters/{big}/ai/split").json()["result"]["chapters"]
    body: dict[str, Any] = {
        "chapters": [
            {
                "title": c["title"],
                "description": c["description"],
                "source_refs": c["source_refs"],
                "objectives": [],
            }
            for c in proposal[:2]
        ],
        "remove_original": True,
    }
    assert t.post(f"/api/v1/chapters/{big}/split", json=body).status_code == 409
    body["remove_original"] = False
    assert t.post(f"/api/v1/chapters/{big}/split", json=body).status_code == 200
    titles = _titles(t, cid)
    assert titles[1] == "The whole circulatory system" and len(titles) == 5

    other = login("other@example.com")
    assert other.post(f"/api/v1/chapters/{big}/ai/split").status_code in (403, 404)
