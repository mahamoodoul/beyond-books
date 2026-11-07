import uuid

from fastapi import APIRouter, status

from app.core.config import get_settings
from app.core.deps import DB, CurrentUser, Teacher
from app.modules.three_d import assets_service as assets
from app.modules.three_d import scenes_service as scenes
from app.modules.three_d.models import ThreeDAsset
from app.modules.three_d.procedural import GENERATORS
from app.modules.three_d.schemas import (
    AssetCreate,
    AssetOut,
    AssetReview,
    AssetUploadResponse,
    AssetVersionOut,
    AssetVersionUploadRequest,
    DownloadUrl,
    GenerationRequest,
    GenerationResponse,
    GeneratorOut,
    GeneratorParamOut,
    ResolvedScene,
    SceneCreate,
    SceneOut,
    SceneUpdate,
)
from app.modules.users.models import User

router = APIRouter(tags=["3d"])


def _asset_out(db: DB, user: User, asset: ThreeDAsset, *, with_versions: bool) -> AssetOut:
    out = AssetOut.model_validate(asset).model_copy(
        update={"can_manage": assets.can_manage_asset(db, user, asset)}
    )
    if with_versions:
        out.versions = [AssetVersionOut.model_validate(v) for v in assets.versions(db, asset.id)]
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
    provider = get_three_d_provider().name
    asset = assets.create_asset(
        db,
        user,
        AssetCreate(
            name=body.name,
            subject=body.subject,
            school_id=body.school_id,
            description=f"AI-generated from prompt: {body.prompt}",
            license_name=f"AI-generated ({provider}); check provider terms",
            attribution_text=f"Generated with {provider}",
        ),
    )
    asset.provider = provider
    db.commit()
    job = start_generation(db, user, asset, body.prompt)
    asset = assets.get_asset_for(db, user, asset.id, manage=True)
    return GenerationResponse(
        asset=_asset_out(db, user, asset, with_versions=True), job_id=job.id, job_status=job.status
    )


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
