from collections.abc import Callable

from fastapi.testclient import TestClient

from tests.helpers import create_course

Login = Callable[..., TestClient]
BODY = {"sections": [{"title": "S", "body_markdown": "Some text."}]}


def _course(
    t: TestClient, lessons_per_chapter: tuple[int, ...] = (2, 1)
) -> tuple[str, list[list[str]]]:
    cid = create_course(t)
    out: list[list[str]] = []
    for i, n in enumerate(lessons_per_chapter):
        ch = t.post(f"/api/v1/courses/{cid}/chapters", json={"title": f"C{i}"}).json()["id"]
        t.patch(f"/api/v1/chapters/{ch}", json={"status": "published"})
        ids = []
        for j in range(n):
            lid = t.post(
                f"/api/v1/chapters/{ch}/lessons", json={"title": f"L{i}{j}", "content": BODY}
            ).json()["id"]
            t.post(f"/api/v1/lessons/{lid}/publish")
            ids.append(lid)
        out.append(ids)
    t.patch(f"/api/v1/courses/{cid}", json={"status": "published"})
    return cid, out


def test_student_progress_flow(login: Login) -> None:
    t = login("t@example.com")
    s = login("s@example.com", "student")
    cid, lessons = _course(t)
    t.post(f"/api/v1/courses/{cid}/enrollments", json={"student_email": "s@example.com"})

    o = s.get(f"/api/v1/courses/{cid}/outline").json()
    assert o["total_lessons"] == 3 and o["completed_lessons"] == 0
    assert o["next_lesson_id"] == lessons[0][0]

    r = s.post(f"/api/v1/lessons/{lessons[0][0]}/progress", json={"status": "completed"})
    assert r.json()["status"] == "completed"
    s.post(f"/api/v1/lessons/{lessons[0][1]}/progress", json={"status": "completed"})
    o = s.get(f"/api/v1/courses/{cid}/outline").json()
    assert o["chapters"][0]["progress"] == "completed"
    assert o["chapters"][1]["progress"] == "not_started"
    assert o["next_lesson_id"] == lessons[1][0]

    # Completed is sticky: re-opening a lesson does not un-complete it.
    s.post(f"/api/v1/lessons/{lessons[0][0]}/progress", json={"status": "in_progress"})
    assert s.get(f"/api/v1/courses/{cid}/outline").json()["completed_lessons"] == 2

    mine = s.get("/api/v1/students/me/progress").json()
    assert mine[0]["completed_lessons"] == 2 and mine[0]["total_lessons"] == 3

    rows = t.get(f"/api/v1/courses/{cid}/progress").json()
    assert rows[0]["completed_lessons"] == 2 and rows[0]["completed_chapters"] == 1


def test_teacher_preview_is_not_recorded(login: Login) -> None:
    t = login("t@example.com")
    _, lessons = _course(t, (1,))
    r = t.post(f"/api/v1/lessons/{lessons[0][0]}/progress", json={"status": "completed"})
    assert r.status_code == 204


def test_unenrolled_student_cannot_record(login: Login) -> None:
    t = login("t@example.com")
    s = login("s@example.com", "student")
    cid, lessons = _course(t, (1,))
    assert s.get(f"/api/v1/courses/{cid}/outline").status_code == 404
    assert (
        s.post(
            f"/api/v1/lessons/{lessons[0][0]}/progress", json={"status": "completed"}
        ).status_code
        == 404
    )
    r = s.post(
        "/api/v1/learning-events",
        json={"events": [{"event_type": "lesson_opened", "lesson_id": lessons[0][0]}]},
    )
    assert r.status_code == 404


def test_learning_events_validated(login: Login) -> None:
    t = login("t@example.com")
    s = login("s@example.com", "student")
    cid, lessons = _course(t, (1,))
    t.post(f"/api/v1/courses/{cid}/enrollments", json={"student_email": "s@example.com"})
    lid = lessons[0][0]
    ok = s.post(
        "/api/v1/learning-events",
        json={
            "events": [
                {"event_type": "lesson_opened", "lesson_id": lid},
                {
                    "event_type": "component_selected",
                    "lesson_id": lid,
                    "component_id": "left_ventricle",
                },
            ]
        },
    )
    assert ok.json() == {"recorded": 2}
    bad_type = s.post(
        "/api/v1/learning-events", json={"events": [{"event_type": "keylogger", "lesson_id": lid}]}
    )
    assert bad_type.status_code == 422
    bad_payload = s.post(
        "/api/v1/learning-events",
        json={
            "events": [
                {"event_type": "component_selected", "lesson_id": lid, "component_id": "<script>"}
            ]
        },
    )
    assert bad_payload.status_code == 422
    ghost_scene = s.post(
        "/api/v1/learning-events",
        json={
            "events": [
                {
                    "event_type": "scene_opened",
                    "lesson_id": lid,
                    "scene_id": "00000000-0000-0000-0000-000000000000",
                }
            ]
        },
    )
    assert ghost_scene.status_code == 404


def test_teacher_sees_draft_outline_student_does_not(login: Login) -> None:
    t = login("t@example.com")
    s = login("s@example.com", "student")
    cid, _ = _course(t, (1,))
    t.post(f"/api/v1/courses/{cid}/chapters", json={"title": "Draft chapter"})
    t.post(f"/api/v1/courses/{cid}/enrollments", json={"student_email": "s@example.com"})
    assert len(t.get(f"/api/v1/courses/{cid}/outline").json()["chapters"]) == 2
    assert len(s.get(f"/api/v1/courses/{cid}/outline").json()["chapters"]) == 1
    assert s.get(f"/api/v1/courses/{cid}/progress").status_code == 403
