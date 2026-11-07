"""Automated cross-tenant / IDOR sweep (design §12 "Security tests", Phase 10).

Teacher A owns a full set of resources (school, classroom, course, document, chapter, lesson,
scene, animation, private asset, assessment, a student's attempt/answer/evaluation, outline
proposal, jobs). For EVERY route in the OpenAPI spec that takes a path parameter, an unrelated
teacher and an unrelated student call it with A's real ids and a *valid* body (so authorization,
not validation, decides). No call may succeed.
"""

import json
import re
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.main import create_app
from app.modules.three_d.demo_heart import build_heart_glb
from app.modules.three_d.seed import DEMO_HEART_SLUG, seed_demo_heart
from tests.helpers import HEART_PAGES, make_pdf, upload_and_complete

Login = Callable[..., TestClient]
FIX = Path(__file__).resolve().parents[2] / "packages" / "three-d-contracts" / "fixtures"


def _heart_spec() -> dict[str, Any]:
    spec: dict[str, Any] = json.loads((FIX / "scene_heart_01.json").read_text())
    spec["asset_refs"] = [{"asset_id": DEMO_HEART_SLUG, "version": 1}]
    spec["animation_refs"] = []
    return spec


def _anim() -> dict[str, Any]:
    data: dict[str, Any] = json.loads((FIX / "animation_blood_flow_01.json").read_text())
    return data


@pytest.fixture
def world(login: Login, db: Session) -> dict[str, str]:
    seed_demo_heart(db)
    t = login("owner@example.com")
    s = login("pupil@example.com", "student")
    ids: dict[str, str] = {}
    ids["school_id"] = t.post("/api/v1/schools", json={"name": "A", "slug": "school-a"}).json()[
        "id"
    ]
    t.post(
        f"/api/v1/schools/{ids['school_id']}/members",
        json={"email": "pupil@example.com", "role": "student"},
    )
    ids["classroom_id"] = t.post(
        "/api/v1/classrooms", json={"school_id": ids["school_id"], "name": "9A"}
    ).json()["id"]
    ids["course_id"] = cid = t.post(
        "/api/v1/courses", json={"title": "C", "school_id": ids["school_id"]}
    ).json()["id"]
    up = upload_and_complete(t, cid, make_pdf(HEART_PAGES))
    ids["doc_id"], ids["job_id"] = up["document"]["id"], up["job"]["id"]
    ids["proposal_id"] = t.post(f"/api/v1/courses/{cid}/ai/outline").json()["result"]["proposal_id"]
    ids["chapter_id"] = ch = t.post(
        f"/api/v1/courses/{cid}/chapters", json={"title": "Heart"}
    ).json()["id"]
    t.put(f"/api/v1/chapters/{ch}/objectives", json=[{"text": "Name chambers"}])
    t.patch(f"/api/v1/chapters/{ch}", json={"status": "published"})
    ids["lesson_id"] = lid = t.post(
        f"/api/v1/chapters/{ch}/lessons",
        json={
            "title": "L",
            "content": {"sections": [{"title": "S", "body_markdown": "Four chambers."}]},
        },
    ).json()["id"]
    t.post(f"/api/v1/lessons/{lid}/publish")
    t.patch(f"/api/v1/courses/{cid}", json={"status": "published"})
    t.post(f"/api/v1/courses/{cid}/enrollments", json={"student_email": "pupil@example.com"})
    ids["student_id"] = s.get("/api/v1/users/me").json()["id"]
    ids["scene_id"] = sid = t.post(
        f"/api/v1/lessons/{lid}/scenes", json={"spec": _heart_spec()}
    ).json()["id"]
    ids["animation_id"] = t.post(f"/api/v1/scenes/{sid}/animations", json={"spec": _anim()}).json()[
        "id"
    ]
    t.post(f"/api/v1/scenes/{sid}/publish")
    a = t.post("/api/v1/assets", json={"name": "Private heart", "license_name": "CC0"}).json()
    data = build_heart_glb()
    u = t.post(
        f"/api/v1/assets/{a['id']}/versions/upload-url", json={"size_bytes": len(data)}
    ).json()
    t.put(u["url"], content=data, headers=u["headers"])
    t.post(f"/api/v1/assets/{a['id']}/versions/1/complete")
    ids["asset_id"] = a["id"]
    asm = t.post(f"/api/v1/chapters/{ch}/assessments", json={"title": "Q"}).json()
    t.put(
        f"/api/v1/assessments/{asm['id']}/questions",
        json={
            "expected_version": asm["version"],
            "content": {
                "questions": [
                    {
                        "key": "q1",
                        "question_type": "short_answer",
                        "question_text": "Why?",
                        "points": 1,
                        "rubric": [{"description": "x", "points": 1}],
                    }
                ]
            },
        },
    )
    t.post(f"/api/v1/assessments/{asm['id']}/publish")
    ids["assessment_id"] = asm["id"]
    att = s.post(f"/api/v1/assessments/{asm['id']}/attempts").json()["attempt_id"]
    res = s.post(
        f"/api/v1/attempts/{att}/submit",
        json={"answers": [{"question_key": "q1", "answer_text": "Pressure"}]},
    ).json()
    ids["attempt_id"], ids["answer_id"] = att, res["answers"][0]["answer_id"]
    ids["evaluation_id"] = t.get(f"/api/v1/assessments/{asm['id']}/review-queue").json()[0][
        "evaluation_id"
    ]
    ids["index"], ids["n"] = "0", "1"
    return ids


