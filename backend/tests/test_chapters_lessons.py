from collections.abc import Callable
from typing import Any

from fastapi.testclient import TestClient

from tests.helpers import HEART_PAGES, create_course, make_pdf, upload_and_complete

Login = Callable[..., TestClient]


def _content(doc_id: str | None = None) -> dict[str, Any]:
    refs = [{"document_id": doc_id, "page": 1}] if doc_id else []
    return {
        "sections": [
            {
                "title": "The heart",
                "body_markdown": "Four chambers.",
                "key_terms": ["atrium"],
                "source_refs": refs,
            }
        ],
        "summary": ["The heart has four chambers."],
    }


def test_chapter_crud_and_reorder(login: Login) -> None:
    t = login("t@example.com")
    cid = create_course(t)
    ids = [
        t.post(f"/api/v1/courses/{cid}/chapters", json={"title": f"C{i}"}).json()["id"]
        for i in range(1, 4)
    ]
    t.patch(f"/api/v1/chapters/{ids[2]}", json={"position": 1})
    assert [c["title"] for c in t.get(f"/api/v1/courses/{cid}/chapters").json()] == [
        "C3",
        "C1",
        "C2",
    ]
    assert t.delete(f"/api/v1/chapters/{ids[0]}").status_code == 204
    chapters = t.get(f"/api/v1/courses/{cid}/chapters").json()
    assert [(c["title"], c["position"]) for c in chapters] == [("C3", 1), ("C2", 2)]


def test_objectives_replace(login: Login) -> None:
    t = login("t@example.com")
    cid = create_course(t)
    ch = t.post(f"/api/v1/courses/{cid}/chapters", json={"title": "Heart"}).json()["id"]
    r = t.put(
        f"/api/v1/chapters/{ch}/objectives",
        json=[{"text": "Name the chambers"}, {"text": "Trace blood flow"}],
    )
    assert [o["objective_text"] for o in r.json()] == ["Name the chambers", "Trace blood flow"]
    assert len(t.get(f"/api/v1/chapters/{ch}").json()["objectives"]) == 2


def test_source_refs_cannot_point_to_another_course(login: Login) -> None:
    t = login("t@example.com")
    c1, c2 = create_course(t), create_course(t)
    doc = upload_and_complete(t, c1, make_pdf(HEART_PAGES))["document"]["id"]
    r = t.post(
        f"/api/v1/courses/{c2}/chapters",
        json={"title": "X", "source_refs": [{"document_id": doc, "page_start": 1, "page_end": 2}]},
    )
    assert r.status_code == 404
    ch = t.post(f"/api/v1/courses/{c2}/chapters", json={"title": "Y"}).json()["id"]
    r = t.post(f"/api/v1/chapters/{ch}/lessons", json={"title": "L", "content": _content(doc)})
    assert r.status_code == 404


def test_lesson_versioning_publish_and_student_visibility(login: Login) -> None:
    t = login("t@example.com")
    s = login("s@example.com", "student")
    cid = create_course(t)
    doc = upload_and_complete(t, cid, make_pdf(HEART_PAGES))["document"]["id"]
    ch = t.post(f"/api/v1/courses/{cid}/chapters", json={"title": "Heart"}).json()["id"]
    lesson = t.post(
        f"/api/v1/chapters/{ch}/lessons", json={"title": "Chambers", "content": _content(doc)}
    ).json()
    lid = lesson["id"]
    assert lesson["version"] == 1 and lesson["published_version"] is None

    t.post(f"/api/v1/courses/{cid}/enrollments", json={"student_email": "s@example.com"})
    t.patch(f"/api/v1/courses/{cid}", json={"status": "published"})
    t.patch(f"/api/v1/chapters/{ch}", json={"status": "published"})
    assert s.get(f"/api/v1/chapters/{ch}/lessons").json() == []
    assert s.get(f"/api/v1/lessons/{lid}").status_code == 404

    assert t.post(f"/api/v1/lessons/{lid}/publish").json()["published_version"] == 1
    assert s.get(f"/api/v1/lessons/{lid}").json()["title"] == "Chambers"

    # Teacher keeps editing; students still see the published snapshot.
    upd = t.patch(f"/api/v1/lessons/{lid}", json={"expected_version": 1, "title": "Draft v2"})
    assert upd.json()["version"] == 2 and upd.json()["has_unpublished_changes"] is True
    assert s.get(f"/api/v1/lessons/{lid}").json()["title"] == "Chambers"

    stale = t.patch(f"/api/v1/lessons/{lid}", json={"expected_version": 1, "title": "Lost"})
    assert stale.status_code == 409

    t.post(f"/api/v1/lessons/{lid}/publish")
    assert s.get(f"/api/v1/lessons/{lid}").json()["title"] == "Draft v2"
    assert [v["version_number"] for v in t.get(f"/api/v1/lessons/{lid}/versions").json()] == [2, 1]
    assert (
        s.patch(f"/api/v1/lessons/{lid}", json={"expected_version": 2, "title": "x"}).status_code
        == 403
    )


def test_cannot_publish_empty_lesson(login: Login) -> None:
    t = login("t@example.com")
    cid = create_course(t)
    ch = t.post(f"/api/v1/courses/{cid}/chapters", json={"title": "Heart"}).json()["id"]
    lid = t.post(f"/api/v1/chapters/{ch}/lessons", json={"title": "Empty"}).json()["id"]
    r = t.post(f"/api/v1/lessons/{lid}/publish")
    assert r.status_code == 422 and r.json()["error"]["code"] == "LESSON_NOT_PUBLISHABLE"


def test_lesson_content_rejects_unknown_fields(login: Login) -> None:
    t = login("t@example.com")
    cid = create_course(t)
    ch = t.post(f"/api/v1/courses/{cid}/chapters", json={"title": "Heart"}).json()["id"]
    bad = _content()
    bad["sections"][0]["script"] = "<script>alert(1)</script>"
    assert (
        t.post(f"/api/v1/chapters/{ch}/lessons", json={"title": "x", "content": bad}).status_code
        == 422
    )


def test_student_cannot_see_draft_chapter(login: Login) -> None:
    t = login("t@example.com")
    s = login("s@example.com", "student")
    cid = create_course(t)
    t.post(f"/api/v1/courses/{cid}/enrollments", json={"student_email": "s@example.com"})
    t.patch(f"/api/v1/courses/{cid}", json={"status": "published"})
    ch = t.post(f"/api/v1/courses/{cid}/chapters", json={"title": "Draft"}).json()["id"]
    assert s.get(f"/api/v1/courses/{cid}/chapters").json() == []
    assert s.get(f"/api/v1/chapters/{ch}").status_code == 404
