"""Scene persistence, validation against real asset metadata, and resolution (design §7.2–7.3)."""

import uuid
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import AppError, ConflictError, NotFoundError
from app.integrations.storage import get_storage
from app.modules.chapters.service import get_chapter_for
from app.modules.courses.access import get_course_for
from app.modules.courses.models import Course
from app.modules.lessons.models import Lesson
from app.modules.lessons.service import get_lesson
from app.modules.operations import audit
from app.modules.three_d.assets_service import GLB_MIME
from app.modules.three_d.contracts import AnimationSpec, SceneSpec
from app.modules.three_d.models import (
    AssetVisibility,
    ReviewStatus,
    ThreeDAsset,
    ThreeDAssetVersion,
    ThreeDScene,
)
from app.modules.three_d.procedural import validate_procedural
from app.modules.three_d.schemas import (
    AvailablePart,
    ChapterGenerateItem,
    ChapterSceneOut,
    ResolvedAsset,
    ResolvedScene,
    SceneOut,
)
from app.modules.users.models import User


class SceneInvalidError(AppError):
    status_code = 422
    code = "SCENE_INVALID"
    message = "The scene does not match the available assets or generators."


@dataclass
class Check:
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    assets: list[tuple[ThreeDAsset, ThreeDAssetVersion]] = field(default_factory=list)


def _asset_usable_in_course(asset: ThreeDAsset, course: Course) -> bool:
    if asset.review_status != ReviewStatus.APPROVED:
        return False
    if asset.visibility == AssetVisibility.LIBRARY:
        return True
    if asset.visibility == AssetVisibility.SCHOOL:
        return asset.owner_school_id is not None and asset.owner_school_id == course.school_id
    return asset.created_by == course.created_by


def check_scene(db: Session, course: Course, spec: SceneSpec) -> Check:
    out = Check()
    names: set[str] = set()
    for ref in spec.asset_refs:
        asset = db.scalar(select(ThreeDAsset).where(ThreeDAsset.slug == ref.asset_id))
        if asset is None or not _asset_usable_in_course(asset, course):
            out.errors.append(f"asset '{ref.asset_id}' is not an approved asset available here")
            continue
        version = db.scalar(
            select(ThreeDAssetVersion).where(
                ThreeDAssetVersion.asset_id == asset.id,
                ThreeDAssetVersion.version_number == ref.version,
                ThreeDAssetVersion.status == "ready",
            )
        )
        if version is None:
            out.errors.append(f"asset '{ref.asset_id}' has no ready version {ref.version}")
            continue
        if ref.version != asset.latest_version:
            out.warnings.append(
                f"asset '{ref.asset_id}' v{ref.version} is not the latest (v{asset.latest_version})"
            )
        names |= set(version.metadata_json.get("node_names", []))
        out.assets.append((asset, version))
    for src in spec.procedural:
        errors, produced = validate_procedural(src)
        out.errors += errors
        names |= set(produced)
    for c in spec.components:
        if c.mesh_name not in names:
            out.errors.append(f"component '{c.component_id}' targets unknown mesh '{c.mesh_name}'")
    return out


def _require_valid(db: Session, course: Course, spec: SceneSpec) -> Check:
    check = check_scene(db, course, spec)
    if check.errors:
        raise SceneInvalidError(details=[{"msg": e} for e in check.errors])
    return check


def _lesson_and_course(db: Session, user: User, lesson_id: uuid.UUID) -> tuple[Lesson, Course]:
    lesson = db.get(Lesson, lesson_id)
    if lesson is None:
        raise NotFoundError()
    chapter = get_chapter_for(db, user, lesson.chapter_id, manage=True)
    return lesson, get_course_for(db, user, chapter.course_id, manage=True)


def _manage_scene(db: Session, user: User, scene_id: uuid.UUID) -> tuple[ThreeDScene, Course]:
    scene = db.get(ThreeDScene, scene_id)
    if scene is None:
        raise NotFoundError()
    _, course = _lesson_and_course(db, user, scene.lesson_id)
    return scene, course


def to_out(
    scene: ThreeDScene, *, published: bool = False, warnings: list[str] | None = None
) -> SceneOut:
    spec = scene.published_spec if published and scene.published_spec else scene.scene_spec
    return SceneOut(
        id=scene.id,
        lesson_id=scene.lesson_id,
        title=scene.title,
        status=scene.status,
        version=scene.published_version if published and scene.published_version else scene.version,
        published_version=scene.published_version,
        has_unpublished_changes=scene.published_version != scene.version,
        spec=SceneSpec.model_validate(spec),
        warnings=warnings or [],
        updated_at=scene.updated_at,
        origin=scene.origin,
        planning_rationale=scene.planning_rationale,
    )


