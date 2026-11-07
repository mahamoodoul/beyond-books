from collections.abc import Callable
from typing import Any

from fastapi.testclient import TestClient

from tests.helpers import create_course

Login = Callable[..., TestClient]


def _course(t: TestClient, students: list[str]) -> dict[str, Any]:
    cid = create_course(t)
    ch = t.post(f"/api/v1/courses/{cid}/chapters", json={"title": "Heart"}).json()["id"]
    t.patch(f"/api/v1/chapters/{ch}", json={"status": "published"})
    objs = t.put(f"/api/v1/chapters/{ch}/objectives", json=[{"text": "Name the chambers"}]).json()
    lid = t.post(
        f"/api/v1/chapters/{ch}/lessons",
        json={
            "title": "Chambers",
            "content": {"sections": [{"title": "Chambers", "body_markdown": "Four chambers."}]},
        },
    ).json()["id"]
    t.post(f"/api/v1/lessons/{lid}/publish")
    t.patch(f"/api/v1/courses/{cid}", json={"status": "published"})
    for e in students:
        t.post(f"/api/v1/courses/{cid}/enrollments", json={"student_email": e})
    a = t.post(f"/api/v1/chapters/{ch}/assessments", json={"title": "Quiz"}).json()
    q = {
        "key": "q1",
        "question_type": "mcq",
        "question_text": "How many chambers?",
        "learning_objective_id": objs[0]["id"],
        "lesson_id": lid,
        "options": [{"key": "a", "text": "Two"}, {"key": "b", "text": "Four", "is_correct": True}],
    }
    t.put(
        f"/api/v1/assessments/{a['id']}/questions",
        json={"expected_version": a["version"], "content": {"questions": [q]}},
    )
    t.post(f"/api/v1/assessments/{a['id']}/publish")
    return {"cid": cid, "aid": a["id"], "lid": lid, "oid": objs[0]["id"]}


def _answer(s: TestClient, aid: str, option: str) -> None:
    att = s.post(f"/api/v1/assessments/{aid}/attempts").json()["attempt_id"]
    s.post(
        f"/api/v1/attempts/{att}/submit",
        json={"answers": [{"question_key": "q1", "selected_option_key": option}]},
    )


def test_course_analytics_detects_gaps_and_hard_questions(login: Login) -> None:
    t = login("t@example.com")
    emails = [f"s{i}@example.com" for i in range(4)]
    students = [login(e, "student") for e in emails]
    c = _course(t, emails)
    for s, opt in zip(students, ["a", "a", "a", "b"], strict=True):
        _answer(s, c["aid"], opt)
    students[3].post(f"/api/v1/lessons/{c['lid']}/progress", json={"status": "completed"})

    data = t.get(f"/api/v1/courses/{c['cid']}/analytics").json()
    assert data["enrolled"] == 4 and data["suppressed"] is False
    assert data["avg_score_rate"] == 0.25
    q = data["assessments"][0]["questions"][0]
    assert q["avg_score_rate"] == 0.25 and q["common_wrong"][0] == {
        "option_key": "a",
        "text": "Two",
        "count": 3,
    }
    obj = data["objectives"][0]
    assert (obj["gaps"], obj["mastered"]) == (3, 1)
    kinds = [i["kind"] for i in data["insights"]]
    assert kinds[0] == "objective_gap" and "hard_question" in kinds
    assert data["lessons"][0]["completion_rate"] == 0.25
    assert len(data["attention"]) == 3  # three have not completed the lesson


def test_small_groups_suppress_distributions(login: Login) -> None:
    t = login("t@example.com")
    s = login("s@example.com", "student")
    c = _course(t, ["s@example.com"])
    _answer(s, c["aid"], "a")
    data = t.get(f"/api/v1/courses/{c['cid']}/analytics").json()
    assert data["suppressed"] is True
    assert data["assessments"][0]["questions"][0]["common_wrong"] == []


def test_unreviewed_ai_scores_do_not_count_for_mastery(login: Login) -> None:
    t = login("t@example.com")
    s = login("s@example.com", "student")
    c = _course(t, ["s@example.com"])
    a = t.get(f"/api/v1/assessments/{c['aid']}").json()
    content = a["content"]
    content["questions"].append(
        {
            "key": "q2",
            "question_type": "short_answer",
            "question_text": "Why?",
            "points": 1,
            "learning_objective_id": c["oid"],
            "rubric": [{"description": "x", "points": 1}],
            "model_answer": "pressure",
        }
    )
    t.put(
        f"/api/v1/assessments/{c['aid']}/questions",
        json={"expected_version": a["version"], "content": content},
    )
    t.post(f"/api/v1/assessments/{c['aid']}/publish")
    att = s.post(f"/api/v1/assessments/{c['aid']}/attempts").json()["attempt_id"]
    s.post(
        f"/api/v1/attempts/{att}/submit",
        json={
            "answers": [
                {"question_key": "q1", "selected_option_key": "b"},
                {"question_key": "q2", "answer_text": "pressure"},
            ]
        },
    )
    sid = s.get("/api/v1/users/me").json()["id"]
    ins = t.get(f"/api/v1/courses/{c['cid']}/students/{sid}/insights").json()
    assert ins["objectives"][0]["evidence_count"] == 1  # only the auto-graded MCQ counts so far
    assert (
        t.get(f"/api/v1/courses/{c['cid']}/analytics").json()["assessments"][0]["pending_reviews"]
        == 1
    )


def test_student_insights_and_recommendations(login: Login) -> None:
    t = login("t@example.com")
    s = login("s@example.com", "student")
    other = login("o@example.com", "student")
    c = _course(t, ["s@example.com", "o@example.com"])
    _answer(s, c["aid"], "a")
    mine = s.get(f"/api/v1/courses/{c['cid']}/my-insights").json()
    assert mine["objectives"][0]["status"] == "gap"
    assert mine["recommendations"][0]["lesson_id"] == c["lid"]
    sid = s.get("/api/v1/users/me").json()["id"]
    assert other.get(f"/api/v1/courses/{c['cid']}/students/{sid}/insights").status_code == 404
    assert other.get(f"/api/v1/courses/{c['cid']}/analytics").status_code == 403
    assert login("ot@example.com").get(f"/api/v1/courses/{c['cid']}/analytics").status_code == 404
