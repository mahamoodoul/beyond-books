"""End-to-end journey through EVERY feature, in the order a school would use them.

One teacher, one school admin flow, one student, fake AI/3D providers. Each step asserts the
behaviour a user relies on (not just status codes). Together with the API coverage gate in
conftest.py this guarantees every documented endpoint works at least once.
"""

import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.modules.three_d.demo_heart import build_heart_glb
from app.modules.three_d.seed import DEMO_HEART_SLUG, seed_demo_heart
from tests.helpers import HEART_PAGES, make_pdf, upload_and_complete

Login = Callable[..., TestClient]
FIX = Path(__file__).resolve().parents[2] / "packages" / "three-d-contracts" / "fixtures"
API = "/api/v1"


def ok(r: Any, code: int = 200) -> Any:
    assert r.status_code == code, (
        f"{r.request.method} {r.request.url.path} -> {r.status_code}: {r.text[:300]}"
    )
    return r.json() if r.content else None


def test_full_platform_journey(login: Login, db: Session) -> None:  # noqa: PLR0915
    seed_demo_heart(db)
    t = login("teacher@school.no")
    s = login("student@school.no", "student")

    # ---------------------------------------------------------- 1. identity & org
    me = ok(t.get(f"{API}/users/me"))
    assert me["account_type"] == "teacher"
    school = ok(t.post(f"{API}/schools", json={"name": "Oslo Skole", "slug": "oslo-skole"}), 201)
    sid = school["id"]
    assert ok(t.get(f"{API}/schools/{sid}"))["my_role"] == "school_admin"
    ok(
        t.post(
            f"{API}/schools/{sid}/members", json={"email": "student@school.no", "role": "student"}
        ),
        201,
    )
    members = ok(t.get(f"{API}/schools/{sid}/members"))
    assert {m["role"] for m in members} == {"school_admin", "student"}
    room = ok(t.post(f"{API}/classrooms", json={"school_id": sid, "name": "9A"}), 201)
    ok(
        t.post(
            f"{API}/classrooms/{room['id']}/members",
            json={"email": "student@school.no", "role": "student"},
        ),
        201,
    )
    assert len(ok(t.get(f"{API}/classrooms/{room['id']}/members"))) == 2  # teacher + student

    # ------------------------------------------------- 2. course, sources, chapters
    course = ok(t.post(f"{API}/courses", json={"title": "Biology 9", "school_id": sid}), 201)
    cid = course["id"]
    doc = upload_and_complete(t, cid, make_pdf(HEART_PAGES))["document"]
    assert doc["processing_status"] == "ready"
    assert ok(t.get(f"{API}/documents/{doc['id']}/pages"))["total"] == 3

    # ---------------------------------------------------------- 3. AI outline
    ok(t.post(f"{API}/courses/{cid}/ai/outline"), 202)
    discard_me = ok(t.get(f"{API}/courses/{cid}/ai/outline-proposals"))[0]
    ok(t.post(f"{API}/ai/outline-proposals/{discard_me['id']}/discard"), 204)
    ok(t.post(f"{API}/courses/{cid}/ai/outline"), 202)
    proposal = next(
        p
        for p in ok(t.get(f"{API}/courses/{cid}/ai/outline-proposals"))
        if p["status"] == "proposed"
    )
    chapters = ok(
        t.post(
            f"{API}/ai/outline-proposals/{proposal['id']}/apply",
            json={
                "chapters": [
                    {
                        "title": c["title"],
                        "description": c["description"],
                        "source_refs": c["source_refs"],
                        "objectives": [o["text"] for o in c["objectives"]],
                    }
                    for c in proposal["output"]["chapters"]
                ]
            },
        )
    )
    ch = chapters[0]["id"]
    ok(t.patch(f"{API}/chapters/{ch}", json={"status": "published"}))

    # --------------------------------------------------------------- 4. lessons
    lid = ok(t.post(f"{API}/chapters/{ch}/ai/lesson"), 202)["result"]["lesson_id"]
    lesson = ok(t.get(f"{API}/lessons/{lid}"))
    assert lesson["origin"] == "ai" and lesson["published_version"] is None
    ok(
        t.post(
            f"{API}/lessons/{lid}/ai/sections/0/regenerate",
            json={"expected_version": lesson["version"]},
        ),
        202,
    )
    ok(t.post(f"{API}/lessons/{lid}/publish"))
    ok(t.post(f"{API}/lessons/{lid}/unpublish"))
    ok(t.post(f"{API}/lessons/{lid}/publish"))
    scratch = ok(t.post(f"{API}/chapters/{ch}/lessons", json={"title": "Scratch"}), 201)
    ok(t.delete(f"{API}/lessons/{scratch['id']}"), 204)
    ok(t.patch(f"{API}/courses/{cid}", json={"status": "published"}))

    # -------------------------------------------------------- 5. 3D assets & scenes
    lib = {a["slug"]: a for a in ok(t.get(f"{API}/assets"))}
    assert DEMO_HEART_SLUG in lib
    url = ok(t.get(f"{API}/assets/{lib[DEMO_HEART_SLUG]['id']}/versions/1/download-url"))["url"]
    assert t.get(url).content[:4] == b"glTF"
    mine = ok(t.post(f"{API}/assets", json={"name": "My heart", "license_name": "CC0"}), 201)
    data = build_heart_glb()
    up = ok(
        t.post(f"{API}/assets/{mine['id']}/versions/upload-url", json={"size_bytes": len(data)}),
        201,
    )
    assert t.put(up["url"], content=data, headers=up["headers"]).status_code == 204
    ok(t.post(f"{API}/assets/{mine['id']}/versions/1/complete"))
    ok(t.post(f"{API}/assets/{mine['id']}/review", json={"decision": "approved"}))
    gen = ok(
        t.post(
            f"{API}/assets/generation-jobs",
            json={"name": "Cell", "prompt": "A plant cell", "provider": "llm"},
        ),
        202,
    )
    assert ok(t.get(f"{API}/jobs/{gen['job_id']}"))["status"] == "completed"

    spec = json.loads((FIX / "scene_heart_01.json").read_text())
    spec["asset_refs"] = [{"asset_id": DEMO_HEART_SLUG, "version": 1}]
    spec["animation_refs"] = []
    scene = ok(t.post(f"{API}/lessons/{lid}/scenes", json={"spec": spec}), 201)
    anim = json.loads((FIX / "animation_blood_flow_01.json").read_text())
    ok(t.post(f"{API}/scenes/{scene['id']}/animations", json={"spec": anim}), 201)
    ok(t.post(f"{API}/scenes/{scene['id']}/ai/animation"), 202)
    ok(t.post(f"{API}/scenes/{scene['id']}/publish"))
    ok(t.post(f"{API}/scenes/{scene['id']}/unpublish"))
    ok(t.post(f"{API}/scenes/{scene['id']}/publish"))
    planned = ok(t.post(f"{API}/lessons/{lid}/ai/scene"), 202)["result"]
    if planned.get("scene_id"):  # AI may also decide no scene is needed
        ok(t.delete(f"{API}/scenes/{planned['scene_id']}"), 204)

    # ------------------------------------------------------------- 6. assessments
    gen_a = ok(t.post(f"{API}/chapters/{ch}/ai/assessment"), 202)["result"]["assessment_id"]
    ok(t.patch(f"{API}/assessments/{gen_a}", json={"title": "Heart quiz", "max_attempts": 2}))
    assert any(a["id"] == gen_a for a in ok(t.get(f"{API}/chapters/{ch}/assessments")))
    ok(t.post(f"{API}/assessments/{gen_a}/publish"))
    ok(t.post(f"{API}/assessments/{gen_a}/unpublish"))
    ok(t.post(f"{API}/assessments/{gen_a}/publish"))

    # ------------------------------------------------------------- 7. student side
    ok(t.post(f"{API}/courses/{cid}/enrollments", json={"classroom_id": room["id"]}))
    outline = ok(s.get(f"{API}/courses/{cid}/outline"))
    assert outline["next_lesson_id"] == lid
    student_lesson = ok(s.get(f"{API}/lessons/{lid}"))
    assert student_lesson["title"] == lesson["title"] or student_lesson["version"] >= 1
    resolved = ok(s.get(f"{API}/scenes/{scene['id']}/resolved"))
    assert len(resolved["animations"]) >= 1 and resolved["assets"][0]["asset_id"] == DEMO_HEART_SLUG
    ok(
        s.post(
            f"{API}/learning-events",
            json={
                "events": [
                    {"event_type": "scene_opened", "lesson_id": lid, "scene_id": scene["id"]}
                ]
            },
        )
    )
    ok(s.post(f"{API}/lessons/{lid}/progress", json={"status": "completed"}))

    view = ok(s.get(f"{API}/assessments/{gen_a}"))
    assert "content" not in view  # no answer keys before submitting
    att = ok(s.post(f"{API}/assessments/{gen_a}/attempts"), 201)
    answers = [
        {
            "question_key": q["key"],
            **(
                {"selected_option_key": q["options"][0]["key"]}
                if q["question_type"] == "mcq"
                else {"answer_text": "The heart pumps blood."}
            ),
        }
        for q in att["assessment"]["questions"]
    ]
    result = ok(s.post(f"{API}/attempts/{att['attempt_id']}/submit", json={"answers": answers}))
    assert ok(s.get(f"{API}/assessments/{gen_a}/my-attempts"))[0]["attempt_id"] == att["attempt_id"]
    wrong = next((a for a in result["answers"] if a["is_correct"] is False), None)
    if wrong:
        ok(s.post(f"{API}/answers/{wrong['answer_id']}/explain-further"), 202)

    # ------------------------------------------------ 8. grading, analytics, privacy
    assert ok(t.get(f"{API}/assessments/{gen_a}/attempts"))[0]["attempt_id"] == att["attempt_id"]
    for item in ok(t.get(f"{API}/assessments/{gen_a}/review-queue")):
        ok(
            t.post(
                f"{API}/evaluations/{item['evaluation_id']}/review",
                json={"final_score": item["points"]},
            ),
            204,
        )
    graded = ok(t.get(f"{API}/attempts/{att['attempt_id']}/review"))
    assert graded["status"] == "graded" and graded["score"] is not None
    analytics = ok(t.get(f"{API}/courses/{cid}/analytics"))
    assert analytics["enrolled"] == 1 and analytics["assessments"][0]["graded_attempts"] == 1
    sid_student = ok(s.get(f"{API}/users/me"))["id"]
    assert ok(t.get(f"{API}/courses/{cid}/students/{sid_student}/insights"))["attempts"] == 1
    assert ok(s.get(f"{API}/courses/{cid}/my-insights"))["completed_lessons"] == 1
    assert ok(t.get(f"{API}/courses/{cid}/progress"))[0]["completed_lessons"] == 1
    assert ok(t.get(f"{API}/courses/{cid}/ai/usage"))["calls"] >= 5
    export = ok(s.get(f"{API}/users/me/export"))
    assert export["assessment_attempts"][0]["attempt_id"] == att["attempt_id"]
    assert ok(t.get(f"{API}/health/ready"))["database"] == "ok"
