import uuid
from typing import Any

from fastapi import APIRouter, status

from app.core.config import get_settings
from app.core.deps import DB, CurrentUser, Teacher
from app.modules.operations.api import JobOut
from app.modules.operations.models import Job
from app.modules.three_d import assets_service as assets
from app.modules.three_d import scenes_service as scenes
from app.modules.three_d.models import ThreeDAsset
from app.modules.three_d.preview import preview_url
from app.modules.three_d.procedural import GENERATORS
from app.modules.three_d.schemas import (
    AssetCreate,
    AssetOut,
    AssetReview,
    AssetUploadResponse,
    AssetVersionOut,
    AssetVersionUploadRequest,
    AvailablePart,
    ChapterGenerateRequest,
    ChapterGenerateResult,
    ChapterSceneOut,
    DownloadUrl,
    GenerationJobOut,
    GenerationRequest,
    GenerationResponse,
    GeneratorOut,
    GeneratorParamOut,
    PartDeepDiveRequest,
    PartUpdate,
    PromptDraftOut,
    PromptDraftRequest,
    PromptDraftUpdate,
    ProviderHealthOut,
    ResolvedScene,
    SceneCreate,
    SceneOut,
    SceneUpdate,
    StudioSceneOut,
    ThreeDProviderOut,
)
from app.modules.users.models import User

router = APIRouter(tags=["3d"])


def _asset_out(db: DB, user: User, asset: ThreeDAsset, *, with_versions: bool) -> AssetOut:
    out = AssetOut.model_validate(asset).model_copy(
        update={"can_manage": assets.can_manage_asset(db, user, asset)}
    )
    all_versions = assets.versions(db, asset.id)
    if with_versions:
        out.versions = [AssetVersionOut.model_validate(v) for v in all_versions]
    latest = next((v for v in all_versions if v.version_number == asset.latest_version), None)
    out.preview_url = preview_url(latest)
    return out


@router.get("/assets", response_model=list[AssetOut])
def list_assets(user: CurrentUser, db: DB) -> list[AssetOut]:
    return [_asset_out(db, user, a, with_versions=False) for a in assets.list_assets(db, user)]


@router.get("/assets/search", response_model=list[AssetOut])
def search_assets(q: str, user: CurrentUser, db: DB) -> list[AssetOut]:
    return [
        _asset_out(db, user, a, with_versions=False)
        for a in assets.search_assets(db, user, q[:200])
    ]


def _prompt_summary(prompt: str, limit: int = 5000) -> str:
    text = f"AI-generated from prompt: {prompt.strip()}"
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


