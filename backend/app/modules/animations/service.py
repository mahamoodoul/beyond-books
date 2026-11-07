"""Guided animations attached to scenes (design §7.6, Phase 6)."""

import uuid

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import AppError, ConflictError, NotFoundError
from app.modules.operations import audit
from app.modules.three_d.contracts import AnimationSpec, SceneSpec, validate_animation_for_scene
from app.modules.three_d.models import ThreeDAnimation, ThreeDScene
from app.modules.three_d.scenes_service import _manage_scene
from app.modules.users.models import User


class AnimationInvalidError(AppError):
    status_code = 422
    code = "ANIMATION_INVALID"
    message = "The animation does not match the scene."


class AnimationOut(BaseModel):
    id: uuid.UUID
    scene_id: uuid.UUID
    title: str
    version: int
    origin: str
    spec: AnimationSpec
    problems: list[str] = []


def to_out(a: ThreeDAnimation, scene_spec: SceneSpec | None = None) -> AnimationOut:
    spec = AnimationSpec.model_validate(a.spec)
    problems = validate_animation_for_scene(spec, scene_spec) if scene_spec else []
    return AnimationOut(
        id=a.id,
        scene_id=a.scene_id,
        title=a.title,
        version=a.version,
        origin=a.origin,
        spec=spec,
        problems=problems,
    )


def _ensure_ref(scene: ThreeDScene, key: str) -> SceneSpec:
    """Add the animation id to the scene's animation_refs (a new scene version) if missing."""
    spec = SceneSpec.model_validate(scene.scene_spec)
    if key not in spec.animation_refs:
        spec = spec.model_copy(update={"animation_refs": [*spec.animation_refs, key]})
        scene.scene_spec = spec.model_dump(mode="json")
        scene.version += 1
    return spec


def _validate(spec: AnimationSpec, scene_spec: SceneSpec) -> None:
    ref_spec = scene_spec.model_copy(
        update={"animation_refs": list({*scene_spec.animation_refs, spec.animation_id})}
    )
    problems = validate_animation_for_scene(spec, ref_spec)
    if problems:
        raise AnimationInvalidError(details=[{"msg": p} for p in problems])


def save_animation(
    db: Session,
    scene: ThreeDScene,
    spec: AnimationSpec,
    user_id: uuid.UUID | None,
    origin: str = "manual",
) -> ThreeDAnimation:
    """Validate + persist (caller has authorized). Used by the API and the AI planner."""
    _validate(spec, SceneSpec.model_validate(scene.scene_spec))
    exists = db.scalar(
        select(ThreeDAnimation.id).where(
            ThreeDAnimation.scene_id == scene.id, ThreeDAnimation.animation_key == spec.animation_id
        )
    )
    if exists:
        raise ConflictError(f"Animation '{spec.animation_id}' already exists in this scene.")
    a = ThreeDAnimation(
        scene_id=scene.id,
        animation_key=spec.animation_id,
        title=spec.title,
        schema_version=spec.schema_version,
        spec=spec.model_dump(mode="json"),
        origin=origin,
        created_by=user_id,
    )
    db.add(a)
    _ensure_ref(scene, spec.animation_id)
    db.flush()
    return a


def create(db: Session, user: User, scene_id: uuid.UUID, spec: AnimationSpec) -> AnimationOut:
    scene, _ = _manage_scene(db, user, scene_id)
    a = save_animation(db, scene, spec, user.id)
    audit.record(
        db,
        action="animation.create",
        resource_type="three_d_animation",
        resource_id=a.id,
        actor_user_id=user.id,
    )
    db.commit()
    return to_out(a, SceneSpec.model_validate(scene.scene_spec))


def list_for_scene(db: Session, user: User, scene_id: uuid.UUID) -> list[AnimationOut]:
    scene, _ = _manage_scene(db, user, scene_id)
    spec = SceneSpec.model_validate(scene.scene_spec)
    rows = db.scalars(
        select(ThreeDAnimation)
        .where(ThreeDAnimation.scene_id == scene.id)
        .order_by(ThreeDAnimation.created_at)
    )
    return [to_out(a, spec) for a in rows]


def _manage(
    db: Session, user: User, animation_id: uuid.UUID
) -> tuple[ThreeDAnimation, ThreeDScene]:
    a = db.get(ThreeDAnimation, animation_id)
    if a is None:
        raise NotFoundError()
    scene, _ = _manage_scene(db, user, a.scene_id)
    return a, scene


def update(
    db: Session, user: User, animation_id: uuid.UUID, expected_version: int, spec: AnimationSpec
) -> AnimationOut:
    a, scene = _manage(db, user, animation_id)
    if a.version != expected_version:
        raise ConflictError("This animation was changed by someone else. Reload it.")
    if spec.animation_id != a.animation_key:
        raise ConflictError("animation_id cannot be changed; create a new animation instead.")
    _validate(spec, SceneSpec.model_validate(scene.scene_spec))
    a.spec = spec.model_dump(mode="json")
    a.title = spec.title
    a.version += 1
    scene.version += 1  # scene content changed → students keep the published snapshot
    db.commit()
    return to_out(a, SceneSpec.model_validate(scene.scene_spec))


def delete(db: Session, user: User, animation_id: uuid.UUID) -> None:
    a, scene = _manage(db, user, animation_id)
    spec = SceneSpec.model_validate(scene.scene_spec)
    scene.scene_spec = spec.model_copy(
        update={"animation_refs": [r for r in spec.animation_refs if r != a.animation_key]}
    ).model_dump(mode="json")
    scene.version += 1
    db.delete(a)
    db.commit()


def snapshot_for_publish(db: Session, scene: ThreeDScene) -> list[dict[str, object]]:
    """Validate every referenced animation against the scene; return specs to snapshot."""
    spec = SceneSpec.model_validate(scene.scene_spec)
    rows = {
        a.animation_key: a
        for a in db.scalars(select(ThreeDAnimation).where(ThreeDAnimation.scene_id == scene.id))
    }
    out: list[dict[str, object]] = []
    problems: list[str] = []
    for key in spec.animation_refs:
        a = rows.get(key)
        if a is None:
            problems.append(f"animation '{key}' is referenced but does not exist")
            continue
        anim = AnimationSpec.model_validate(a.spec)
        problems += [f"{key}: {p}" for p in validate_animation_for_scene(anim, spec)]
        out.append(a.spec)
    if problems:
        raise AnimationInvalidError(details=[{"msg": p} for p in problems])
    return out
