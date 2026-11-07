"""Quiz builder (teacher side): new question types, quiz settings and the publish guard."""

import uuid
from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient

from tests.helpers import create_course

Login = Callable[..., TestClient]

NEW_TYPES: dict[str, dict[str, Any]] = {
    "true_false": {
        "question_type": "true_false",
        "question_text": "The left ventricle has the thickest wall.",
        "options": [{"text": "True", "is_correct": True}, {"text": "False"}],
    },
    "multiple_select": {
        "question_type": "multiple_select",
        "question_text": "Which vessels carry blood away from the heart?",
        "options": [
            {"text": "Aorta", "is_correct": True},
            {"text": "Pulmonary trunk", "is_correct": True},
            {"text": "Vena cava"},
        ],
    },
    "fill_blanks": {
        "question_type": "fill_blanks",
        "question_text": "Complete the sentence.",
        "cloze_text": "Blood leaves the left ventricle through the {{aorta}} and returns "
        "via the {{vena cava|venae cavae}}.",
    },
    "matching": {
        "question_type": "matching",
        "question_text": "Match each part to its job.",
        "pairs": [
            {"prompt": "Frontal lobe", "match": "Planning"},
            {"prompt": "Occipital lobe", "match": "Vision"},
        ],
        "distractors": ["Digestion"],
    },
    "ordering": {
        "question_type": "ordering",
        "question_text": "Put the path of air in order.",
        "items": [{"text": "Trachea"}, {"text": "Bronchi"}, {"text": "Alveoli"}],
    },
    "numeric": {
        "question_type": "numeric",
        "question_text": "Resting heart rate of a teenager?",
        "numeric_answer": 75,
        "tolerance": 15,
        "unit": "beats per minute",
    },
}


def _quiz(t: TestClient, **create: Any) -> tuple[str, dict[str, Any]]:
    cid = create_course(t)
    ch = t.post(f"/api/v1/courses/{cid}/chapters", json={"title": "Heart"}).json()["id"]
    a = t.post(f"/api/v1/chapters/{ch}/assessments", json={"title": "Quiz", **create})
    assert a.status_code == 201, a.text
    return ch, a.json()


def _put(t: TestClient, a: dict[str, Any], questions: list[dict[str, Any]]) -> Any:
    return t.put(
        f"/api/v1/assessments/{a['id']}/questions",
        json={"expected_version": a["version"], "content": {"questions": questions}},
    )


def test_every_new_type_saves_with_keys(login: Login) -> None:
    t = login("t@example.com")
    _, a = _quiz(t)
    r = _put(t, a, list(NEW_TYPES.values()))
    assert r.status_code == 200, r.text
    qs = {q["question_type"]: q for q in r.json()["content"]["questions"]}
    assert set(qs) == set(NEW_TYPES)
    assert [p["key"] for p in qs["matching"]["pairs"]] == ["p1", "p2"]
    assert [i["key"] for i in qs["ordering"]["items"]] == ["i1", "i2", "i3"]
    assert [o["key"] for o in qs["multiple_select"]["options"]] == ["oa", "ob", "oc"]


@pytest.mark.parametrize(
    ("qtype", "change"),
    [
        ("true_false", {"options": [{"text": "Yes", "is_correct": True}, {"text": "No"}]}),
        ("multiple_select", {"options": [{"text": "A"}, {"text": "B"}]}),  # nothing correct
        ("fill_blanks", {"cloze_text": "No blanks here."}),
        ("fill_blanks", {"cloze_text": "Empty {{ | }} blank."}),
        ("matching", {"pairs": [{"prompt": "a", "match": "x"}], "distractors": []}),
        ("matching", {"distractors": ["vision"]}),  # duplicates a real match
        ("ordering", {"items": [{"text": "a"}, {"text": "b"}]}),
        ("numeric", {"numeric_answer": None}),
        ("numeric", {"rubric": [{"description": "x", "points": 1}]}),  # field of another type
    ],
)
def test_invalid_new_questions_rejected(login: Login, qtype: str, change: dict[str, Any]) -> None:
    t = login("t@example.com")
    _, a = _quiz(t)
    q = {**NEW_TYPES[qtype], **change}
    assert _put(t, a, [q]).status_code == 422


def test_hotspot_needs_a_scene_in_this_course(login: Login) -> None:
    t = login("t@example.com")
    _, a = _quiz(t)
    q = {
        "question_type": "hotspot_3d",
        "question_text": "Click the left ventricle.",
        "scene_id": str(uuid.uuid4()),
        "target_component_ids": ["left_ventricle"],
    }
    assert _put(t, a, [q]).status_code == 404
    assert _put(t, a, [{**q, "target_component_ids": []}]).status_code == 422


def test_quiz_settings_saved_and_versioned(login: Login) -> None:
    t = login("t@example.com")
    _, a = _quiz(
        t, settings={"time_limit_minutes": 10, "questions_per_attempt": 5, "layout": "one_per_page"}
    )
    assert a["settings"]["time_limit_minutes"] == 10
    assert a["settings"]["shuffle_questions"] is False  # defaults filled in
    a = _put(t, a, [NEW_TYPES["true_false"]]).json()
    assert a["questions_per_attempt"] == 1  # never more than the pool
    assert t.post(f"/api/v1/assessments/{a['id']}/publish").status_code == 409  # see below

    # settings changes need a new published version, like question edits
    before = a["version"]
    shuffled = {**a["settings"], "shuffle_options": True}
    r = t.patch(f"/api/v1/assessments/{a['id']}", json={"settings": shuffled})
    assert r.status_code == 200 and r.json()["version"] == before + 1
    same = t.patch(f"/api/v1/assessments/{a['id']}", json={"settings": r.json()["settings"]})
    assert same.json()["version"] == before + 1  # unchanged settings don't bump the version
    bad = t.patch(f"/api/v1/assessments/{a['id']}", json={"settings": {"time_limit_minutes": 0}})
    assert bad.status_code == 422


def test_publish_blocked_until_students_can_answer_new_types(login: Login) -> None:
    t = login("t@example.com")
    _, a = _quiz(t)
    mcq = {
        "question_type": "mcq",
        "question_text": "How many chambers?",
        "options": [{"text": "Two"}, {"text": "Four", "is_correct": True}],
    }
    a = _put(t, a, [mcq, NEW_TYPES["ordering"]]).json()
    r = t.post(f"/api/v1/assessments/{a['id']}/publish")
    assert r.status_code == 409 and "ordering" in r.text
    a = _put(t, a, [mcq]).json()
    r = t.post(f"/api/v1/assessments/{a['id']}/publish")
    assert r.status_code == 200 and r.json()["status"] == "published"
