"""AI actions for one 3D scene part in the teacher 3D Studio (explain, simplify, compare, quiz)."""

import uuid
from typing import Any, Literal

from sqlalchemy.orm import Session

from app.core.errors import NotFoundError
from app.modules.ai_engine.prompts import PART_INSIGHT
from app.modules.ai_engine.scene_planning import lesson_passages
from app.modules.ai_engine.schemas import PartInsightLLM
from app.modules.ai_engine.validation import OutputRejectedError
from app.modules.lessons.models import Lesson
from app.modules.operations import audit
from app.modules.operations.jobs import JobType
from app.modules.operations.models import Job
from app.modules.operations.runner import PermanentJobError, create_job, dispatch, handler
from app.modules.three_d.contracts import SceneSpec
from app.modules.three_d.models import ThreeDScene
from app.modules.users.models import User

Action = Literal["explain_deeper", "simplify", "compare", "quiz_question"]


def convert_insight(action: str, out: PartInsightLLM) -> dict[str, Any]:
    text = out.text.strip()[:3000]
    if action != "quiz_question":
        if not text:
            raise OutputRejectedError("EMPTY_OUTPUT", "The model returned no text.")
        return {"text": text}
    options = [o.strip()[:300] for o in out.options if o.strip()][:6]
    if (
        len(options) < 2
        or not 0 <= out.correct_index < len(options)
        or not out.question_text.strip()
    ):
        raise OutputRejectedError("INVALID_OUTPUT", "The generated quiz question was not valid.")
    return {
        "text": text,
        "question": {
            "question_text": out.question_text.strip()[:2000],
            "options": options,
            "correct_index": out.correct_index,
            "explanation": out.explanation.strip()[:2000],
        },
    }


def start_part_insight(
    db: Session,
    user: User,
    scene_id: uuid.UUID,
    component_id: str,
    action: Action,
    compare_with: str | None,
) -> Job:
    from app.modules.ai_engine.service import _check_budget
    from app.modules.three_d.scenes_service import _manage_scene

    scene, course = _manage_scene(db, user, scene_id)
    ids = SceneSpec.model_validate(scene.scene_spec).component_ids()
    if component_id not in ids or (action == "compare" and compare_with not in ids):
        raise NotFoundError("Unknown scene part.")
    _check_budget(db, course.id)
    job = create_job(
        db,
        job_type=JobType.PART_INSIGHT,
        target_type="three_d_scene",
        target_id=scene.id,
        requested_by=user.id,
        course_id=course.id,
        school_id=course.school_id,
        input_snapshot={
            "component_id": component_id,
            "action": action,
            "compare_with": compare_with,
        },
    )
    audit.record(
        db,
        action=f"ai.part_insight.{action}",
        resource_type="three_d_scene",
        resource_id=scene.id,
        actor_user_id=user.id,
        school_id=course.school_id,
    )
    db.commit()
    dispatch(job.id)
    db.refresh(job)
    return job


@handler(JobType.PART_INSIGHT)
def part_insight(db: Session, job: Job) -> dict[str, Any]:
    from app.modules.ai_engine.workflows import _call, _record, _rejected

    scene = db.get(ThreeDScene, job.target_id)
    if scene is None:
        raise PermanentJobError("SCENE_MISSING", "The scene no longer exists.")
    lesson = db.get(Lesson, scene.lesson_id)
    assert lesson is not None
    spec = SceneSpec.model_validate(scene.scene_spec)
    parts = {c.component_id: c for c in spec.components}
    snap = job.input_snapshot
    part = parts.get(snap["component_id"])
    if part is None:
        raise PermanentJobError("PART_MISSING", "The part no longer exists in the scene.")
    current = spec.explanations.get(part.explanation_ref or "", "")
    lines = [
        f"Lesson: {lesson.title}",
        f"3D scene: {spec.title}",
        f"Part: {part.label}",
        f"Current explanation: {current or '(none)'}",
        f"Action: {snap['action']}",
    ]
    other = parts.get(snap.get("compare_with") or "")
    if snap["action"] == "compare" and other is not None:
        lines.append(f"Compare with: {other.label}")
    passages = lesson_passages(lesson)
    if not passages:
        raise PermanentJobError("NO_SOURCES", "The lesson has no content to ground the answer.")
    out, usage = _call(db, job, PART_INSIGHT, "\n".join(lines), passages, PartInsightLLM)
    try:
        result = convert_insight(snap["action"], out)
    except OutputRejectedError as exc:
        raise _rejected(exc) from exc
    result |= {"action": snap["action"], "component_id": part.component_id, "label": part.label}
    _record(
        db,
        job,
        usage,
        PART_INSIGHT,
        kind="part_insight",
        target_type="three_d_scene",
        target_id=scene.id,
        output=result,
        validation={},
        status="proposed",
    )
    db.commit()
    return result