@router.post(
    "/assets/generation-jobs",
    response_model=GenerationResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
def generate_asset(body: GenerationRequest, user: Teacher, db: DB) -> GenerationResponse:
    """Search the library first (GET /assets/search); generation costs provider credits."""
    from app.integrations.three_d import get_three_d_provider
    from app.modules.ai_engine.scene_planning import check_generation_budget, start_generation

    check_generation_budget(db, user)
    if body.lesson_id:  # only lessons this teacher manages (raises 403/404 otherwise)
        scenes._lesson_and_course(db, user, body.lesson_id)
    try:
        provider = get_three_d_provider(body.provider).name
    except ValueError as exc:
        from app.core.errors import AppError

        raise AppError(f"3D provider '{body.provider}' is not available.") from exc
    asset = assets.create_asset(
        db,
        user,
        AssetCreate(
            name=body.name,
            subject=body.subject,
            school_id=body.school_id,
            # The full prompt stays in the job's input_snapshot; the description is a summary.
            description=_prompt_summary(body.prompt),
            license_name=f"AI-generated ({provider}); check provider terms",
            attribution_text=f"Generated with {provider}",
        ),
    )
    asset.provider = provider
    db.commit()
    job = start_generation(db, user, asset, body.prompt, provider, body.lesson_id)
    asset = assets.get_asset_for(db, user, asset.id, manage=True)
    return GenerationResponse(
        asset=_asset_out(db, user, asset, with_versions=True), job_id=job.id, job_status=job.status
    )


@router.get("/assets/generation-jobs", response_model=list[GenerationJobOut])
def generation_jobs(user: Teacher, db: DB) -> list[dict[str, Any]]:
    """Your running 3D generations, failures from the last 24 h and models finished in the last
    10 minutes (3D library "In progress"). Registered before /assets/{asset_id}."""
    from app.modules.ai_engine.scene_planning import list_generation_jobs

    return list_generation_jobs(db, user)


@router.post("/assets/generation-jobs/{job_id}/dismiss", status_code=status.HTTP_204_NO_CONTENT)
def dismiss_generation(job_id: uuid.UUID, user: Teacher, db: DB) -> None:
    """Remove a finished or failed generation from the "In progress" list."""
    from app.modules.ai_engine.scene_planning import dismiss_generation as dismiss

    dismiss(db, user, job_id)


@router.post(
    "/assets/{asset_id}/generation-jobs/retry",
    response_model=JobOut,
    status_code=status.HTTP_202_ACCEPTED,
)
def retry_generation(asset_id: uuid.UUID, user: Teacher, db: DB) -> Job:
    """Run this model's last generation again (same prompt and generator)."""
    from app.modules.ai_engine.scene_planning import retry_generation as retry

    return retry(db, user, asset_id)


@router.post("/assets", response_model=AssetOut, status_code=status.HTTP_201_CREATED)
def create_asset(body: AssetCreate, user: Teacher, db: DB) -> AssetOut:
    return _asset_out(db, user, assets.create_asset(db, user, body), with_versions=True)


@router.get("/assets/{asset_id}", response_model=AssetOut)
def get_asset(asset_id: uuid.UUID, user: CurrentUser, db: DB) -> AssetOut:
    asset = assets.get_asset_for(db, user, asset_id, manage=False)
    return _asset_out(db, user, asset, with_versions=True)


@router.post(
    "/assets/{asset_id}/versions/upload-url",
    response_model=AssetUploadResponse,
    status_code=status.HTTP_201_CREATED,
)
def version_upload_url(
    asset_id: uuid.UUID, body: AssetVersionUploadRequest, user: CurrentUser, db: DB
) -> AssetUploadResponse:
    v, url, method, headers = assets.start_version_upload(db, user, asset_id, body.size_bytes)
    return AssetUploadResponse(
        version_number=v.version_number, url=url, method=method, headers=headers
    )


@router.post("/assets/{asset_id}/versions/{n}/complete", response_model=AssetOut)
def complete_version(asset_id: uuid.UUID, n: int, user: CurrentUser, db: DB) -> AssetOut:
    assets.complete_version_upload(db, user, asset_id, n)
    asset = assets.get_asset_for(db, user, asset_id, manage=True)
    return _asset_out(db, user, asset, with_versions=True)


@router.post("/assets/{asset_id}/review", response_model=AssetOut)
def review(asset_id: uuid.UUID, body: AssetReview, user: CurrentUser, db: DB) -> AssetOut:
    asset = assets.review_asset(db, user, asset_id, body.decision, body.notes)
    return _asset_out(db, user, asset, with_versions=True)


@router.get("/assets/{asset_id}/versions/{n}/download-url", response_model=DownloadUrl)
def download_url(asset_id: uuid.UUID, n: int, user: CurrentUser, db: DB) -> DownloadUrl:
    return DownloadUrl(
        url=assets.download_url(db, user, asset_id, n),
        expires_in_s=get_settings().download_url_ttl_s,
    )


@router.post(
    "/assets/{asset_id}/ai/part-deep-dive",
    response_model=JobOut,
    status_code=status.HTTP_202_ACCEPTED,
)
def part_deep_dive(asset_id: uuid.UUID, body: PartDeepDiveRequest, user: Teacher, db: DB) -> Job:
    """In-depth AI study card for one part (3D viewer). Result in the job's `result.card`;
    cached per model version, so repeat requests are instant and free."""
    from app.modules.ai_engine.part_deep_dive import start_deep_dive

    return start_deep_dive(db, user, asset_id, body.part)


@router.post(
    "/assets/{asset_id}/ai/part-descriptions",
    response_model=JobOut,
    status_code=status.HTTP_202_ACCEPTED,
)
def write_part_descriptions(asset_id: uuid.UUID, user: Teacher, db: DB) -> Job:
    """AI writes descriptions for parts that have none (drafts for teacher review)."""
    from app.modules.ai_engine.part_descriptions import start_part_descriptions

    return start_part_descriptions(db, user, asset_id)


@router.post(
    "/assets/{asset_id}/ai/tour", response_model=JobOut, status_code=status.HTTP_202_ACCEPTED
)
def model_tour(asset_id: uuid.UUID, user: Teacher, db: DB) -> Job:
    """Guided-tour narration (intro + each part's link to the main topic) for the Studio.
    Result in the job's `result.tour`; cached per model version."""
    from app.modules.ai_engine.part_deep_dive import start_tour

    return start_tour(db, user, asset_id)


@router.patch("/assets/{asset_id}/parts/{part}", response_model=AssetOut)
def update_asset_part(
    asset_id: uuid.UUID, part: str, body: PartUpdate, user: Teacher, db: DB
) -> AssetOut:
    """Edit one part's label/explanation in the latest version (Studio; owners only)."""
    asset = assets.update_part(
        db, user, asset_id, part, label=body.label, description=body.description
    )
    return _asset_out(db, user, asset, with_versions=True)


@router.delete("/assets/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_asset(asset_id: uuid.UUID, user: Teacher, db: DB) -> None:
    """Delete a model you manage. 409 ASSET_IN_USE while a lesson scene still uses it."""
    assets.delete_asset(db, user, asset_id)


@router.get("/three-d/providers", response_model=list[ThreeDProviderOut])
def three_d_providers(user: Teacher) -> list[ThreeDProviderOut]:
    """3D generation providers that are configured (have their keys) and selectable."""
    from app.core.config import get_settings
    from app.integrations import providers

    s = get_settings()
    return [
        ThreeDProviderOut(
            name=p.name, description=p.description, is_default=p.name == s.three_d_provider
        )
        for p in providers.available("three_d", s)
    ]


@router.get("/three-d/provider-health", response_model=ProviderHealthOut)
def three_d_provider_health(name: str, user: Teacher) -> ProviderHealthOut:
    """Live check for providers that need a local tool (e.g. Blender running with its add-on)."""
    from app.integrations.three_d import get_three_d_provider

    try:
        provider = get_three_d_provider(name)
    except ValueError:
        return ProviderHealthOut(name=name, ok=False, message="This provider is not configured.")
    health = getattr(provider, "health", None)
    if health is None:
        return ProviderHealthOut(name=name, ok=True, message="Ready.")
    ok, message = health()
    return ProviderHealthOut(name=name, ok=ok, message=message)


@router.post("/three-d/prompt-drafts", response_model=JobOut, status_code=status.HTTP_202_ACCEPTED)
def draft_three_d_prompt(body: PromptDraftRequest, user: Teacher, db: DB) -> Job:
    """The LLM writes an in-depth build brief for a topic. Result: the job's `result`
    ({title, prompt, parts}); the teacher edits it, then starts a generation job with it."""
    from app.modules.ai_engine.prompt_draft import start_prompt_draft

    return start_prompt_draft(
        db, user, topic=body.topic, subject=body.subject, level=body.level, focus=body.focus
    )


@router.get("/three-d/prompt-drafts", response_model=list[PromptDraftOut])
def list_prompt_drafts(user: Teacher, db: DB, topic: str | None = None) -> list[Any]:
    """Your saved AI-written 3D prompts, newest first (optionally matching a topic)."""
    from app.modules.ai_engine.prompt_draft import list_drafts

    return list_drafts(db, user, topic)


@router.patch("/three-d/prompt-drafts/{draft_id}", response_model=PromptDraftOut)
def update_prompt_draft(draft_id: uuid.UUID, body: PromptDraftUpdate, user: Teacher, db: DB) -> Any:
    from app.modules.ai_engine.prompt_draft import update_draft

    return update_draft(db, user, draft_id, title=body.title, prompt=body.prompt)


@router.delete("/three-d/prompt-drafts/{draft_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_prompt_draft(draft_id: uuid.UUID, user: Teacher, db: DB) -> None:
    from app.modules.ai_engine.prompt_draft import delete_draft

    delete_draft(db, user, draft_id)


@router.get("/three-d/generators", response_model=list[GeneratorOut])
def generators(user: CurrentUser) -> list[GeneratorOut]:
    return [
        GeneratorOut(
            name=g.name,
            description=g.description,
            params=[
                GeneratorParamOut(name=k, kind=p.kind.__name__, min=p.lo, max=p.hi)
                for k, p in g.params.items()
            ],
            default_components=g.components({}),
        )
        for g in GENERATORS.values()
    ]


@router.post(
    "/lessons/{lesson_id}/scenes", response_model=SceneOut, status_code=status.HTTP_201_CREATED
)
def create_scene(lesson_id: uuid.UUID, body: SceneCreate, user: CurrentUser, db: DB) -> SceneOut:
    return scenes.create_scene(db, user, lesson_id, body.spec)


@router.get("/lessons/{lesson_id}/scenes", response_model=list[SceneOut])
def list_scenes(lesson_id: uuid.UUID, user: CurrentUser, db: DB) -> list[SceneOut]:
    return scenes.list_scenes(db, user, lesson_id)


@router.get("/studio/scenes", response_model=list[StudioSceneOut])
def studio_scenes(user: CurrentUser, db: DB) -> list[StudioSceneOut]:
    """Student 3D Studio: only the published scenes of the student's enrolled courses."""
    return scenes.student_studio_scenes(db, user)


@router.get("/scenes/{scene_id}", response_model=SceneOut)
def get_scene(scene_id: uuid.UUID, user: CurrentUser, db: DB) -> SceneOut:
    return scenes.get_scene(db, user, scene_id)


@router.patch("/scenes/{scene_id}", response_model=SceneOut)
def update_scene(scene_id: uuid.UUID, body: SceneUpdate, user: CurrentUser, db: DB) -> SceneOut:
    return scenes.update_scene(db, user, scene_id, body.expected_version, body.spec)


@router.post("/scenes/{scene_id}/publish", response_model=SceneOut)
def publish_scene(scene_id: uuid.UUID, user: CurrentUser, db: DB) -> SceneOut:
    return scenes.publish_scene(db, user, scene_id)


@router.post("/scenes/{scene_id}/unpublish", response_model=SceneOut)
def unpublish_scene(scene_id: uuid.UUID, user: CurrentUser, db: DB) -> SceneOut:
    return scenes.unpublish_scene(db, user, scene_id)


@router.delete("/scenes/{scene_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_scene(scene_id: uuid.UUID, user: CurrentUser, db: DB) -> None:
    scenes.delete_scene(db, user, scene_id)


@router.get("/scenes/{scene_id}/resolved", response_model=ResolvedScene)
def resolve(scene_id: uuid.UUID, user: CurrentUser, db: DB) -> ResolvedScene:
    return scenes.resolve_scene(db, user, scene_id)


# ------------------------------------------------------------ chapter 3D Studio


@router.get("/chapters/{chapter_id}/scenes", response_model=list[ChapterSceneOut])
def chapter_scenes(chapter_id: uuid.UUID, user: CurrentUser, db: DB) -> list[ChapterSceneOut]:
    return scenes.chapter_scenes(db, user, chapter_id)


@router.post(
    "/chapters/{chapter_id}/ai/scenes",
    response_model=ChapterGenerateResult,
    status_code=status.HTTP_202_ACCEPTED,
)
def generate_chapter_scenes(
    chapter_id: uuid.UUID, body: ChapterGenerateRequest, user: CurrentUser, db: DB
) -> ChapterGenerateResult:
    """AI-plan a 3D scene for every lesson in the chapter (one job per lesson; drafts only)."""
    return ChapterGenerateResult(
        items=scenes.generate_chapter_scenes(db, user, chapter_id, body.only_missing)
    )


@router.get("/scenes/{scene_id}/available-parts", response_model=list[AvailablePart])
def available_parts(scene_id: uuid.UUID, user: CurrentUser, db: DB) -> list[AvailablePart]:
    return scenes.available_parts(db, user, scene_id)


@router.post(
    "/scenes/{scene_id}/duplicate", response_model=SceneOut, status_code=status.HTTP_201_CREATED
)
def duplicate_scene(scene_id: uuid.UUID, user: CurrentUser, db: DB) -> SceneOut:
    return scenes.duplicate_scene(db, user, scene_id)
