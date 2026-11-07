"""Animation Planning agent (design §6.2). Output → validated AnimationSpec → saved on the scene
as a draft (the scene must be re-published for students to see it)."""

import uuid
from typing import Any

from sqlalchemy.orm import Session

from app.core.errors import NotFoundError
from app.modules.ai_engine.prompts import ANIMATION_PLANNING
from app.modules.ai_engine.scene_planning import _ident, lesson_passages
from app.modules.ai_engine.schemas import AnimationPlanLLM
from app.modules.ai_engine.validation import OutputRejectedError
from app.modules.animations.service import AnimationInvalidError, save_animation
from app.modules.lessons.models import Lesson
from app.modules.operations.jobs import JobType
from app.modules.operations.models import Job
from app.modules.operations.runner import PermanentJobError, handler
from app.modules.three_d.contracts import MAX_STEP_DURATION_MS, AnimationSpec, SceneSpec
from app.modules.three_d.models import ThreeDScene

_TARGETED = {
    "highlight_component",
    "set_visibility",
    "set_opacity",
    "move_along_path",
    "rotate_component",
    "show_flow_particles",
    "camera_focus",
}


def convert_animation(
    plan: AnimationPlanLLM, scene: SceneSpec, existing: set[str]
) -> AnimationSpec:
    components = scene.component_ids()
    steps: list[dict[str, Any]] = []
    for s in plan.steps[:20]:
        target = s.target_component.strip()
        if s.action in _TARGETED and target not in components:
            continue
        if s.action in {"move_along_path", "show_flow_particles"} and s.path_id not in scene.paths:
            continue
        step: dict[str, Any] = {
            "step": len(steps) + 1,
            "action": s.action,
            "duration_ms": max(500, min(MAX_STEP_DURATION_MS, s.duration_ms)),
            "explanation": s.explanation.strip()[:2000] or None,
        }
        if s.action in _TARGETED or (s.action == "show_annotation" and target in components):
            step["target_component"] = target
        if s.action == "set_visibility":
            step["visible"] = s.visible
        elif s.action == "set_opacity":
            step["opacity"] = max(0.0, min(1.0, s.opacity))
        elif s.action == "rotate_component":
            step["axis"], step["degrees"] = s.axis, max(-720.0, min(720.0, s.degrees))
        elif s.action in {"move_along_path", "show_flow_particles"}:
            step["path_id"] = s.path_id
        if s.action == "show_annotation" and not step["explanation"]:
            continue
        steps.append(step)
    if not steps:
        raise OutputRejectedError("EMPTY_OUTPUT", "The plan had no steps valid for this scene.")
    key = _ident(plan.title or "guided_tour", "anim")[:48]
    while key in existing:
        key = f"{key}_{uuid.uuid4().hex[:4]}"
    try:
        return AnimationSpec.model_validate(
            {"animation_id": key, "title": (plan.title or "Guided tour")[:200], "steps": steps}
        )
    except ValueError as exc:
        raise OutputRejectedError(
            "INVALID_OUTPUT", "The planned animation failed validation."
        ) from exc


@handler(JobType.ANIMATION_PLANNING)
def plan_animation(db: Session, job: Job) -> dict[str, Any]:
    from app.modules.ai_engine.workflows import _call, _record, _rejected

    scene = db.get(ThreeDScene, job.target_id)
    if scene is None:
        raise PermanentJobError("SCENE_MISSING", "The scene no longer exists.")
    lesson = db.get(Lesson, scene.lesson_id)
    assert lesson is not None
    spec = SceneSpec.model_validate(scene.scene_spec)
    comps = "\n".join(f"- {c.component_id}: {c.label}" for c in spec.components)
    paths = ", ".join(spec.paths) or "(none)"
    task = (
        f"Lesson: {lesson.title}\nScene: {spec.title}\nComponents:\n{comps}\n"
        f"Paths: {paths}\nCOMPONENT_IDS: {','.join(spec.component_ids())}"
    )
    plan, usage = _call(
        db, job, ANIMATION_PLANNING, task, lesson_passages(lesson), AnimationPlanLLM
    )
    try:
        anim = convert_animation(plan, spec, set(spec.animation_refs))
        row = save_animation(db, scene, anim, job.requested_by, origin="ai")
    except OutputRejectedError as exc:
        raise _rejected(exc) from exc
    except AnimationInvalidError as exc:
        raise PermanentJobError(
            "INVALID_OUTPUT", "The planned animation did not validate."
        ) from exc
    _record(
        db,
        job,
        usage,
        ANIMATION_PLANNING,
        kind="animation",
        target_type="three_d_scene",
        target_id=scene.id,
        output=anim.model_dump(mode="json"),
        validation={},
        status="applied",
    )
    db.commit()
    return {"animation_id": str(row.id), "steps": len(anim.steps)}


def start_animation_plan(db: Session, user: Any, scene_id: uuid.UUID) -> Job:
    from app.modules.ai_engine.service import _check_budget
    from app.modules.operations import audit
    from app.modules.operations.runner import create_job, dispatch
    from app.modules.three_d.scenes_service import _manage_scene

    scene, course = _manage_scene(db, user, scene_id)
    if not SceneSpec.model_validate(scene.scene_spec).components:
        raise NotFoundError("The scene has no components to animate.")
    _check_budget(db, course.id)
    job = create_job(
        db,
        job_type=JobType.ANIMATION_PLANNING,
        target_type="three_d_scene",
        target_id=scene.id,
        requested_by=user.id,
        course_id=course.id,
        school_id=course.school_id,
    )
    audit.record(
        db,
        action="ai.animation_planning.requested",
        resource_type="three_d_scene",
        resource_id=scene.id,
        actor_user_id=user.id,
        school_id=course.school_id,
    )
    db.commit()
    dispatch(job.id)
    db.refresh(job)
    return job
