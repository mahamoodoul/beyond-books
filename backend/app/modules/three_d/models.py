import uuid
from datetime import datetime
from enum import StrEnum
from typing import Any

from sqlalchemy import BigInteger, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import (
    Base,
    CreatedAtMixin,
    JSONType,
    TimestampMixin,
    UTCDateTime,
    UUIDPrimaryKeyMixin,
)


class AssetVisibility(StrEnum):
    PRIVATE = "private"  # creator only (and their course managers)
    SCHOOL = "school"  # members of owner_school_id
    LIBRARY = "library"  # platform library: every teacher; set by admins/seed only


class ReviewStatus(StrEnum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class ThreeDAsset(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "three_d_assets"
    __table_args__ = (Index("ix_three_d_assets_visibility_review", "visibility", "review_status"),)

    slug: Mapped[str] = mapped_column(String(64), unique=True)
    owner_school_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("schools.id", ondelete="SET NULL")
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    visibility: Mapped[str] = mapped_column(String(20), default=AssetVisibility.PRIVATE)
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    category: Mapped[str | None] = mapped_column(String(80))
    subject: Mapped[str | None] = mapped_column(String(80))
    license_name: Mapped[str] = mapped_column(String(120))
    source_url: Mapped[str | None] = mapped_column(String(500))
    attribution_text: Mapped[str] = mapped_column(Text, default="")
    provider: Mapped[str] = mapped_column(String(40), default="upload")  # upload|tripo|meshy|seed
    review_status: Mapped[str] = mapped_column(String(20), default=ReviewStatus.PENDING)
    review_notes: Mapped[str | None] = mapped_column(Text)
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    latest_version: Mapped[int] = mapped_column(Integer, default=0)


class ThreeDAssetVersion(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    __tablename__ = "three_d_asset_versions"
    __table_args__ = (UniqueConstraint("asset_id", "version_number"),)

    asset_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("three_d_assets.id", ondelete="CASCADE"))
    version_number: Mapped[int] = mapped_column(Integer)
    storage_key: Mapped[str] = mapped_column(String(500))
    format: Mapped[str] = mapped_column(String(20), default="glb")
    file_size_bytes: Mapped[int] = mapped_column(BigInteger)
    content_hash: Mapped[str | None] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(20), default="pending_upload")  # → ready|failed
    error_message: Mapped[str | None] = mapped_column(Text)
    # node_names, triangle_count, mesh_count, ... from glb.inspect_glb
    metadata_json: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict)


class ThreeDScene(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A lesson's 3D scene. `scene_spec` is the editable draft (validated SceneSpec);
    `published_spec` is the snapshot students see. Components live inside the spec; a separate
    components table (design §8.2) can be derived when analytics need it."""

    __tablename__ = "three_d_scenes"

    lesson_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("lessons.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(String(200))
    schema_version: Mapped[str] = mapped_column(String(10))
    scene_spec: Mapped[dict[str, Any]] = mapped_column(JSONType)
    status: Mapped[str] = mapped_column(String(20), default="draft")
    version: Mapped[int] = mapped_column(Integer, default=1)
    published_version: Mapped[int | None] = mapped_column(Integer)
    published_spec: Mapped[dict[str, Any] | None] = mapped_column(JSONType)
    origin: Mapped[str] = mapped_column(String(20), default="manual")  # manual | ai
    planning_rationale: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