def create_scene(db: Session, user: User, lesson_id: uuid.UUID, spec: SceneSpec) -> SceneOut:
    lesson, course = _lesson_and_course(db, user, lesson_id)
    check = _require_valid(db, course, spec)
    scene = ThreeDScene(
        lesson_id=lesson.id,
        title=spec.title,
        schema_version=spec.schema_version,
        scene_spec=spec.model_dump(mode="json"),
        created_by=user.id,
    )
    db.add(scene)
    db.flush()
    audit.record(
        db,
        action="scene.create",
        resource_type="three_d_scene",
        resource_id=scene.id,
        actor_user_id=user.id,
        school_id=course.school_id,
    )
    db.commit()
    return to_out(scene, warnings=check.warnings)


def update_scene(
    db: Session, user: User, scene_id: uuid.UUID, expected_version: int, spec: SceneSpec
) -> SceneOut:
    scene, course = _manage_scene(db, user, scene_id)
    if scene.version != expected_version:
        raise ConflictError("This scene was changed by someone else. Reload it.")
    check = _require_valid(db, course, spec)
    scene.scene_spec = spec.model_dump(mode="json")
    scene.title = spec.title
    scene.schema_version = spec.schema_version
    scene.version += 1
    db.commit()
    return to_out(scene, warnings=check.warnings)


def publish_scene(db: Session, user: User, scene_id: uuid.UUID) -> SceneOut:
    scene, course = _manage_scene(db, user, scene_id)
    # Re-check at publish time: an asset may have been rejected since the last edit.
    _require_valid(db, course, SceneSpec.model_validate(scene.scene_spec))
    from app.modules.animations.service import snapshot_for_publish

    scene.published_animations = snapshot_for_publish(db, scene)
    scene.published_spec = scene.scene_spec
    scene.published_version = scene.version
    scene.status = "published"
    audit.record(
        db,
        action="scene.publish",
        resource_type="three_d_scene",
        resource_id=scene.id,
        actor_user_id=user.id,
        school_id=course.school_id,
        metadata={"version": scene.version},
    )
    db.commit()
    return to_out(scene)


def unpublish_scene(db: Session, user: User, scene_id: uuid.UUID) -> SceneOut:
    scene, _ = _manage_scene(db, user, scene_id)
    scene.published_spec = None
    scene.published_animations = None
    scene.published_version = None
    scene.status = "draft"
    db.commit()
    return to_out(scene)


def delete_scene(db: Session, user: User, scene_id: uuid.UUID) -> None:
    scene, _ = _manage_scene(db, user, scene_id)
    db.delete(scene)
    db.commit()


def _can_manage_lesson(db: Session, user: User, lesson: Lesson) -> bool:
    try:
        _lesson_and_course(db, user, lesson.id)
    except AppError:
        return False
    return True


def _view(db: Session, user: User, scene: ThreeDScene) -> tuple[bool, Course]:
    """Return (is_manager, course). Students need the lesson published AND the scene published."""
    lesson = db.get(Lesson, scene.lesson_id)
    assert lesson is not None
    if _can_manage_lesson(db, user, lesson):
        return True, _lesson_and_course(db, user, lesson.id)[1]
    get_lesson(db, user, lesson.id)  # raises NotFound unless the student may see the lesson
    if scene.published_spec is None:
        raise NotFoundError()
    from app.modules.chapters.models import Chapter

    chapter = db.get(Chapter, lesson.chapter_id)
    assert chapter is not None
    course = db.get(Course, chapter.course_id)
    assert course is not None
    return False, course


def list_scenes(db: Session, user: User, lesson_id: uuid.UUID) -> list[SceneOut]:
    lesson = db.get(Lesson, lesson_id)
    if lesson is None:
        raise NotFoundError()
    manager = _can_manage_lesson(db, user, lesson)
    if not manager:
        get_lesson(db, user, lesson.id)
    scenes = db.scalars(
        select(ThreeDScene)
        .where(ThreeDScene.lesson_id == lesson_id)
        .order_by(ThreeDScene.created_at)
    )
    return [
        to_out(s, published=not manager) for s in scenes if manager or s.published_spec is not None
    ]


def get_scene(db: Session, user: User, scene_id: uuid.UUID) -> SceneOut:
    scene = db.get(ThreeDScene, scene_id)
    if scene is None:
        raise NotFoundError()
    manager, _ = _view(db, user, scene)
    return to_out(scene, published=not manager)


