import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.modules.ai_engine.part_insight import convert_insight
from app.modules.ai_engine.schemas import PartInsightLLM
from app.modules.ai_engine.validation import OutputRejectedError
from app.modules.three_d.seed import DEMO_HEART_SLUG, seed_demo_heart
from tests.helpers import create_course

Login = Callable[..., TestClient]
FIX = Path(__file__).resolve().parents[2] / "packages" / "three-d-contracts" / "fixtures"


def _scene(t: TestClient) -> str:
    cid = create_course(t)
    ch = t.post(f"/api/v1/courses/{cid}/chapters", json={"title": "Heart"}).json()["id"]
    lid = t.post(
        f"/api/v1/chapters/{ch}/lessons",
        json={
            "title": "Heart",
            "content": {
                "sections": [
                    {
                        "title": "Ventricles",
                        "body_markdown": "The left ventricle pumps blood to the whole body.",
                    }
                ]
            },
        },
    ).json()["id"]
    spec = json.loads((FIX / "scene_heart_01.json").read_text())
    spec["asset_refs"] = [{"asset_id": DEMO_HEART_SLUG, "version": 1}]
    spec["animation_refs"] = []
    return str(t.post(f"/api/v1/lessons/{lid}/scenes", json={"spec": spec}).json()["id"])


@pytest.mark.parametrize("action", ["explain_deeper", "simplify", "compare", "quiz_question"])
def test_part_insight_actions(login: Login, db: Session, action: str) -> None:
    seed_demo_heart(db)
    t = login("t@example.com")
    sid = _scene(t)
    body: dict[str, Any] = {"component_id": "left_ventricle", "action": action}
    if action == "compare":
        body["compare_with"] = "right_ventricle"
    job = t.post(f"/api/v1/scenes/{sid}/ai/part-insight", json=body).json()
    assert job["status"] == "completed", job
    r = job["result"]
    assert r["component_id"] == "left_ventricle" and r["label"] == "Left ventricle" and r["text"]
    if action == "quiz_question":
        q = r["question"]
        assert len(q["options"]) == 4 and 0 <= q["correct_index"] < 4


def test_part_insight_validation_and_access(login: Login, db: Session) -> None:
    seed_demo_heart(db)
    t = login("t@example.com")
    sid = _scene(t)
    assert (
        t.post(
            f"/api/v1/scenes/{sid}/ai/part-insight",
            json={"component_id": "ghost", "action": "simplify"},
        ).status_code
        == 404
    )
    assert (
        t.post(
            f"/api/v1/scenes/{sid}/ai/part-insight",
            json={"component_id": "left_ventricle", "action": "compare"},
        ).status_code
        == 404
    )
    other = login("o@example.com")
    assert (
        other.post(
            f"/api/v1/scenes/{sid}/ai/part-insight",
            json={"component_id": "left_ventricle", "action": "simplify"},
        ).status_code
        == 404
    )


def test_convert_insight_rejects_bad_quiz() -> None:
    bad = PartInsightLLM(
        text="t", question_text="Q?", options=["a", "b"], correct_index=5, explanation=""
    )
    with pytest.raises(OutputRejectedError):
        convert_insight("quiz_question", bad)
    with pytest.raises(OutputRejectedError):
        convert_insight(
            "simplify",
            PartInsightLLM(
                text=" ", question_text="", options=[], correct_index=-1, explanation=""
            ),
        )
