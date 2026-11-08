"""Lesson media: pictures and AR targets uploaded to a lesson, with the lesson's access rules."""

from collections.abc import Callable
from typing import Any

from fastapi.testclient import TestClient

from tests.helpers import create_course

Login = Callable[..., TestClient]

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
MIND = b"\x82\xa1v\x02\xa8dataList\x92" + b"\x00" * 64


def _lesson(t: TestClient, *, publish: bool) -> tuple[str, str]:
    cid = create_course(t)
    ch = t.post(f"/api/v1/courses/{cid}/chapters", json={"title": "The heart"}).json()
    lesson = t.post(
        f"/api/v1/chapters/{ch['id']}/lessons",
        json={"title": "Chambers", "content": {"sections": [{"title": "A", "body_markdown": "b"}]}},
    ).json()
    if publish:
        t.post(f"/api/v1/lessons/{lesson['id']}/publish")
        t.patch(f"/api/v1/chapters/{ch['id']}", json={"status": "published"})
        t.patch(f"/api/v1/courses/{cid}", json={"status": "published"})
    return cid, lesson["id"]


def _upload(t: TestClient, lesson_id: str, data: bytes, **body: Any) -> dict[str, Any]:
    r = t.post(f"/api/v1/lessons/{lesson_id}/media", json={"size_bytes": len(data), **body})
    assert r.status_code == 201, r.text
    up = r.json()
    put = t.put(up["url"], content=data, headers=up["headers"])
    assert put.status_code == 204, put.text
    res: dict[str, Any] = t.post(f"/api/v1/lesson-media/{up['media']['id']}/complete").json()
    return res


def test_teacher_uploads_picture_and_ar_target(login: Login) -> None:
    t = login("t@example.com")
    _, lid = _lesson(t, publish=False)
    pic = _upload(t, lid, PNG, kind="image", content_type="image/png", alt_text="Heart diagram")
    target = _upload(t, lid, MIND, kind="ar_target", content_type="application/octet-stream")
    assert pic["status"] == "ready" and pic["url"] and pic["alt_text"] == "Heart diagram"
    assert target["status"] == "ready"
    listed = t.get(f"/api/v1/lessons/{lid}/media").json()
    assert [m["kind"] for m in listed] == ["image", "ar_target"]
    downloaded = t.get(listed[0]["url"])
    assert downloaded.status_code == 200 and downloaded.content == PNG


def test_file_contents_must_match_the_declared_type(login: Login) -> None:
    t = login("t@example.com")
    _, lid = _lesson(t, publish=False)
    r = t.post(
        f"/api/v1/lessons/{lid}/media",
        json={"kind": "image", "content_type": "image/png", "size_bytes": len(MIND)},
    )
    up = r.json()
    t.put(up["url"], content=MIND, headers=up["headers"])
    done = t.post(f"/api/v1/lesson-media/{up['media']['id']}/complete")
    assert done.status_code == 422 and done.json()["error"]["code"] == "INVALID_MEDIA"
    mixed = t.post(
        f"/api/v1/lessons/{lid}/media",
        json={"kind": "ar_target", "content_type": "image/png", "size_bytes": 10},
    )
    assert mixed.status_code == 422


def test_students_see_media_only_for_published_lessons_they_can_open(login: Login) -> None:
    t = login("t@example.com")
    s = login("s@example.com", "student")
    outsider = login("o@example.com", "student")
    cid, lid = _lesson(t, publish=True)
    _, draft_lid = _lesson(t, publish=False)
    _upload(t, lid, PNG, kind="image", content_type="image/png")
    t.post(f"/api/v1/courses/{cid}/enrollments", json={"student_email": "s@example.com"})

    seen = s.get(f"/api/v1/lessons/{lid}/media")
    assert seen.status_code == 200 and seen.json()[0]["url"]
    assert outsider.get(f"/api/v1/lessons/{lid}/media").status_code == 404
    assert s.get(f"/api/v1/lessons/{draft_lid}/media").status_code == 404


def test_only_managers_add_or_delete_media(login: Login) -> None:
    t = login("t@example.com")
    s = login("s@example.com", "student")
    cid, lid = _lesson(t, publish=True)
    t.post(f"/api/v1/courses/{cid}/enrollments", json={"student_email": "s@example.com"})
    pic = _upload(t, lid, PNG, kind="image", content_type="image/png")
    blocked = s.post(
        f"/api/v1/lessons/{lid}/media",
        json={"kind": "image", "content_type": "image/png", "size_bytes": 10},
    )
    assert blocked.status_code in (403, 404)
    assert s.delete(f"/api/v1/lesson-media/{pic['id']}").status_code in (403, 404)
    assert t.delete(f"/api/v1/lesson-media/{pic['id']}").status_code == 204
    assert t.get(f"/api/v1/lessons/{lid}/media").json() == []