BODIES: dict[tuple[str, str], Any] = {
    ("post", "/api/v1/schools/{school_id}/members"): {"email": "x@example.com", "role": "student"},
    ("post", "/api/v1/classrooms/{classroom_id}/members"): {
        "email": "x@example.com",
        "role": "student",
    },
    ("patch", "/api/v1/courses/{course_id}"): {"title": "pwned"},
    ("post", "/api/v1/courses/{course_id}/enrollments"): {"student_email": "x@example.com"},
    ("post", "/api/v1/courses/{course_id}/chapters"): {"title": "x"},
    ("patch", "/api/v1/chapters/{chapter_id}"): {"title": "x"},
    ("put", "/api/v1/chapters/{chapter_id}/objectives"): [],
    ("post", "/api/v1/chapters/{chapter_id}/lessons"): {"title": "x"},
    ("patch", "/api/v1/lessons/{lesson_id}"): {"expected_version": 1, "title": "x"},
    ("post", "/api/v1/ai/outline-proposals/{proposal_id}/apply"): {"chapters": [{"title": "x"}]},
    ("post", "/api/v1/lessons/{lesson_id}/ai/sections/{index}/regenerate"): {"expected_version": 1},
    ("post", "/api/v1/assets/{asset_id}/versions/upload-url"): {"size_bytes": 10},
    ("post", "/api/v1/assets/{asset_id}/review"): {"decision": "approved"},
    ("post", "/api/v1/lessons/{lesson_id}/scenes"): {"spec": _heart_spec()},
    ("patch", "/api/v1/scenes/{scene_id}"): {"expected_version": 1, "spec": _heart_spec()},
    ("post", "/api/v1/scenes/{scene_id}/animations"): {
        "spec": {**_anim(), "animation_id": "other"}
    },
    ("patch", "/api/v1/animations/{animation_id}"): {"expected_version": 1, "spec": _anim()},
    ("post", "/api/v1/lessons/{lesson_id}/progress"): {"status": "completed"},
    ("post", "/api/v1/chapters/{chapter_id}/assessments"): {"title": "x"},
    ("patch", "/api/v1/assessments/{assessment_id}"): {"title": "x"},
    ("put", "/api/v1/assessments/{assessment_id}/questions"): {
        "expected_version": 1,
        "content": {"questions": []},
    },
    ("post", "/api/v1/attempts/{attempt_id}/submit"): {"answers": []},
    ("post", "/api/v1/evaluations/{evaluation_id}/review"): {"final_score": 0},
    ("post", "/api/v1/chapters/{chapter_id}/ai/scenes"): {"only_missing": False},
    ("post", "/api/v1/chapters/{chapter_id}/publish"): {"include_course": True},
    ("post", "/api/v1/scenes/{scene_id}/ai/part-insight"): {
        "component_id": "right_atrium",
        "action": "simplify",
    },
}


def test_no_cross_tenant_access(world: dict[str, str], login: Login) -> None:
    attackers = {
        "teacher": login("intruder@example.com"),
        "student": login("stranger@example.com", "student"),
    }
    spec = create_app().openapi()
    checked, leaks, unvalidated = 0, [], []
    for path, ops in spec["paths"].items():
        params = re.findall(r"{(\w+)}", path)
        if not params:
            continue
        url = path
        for p in params:
            url = url.replace("{" + p + "}", world[p])
        for method in ops:
            body = BODIES.get((method, path))
            for who, client in attackers.items():
                kwargs: dict[str, Any] = {"json": body} if body is not None else {}
                r = client.request(method.upper(), url, **kwargs)
                checked += 1
                if r.status_code < 300:
                    leaks.append(f"{who} {method.upper()} {path} -> {r.status_code}")
                if r.status_code == 422 and method != "get":
                    unvalidated.append(f"{method.upper()} {path}")
    assert checked > 120
    assert leaks == [], "\n".join(leaks)
    # 422 would mean validation ran before authorization and the sweep proved nothing.
    assert unvalidated == [], "add a valid body for: " + ", ".join(sorted(set(unvalidated)))