def resolve_scene(db: Session, user: User, scene_id: uuid.UUID) -> ResolvedScene:
    """Scene Resolver: returns the spec plus short-lived signed URLs for exactly the asset
    versions it references. Students only ever receive the published snapshot."""
    scene = db.get(ThreeDScene, scene_id)
    if scene is None:
        raise NotFoundError()
    manager, course = _view(db, user, scene)
    raw = scene.scene_spec if manager else scene.published_spec
    spec = SceneSpec.model_validate(raw)
    check = check_scene(db, course, spec)
    if check.errors:
        if not manager:
            raise NotFoundError("This 3D scene is temporarily unavailable.")
        raise SceneInvalidError(details=[{"msg": e} for e in check.errors])
    storage, ttl = get_storage(), get_settings().download_url_ttl_s
    assets = [
        ResolvedAsset(
            asset_id=a.slug,
            version=v.version_number,
            url=storage.presigned_download(
                key=v.storage_key, content_type=GLB_MIME, expires_in_s=ttl
            ),
            node_names=list(v.metadata_json.get("node_names", [])),
            name=a.name,
            license_name=a.license_name,
            attribution_text=a.attribution_text,
            source_url=a.source_url,
        )
        for a, v in check.assets
    ]
    if manager:
        from app.modules.three_d.models import ThreeDAnimation

        rows = db.scalars(select(ThreeDAnimation).where(ThreeDAnimation.scene_id == scene.id))
        by_key = {a.animation_key: a.spec for a in rows}
        animations = [by_key[k] for k in spec.animation_refs if k in by_key]
    else:
        animations = scene.published_animations or []
    return ResolvedScene(
        scene_id=scene.id,
        version=scene.version if manager else scene.published_version or scene.version,
        spec=spec,
        assets=assets,
        warnings=check.warnings,
        animations=[AnimationSpec.model_validate(a) for a in animations],
    )


def usable_assets_for_course(
    db: Session, course: Course
) -> list[tuple[ThreeDAsset, ThreeDAssetVersion]]:
    rows = db.execute(
        select(ThreeDAsset, ThreeDAssetVersion)
        .join(
            ThreeDAssetVersion,
            (ThreeDAssetVersion.asset_id == ThreeDAsset.id)
            & (ThreeDAssetVersion.version_number == ThreeDAsset.latest_version),
        )
        .where(
            ThreeDAsset.review_status == ReviewStatus.APPROVED, ThreeDAssetVersion.status == "ready"
        )
    ).all()
    return [(a, v) for a, v in rows if _asset_usable_in_course(a, course)]


def save_ai_scene(
    db: Session,
    lesson: Lesson,
    course: Course,
    spec: SceneSpec,
    rationale: str,
    user_id: uuid.UUID | None,
) -> ThreeDScene:
    """Persist an AI-planned scene as a DRAFT after full validation (never published here)."""
    check = check_scene(db, course, spec)
    if check.errors:
        raise SceneInvalidError(details=[{"msg": e} for e in check.errors])
    scene = ThreeDScene(
        lesson_id=lesson.id,
        title=spec.title,
        schema_version=spec.schema_version,
        scene_spec=spec.model_dump(mode="json"),
        created_by=user_id,
        origin="ai",
        planning_rationale=rationale[:2000],
    )
    db.add(scene)
    db.flush()
    return scene


# ------------------------------------------------------------ chapter 3D Studio


def chapter_scenes(db: Session, user: User, chapter_id: uuid.UUID) -> list[ChapterSceneOut]:
    """Every scene of every lesson in the chapter (teacher view: drafts included)."""
    from app.modules.chapters.service import get_chapter_for

    chapter = get_chapter_for(db, user, chapter_id, manage=True)
    rows = db.execute(
        select(ThreeDScene, Lesson)
        .join(Lesson, Lesson.id == ThreeDScene.lesson_id)
        .where(Lesson.chapter_id == chapter.id)
        .order_by(Lesson.position, ThreeDScene.created_at)
    ).all()
    out = []
    for scene, lesson in rows:
        spec = SceneSpec.model_validate(scene.scene_spec)
        explained = sum(
            1
            for c in spec.components
            if c.explanation_ref and spec.explanations.get(c.explanation_ref)
        )
        out.append(
            ChapterSceneOut(
                scene=to_out(scene),
                lesson_id=lesson.id,
                lesson_title=lesson.title,
                lesson_position=lesson.position,
                parts=len(spec.components),
                explained=explained,
            )
        )
    return out


