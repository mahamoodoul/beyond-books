import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl

from app.modules.three_d.contracts import AnimationSpec, SceneSpec


class AssetCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=5000)
    category: str | None = Field(default=None, max_length=80)
    subject: str | None = Field(default=None, max_length=80)
    license_name: str = Field(min_length=1, max_length=120)
    source_url: HttpUrl | None = None
    attribution_text: str = Field(default="", max_length=2000)
    school_id: uuid.UUID | None = None


class AssetVersionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    version_number: int
    status: str
    file_size_bytes: int
    error_message: str | None
    metadata_json: dict[str, Any]
    created_at: datetime


class AssetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    slug: str
    name: str
    description: str
    category: str | None
    subject: str | None
    visibility: str
    license_name: str
    source_url: str | None
    attribution_text: str
    provider: str
    review_status: str
    review_notes: str | None
    latest_version: int
    created_at: datetime
    can_manage: bool = False
    versions: list[AssetVersionOut] = []


class AssetVersionUploadRequest(BaseModel):
    size_bytes: int = Field(gt=0)


class AssetUploadResponse(BaseModel):
    version_number: int
    url: str
    method: str
    headers: dict[str, str]


class AssetReview(BaseModel):
    decision: Literal["approved", "rejected"]
    notes: str | None = Field(default=None, max_length=2000)


class DownloadUrl(BaseModel):
    url: str
    expires_in_s: int


class SceneCreate(BaseModel):
    spec: SceneSpec


class SceneUpdate(BaseModel):
    expected_version: int = Field(ge=1)
    spec: SceneSpec


class SceneOut(BaseModel):
    id: uuid.UUID
    lesson_id: uuid.UUID
    title: str
    status: str
    version: int
    published_version: int | None
    has_unpublished_changes: bool
    spec: SceneSpec
    warnings: list[str] = []
    origin: str = "manual"
    planning_rationale: str | None = None
    updated_at: datetime


class ResolvedAsset(BaseModel):
    asset_id: str
    version: int
    url: str
    node_names: list[str]
    name: str
    license_name: str
    attribution_text: str
    source_url: str | None


class ResolvedScene(BaseModel):
    scene_id: uuid.UUID
    version: int
    spec: SceneSpec
    assets: list[ResolvedAsset]
    warnings: list[str]
    animations: list[AnimationSpec] = []


class GeneratorParamOut(BaseModel):
    name: str
    kind: str
    min: float | None
    max: float | None


class GeneratorOut(BaseModel):
    name: str
    description: str
    params: list[GeneratorParamOut]
    default_components: list[str]


class GenerationRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    prompt: str = Field(min_length=5, max_length=8000)
    provider: str | None = Field(default=None, max_length=40, description="Default if omitted")
    lesson_id: uuid.UUID | None = Field(
        default=None, description="Save the finished model into this lesson as a draft scene"
    )
    subject: str | None = Field(default=None, max_length=80)
    school_id: uuid.UUID | None = None


class GenerationResponse(BaseModel):
    asset: "AssetOut"
    job_id: uuid.UUID
    job_status: str


class ThreeDProviderOut(BaseModel):
    name: str
    description: str
    is_default: bool


class ChapterSceneOut(BaseModel):
    """A scene in the chapter 3D Studio board, with its lesson and readiness."""

    scene: SceneOut
    lesson_id: uuid.UUID
    lesson_title: str
    lesson_position: int
    parts: int
    explained: int


class AvailablePart(BaseModel):
    mesh_name: str
    label: str
    description: str
    source: str  # asset slug or "generator:<name>"
    in_scene: bool


class ChapterGenerateRequest(BaseModel):
    only_missing: bool = Field(default=True, description="Skip lessons that already have a scene")


class ChapterGenerateItem(BaseModel):
    lesson_id: uuid.UUID
    lesson_title: str
    job_id: uuid.UUID | None
    status: str  # queued/completed/failed… or "skipped"
    reason: str | None = None


class ChapterGenerateResult(BaseModel):
    items: list[ChapterGenerateItem]


class PromptDraftRequest(BaseModel):
    """Topic for an AI-written, in-depth 3D build brief (3D library)."""

    topic: str = Field(min_length=2, max_length=200)
    subject: str | None = Field(default=None, max_length=80)
    level: str | None = Field(default=None, max_length=80, description="e.g. Year 9, university")
    focus: str | None = Field(default=None, max_length=500, description="What to emphasise")


class ProviderHealthOut(BaseModel):
    name: str
    ok: bool
    message: str


class PartDeepDiveRequest(BaseModel):
    part: str = Field(min_length=1, max_length=128, description="Node name of the part")


class PartUpdate(BaseModel):
    label: str | None = Field(default=None, max_length=200)
    description: str | None = Field(default=None, max_length=2000)


class GenerationJobOut(BaseModel):
    """A 3D generation in the library's "In progress" list (running or recently finished)."""

    job_id: uuid.UUID
    asset_id: uuid.UUID
    asset_name: str
    provider: str
    status: str
    error_message: str | None
    created_at: datetime
    finished_at: datetime | None
    prompt_preview: str
    has_model: bool
    lesson_id: uuid.UUID | None = None
    lesson_title: str | None = None
    scene_id: uuid.UUID | None = None


class PromptDraftOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    topic: str
    subject: str | None
    level: str | None
    focus: str | None
    title: str
    prompt: str
    parts: list[dict[str, Any]]
    edited: bool
    created_at: datetime
    updated_at: datetime


class PromptDraftUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    prompt: str | None = Field(default=None, min_length=5, max_length=8000)