def available_parts(db: Session, user: User, scene_id: uuid.UUID) -> list[AvailablePart]:
    """Parts that exist in the scene's models/generators (for 'add part' in the editor)."""
    from app.modules.three_d.procedural import GENERATORS

    scene, course = _manage_scene(db, user, scene_id)
    spec = SceneSpec.model_validate(scene.scene_spec)
    used = {c.mesh_name for c in spec.components}
    check = check_scene(db, course, spec)
    parts: dict[str, AvailablePart] = {}
    for asset, version in check.assets:
        meta = {p.get("name"): p for p in version.metadata_json.get("parts", [])}
        for name in version.metadata_json.get("node_names", []):
            m = meta.get(name, {})
            parts.setdefault(
                name,
                AvailablePart(
                    mesh_name=name,
                    label=str(m.get("label") or name.replace("_", " ").capitalize()),
                    description=str(m.get("description") or ""),
                    source=asset.slug,
                    in_scene=name in used,
                ),
            )
    for src in spec.procedural:
        gen = GENERATORS.get(src.generator)
        if gen is None:
            continue
        for name in gen.components(src.params):
            parts.setdefault(
                name,
                AvailablePart(
                    mesh_name=name,
                    label=name.replace("_", " ").capitalize(),
                    description="",
                    source=f"generator:{gen.name}",
                    in_scene=name in used,
                ),
            )
    return sorted(parts.values(), key=lambda p: (p.in_scene, p.label))


def duplicate_scene(db: Session, user: User, scene_id: uuid.UUID) -> SceneOut:
    scene, course = _manage_scene(db, user, scene_id)
    spec = SceneSpec.model_validate(scene.scene_spec)
    suffix = uuid.uuid4().hex[:4]
    copy = spec.model_copy(
        update={
            "scene_id": f"{spec.scene_id[:58]}_{suffix}",
            "title": f"{spec.title[:192]} (copy)",
            "animation_refs": [],  # animations belong to the original scene
        }
    )
    _require_valid(db, course, copy)
    new = ThreeDScene(
        lesson_id=scene.lesson_id,
        title=copy.title,
        schema_version=copy.schema_version,
        scene_spec=copy.model_dump(mode="json"),
        created_by=user.id,
        origin=scene.origin,
        planning_rationale=scene.planning_rationale,
    )
    db.add(new)
    db.flush()
    audit.record(
        db,
        action="scene.duplicate",
        resource_type="three_d_scene",
        resource_id=new.id,
        actor_user_id=user.id,
        school_id=course.school_id,
        metadata={"source_scene_id": str(scene.id)},
    )
    db.commit()
    return to_out(new)


def generate_chapter_scenes(
    db: Session, user: User, chapter_id: uuid.UUID, only_missing: bool
) -> list[ChapterGenerateItem]:
    """Run the AI scene planner for every lesson of the chapter (drafts only, never published)."""
    from app.core.errors import AppError
    from app.modules.ai_engine.service import start_scene_plan
    from app.modules.chapters.service import get_chapter_for
    from app.modules.lessons.content import LessonContent

    chapter = get_chapter_for(db, user, chapter_id, manage=True)
    lessons = list(
        db.scalars(select(Lesson).where(Lesson.chapter_id == chapter.id).order_by(Lesson.position))
    )
    with_scene = (
        set(
            db.scalars(
                select(ThreeDScene.lesson_id).where(
                    ThreeDScene.lesson_id.in_([lesson.id for lesson in lessons])
                )
            )
        )
        if lessons
        else set()
    )
    items: list[ChapterGenerateItem] = []
    for lesson in lessons:
        base = {"lesson_id": lesson.id, "lesson_title": lesson.title}
        if only_missing and lesson.id in with_scene:
            items.append(
                ChapterGenerateItem(
                    **base, job_id=None, status="skipped", reason="already has a 3D scene"
                )
            )
            continue
        if not LessonContent.model_validate(lesson.content_json).sections:
            items.append(
                ChapterGenerateItem(
                    **base, job_id=None, status="skipped", reason="lesson has no content yet"
                )
            )
            continue
        try:
            job = start_scene_plan(db, user, lesson.id)
        except AppError as exc:  # e.g. daily AI budget reached: report and stop
            items.append(
                ChapterGenerateItem(**base, job_id=None, status="skipped", reason=exc.message)
            )
            break
        items.append(ChapterGenerateItem(**base, job_id=job.id, status=str(job.status)))
    return items
