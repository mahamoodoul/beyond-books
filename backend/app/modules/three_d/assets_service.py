import hashlib
import re
import secrets
import uuid
from datetime import UTC, datetime

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.authz import require_school_role, school_role
from app.core.config import get_settings
from app.core.errors import AppError, ConflictError, NotFoundError, PermissionDeniedError
from app.integrations.storage import get_storage
from app.modules.operations import audit
from app.modules.organizations.models import SchoolMembership, SchoolRole
from app.modules.three_d.glb import InvalidGLBError, header_length, inspect_glb
from app.modules.three_d.models import (
    AssetVisibility,
    ReviewStatus,
    ThreeDAsset,
    ThreeDAssetVersion,
)
from app.modules.three_d.schemas import AssetCreate
from app.modules.users.models import AccountType, User

GLB_MIME = "model/gltf-binary"


class InvalidAssetError(AppError):
    status_code = 422
    code = "INVALID_ASSET"
    message = "The uploaded model is not valid."


def make_slug(name: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")[:40] or "asset"
    if not base[0].isalpha():
        base = f"a_{base}"
    return f"{base}_{secrets.token_hex(3)}"


def can_manage_asset(db: Session, user: User, asset: ThreeDAsset) -> bool:
    if asset.created_by == user.id:
        return True
    return (
        asset.owner_school_id is not None
        and school_role(db, user.id, asset.owner_school_id) == SchoolRole.SCHOOL_ADMIN
    )


def can_view_asset(db: Session, user: User, asset: ThreeDAsset) -> bool:
    if user.account_type != AccountType.TEACHER:
        return False
    if can_manage_asset(db, user, asset):
        return True
    if asset.review_status != ReviewStatus.APPROVED:
        return False
    if asset.visibility == AssetVisibility.LIBRARY:
        return True
    return (
        asset.visibility == AssetVisibility.SCHOOL
        and asset.owner_school_id is not None
        and school_role(db, user.id, asset.owner_school_id)
        in {SchoolRole.SCHOOL_ADMIN, SchoolRole.TEACHER}
    )


def get_asset_for(db: Session, user: User, asset_id: uuid.UUID, *, manage: bool) -> ThreeDAsset:
    asset = db.get(ThreeDAsset, asset_id)
    if asset is None or not can_view_asset(db, user, asset):
        raise NotFoundError()
    if manage and not can_manage_asset(db, user, asset):
        raise PermissionDeniedError()
    return asset


def create_asset(db: Session, user: User, body: AssetCreate) -> ThreeDAsset:
    if body.school_id:
        require_school_role(db, user, body.school_id, SchoolRole.SCHOOL_ADMIN, SchoolRole.TEACHER)
    asset = ThreeDAsset(
        slug=make_slug(body.name),
        owner_school_id=body.school_id,
        created_by=user.id,
        visibility=AssetVisibility.SCHOOL if body.school_id else AssetVisibility.PRIVATE,
        name=body.name,
        description=body.description,
        category=body.category,
        subject=body.subject,
        license_name=body.license_name,
        source_url=str(body.source_url) if body.source_url else None,
        attribution_text=body.attribution_text,
    )
    db.add(asset)
    db.flush()
    audit.record(
        db,
        action="asset.create",
        resource_type="three_d_asset",
        resource_id=asset.id,
        actor_user_id=user.id,
        school_id=body.school_id,
        metadata={"license": body.license_name},
    )
    db.commit()
    return asset


def list_assets(db: Session, user: User) -> list[ThreeDAsset]:
    if user.account_type != AccountType.TEACHER:
        return []
    my_schools = select(SchoolMembership.school_id).where(
        SchoolMembership.user_id == user.id,
        SchoolMembership.role.in_([SchoolRole.SCHOOL_ADMIN, SchoolRole.TEACHER]),
        SchoolMembership.status == "active",
    )
    approved = ThreeDAsset.review_status == ReviewStatus.APPROVED
    rows = db.scalars(
        select(ThreeDAsset)
        .where(
            or_(
                ThreeDAsset.created_by == user.id,
                (ThreeDAsset.visibility == AssetVisibility.LIBRARY) & approved,
                (ThreeDAsset.visibility == AssetVisibility.SCHOOL)
                & ThreeDAsset.owner_school_id.in_(my_schools)
                & approved,
            )
        )
        .order_by(ThreeDAsset.name)
    )
    return [a for a in rows if can_view_asset(db, user, a)]


def versions(db: Session, asset_id: uuid.UUID) -> list[ThreeDAssetVersion]:
    return list(
        db.scalars(
            select(ThreeDAssetVersion)
            .where(ThreeDAssetVersion.asset_id == asset_id)
            .order_by(ThreeDAssetVersion.version_number.desc())
        )
    )


def _version(db: Session, asset_id: uuid.UUID, n: int) -> ThreeDAssetVersion:
    v = db.scalar(
        select(ThreeDAssetVersion).where(
            ThreeDAssetVersion.asset_id == asset_id, ThreeDAssetVersion.version_number == n
        )
    )
    if v is None:
        raise NotFoundError()
    return v


def start_version_upload(
    db: Session, user: User, asset_id: uuid.UUID, size_bytes: int
) -> tuple[ThreeDAssetVersion, str, str, dict[str, str]]:
    s = get_settings()
    asset = get_asset_for(db, user, asset_id, manage=True)
    if size_bytes > s.asset_max_bytes:
        raise InvalidAssetError(f"Models are limited to {s.asset_max_bytes // (1024 * 1024)} MB.")
    n = (max((v.version_number for v in versions(db, asset.id)), default=0)) + 1
    v = ThreeDAssetVersion(
        asset_id=asset.id,
        version_number=n,
        file_size_bytes=size_bytes,
        storage_key=f"assets/{asset.id}/v{n}/model.glb",
    )
    db.add(v)
    up = get_storage().presigned_upload(
        key=v.storage_key,
        content_type=GLB_MIME,
        max_bytes=size_bytes,
        expires_in_s=s.upload_url_ttl_s,
    )
    db.commit()
    return v, up.url, up.method, up.headers


def register_version_bytes(asset: ThreeDAsset, v: ThreeDAssetVersion, data: bytes) -> None:
    """Validate GLB bytes and fill the version (shared by upload-complete and seeding)."""
    try:
        head = data[:20]
        info = inspect_glb(data[: header_length(head)], len(data))
    except InvalidGLBError as exc:
        v.status = "failed"
        v.error_message = str(exc)
        raise InvalidAssetError(str(exc)) from exc
    v.metadata_json = info.as_metadata()
    v.content_hash = hashlib.sha256(data).hexdigest()
    v.file_size_bytes = len(data)
    v.status = "ready"
    v.error_message = None
    asset.latest_version = v.version_number
    # Every new version needs a fresh review before it can be used in scenes.
    asset.review_status = ReviewStatus.PENDING
    asset.reviewed_at = None
    asset.reviewed_by = None


def complete_version_upload(
    db: Session, user: User, asset_id: uuid.UUID, n: int
) -> ThreeDAssetVersion:
    asset = get_asset_for(db, user, asset_id, manage=True)
    v = _version(db, asset.id, n)
    if v.status != "pending_upload":
        raise ConflictError("This version has already been processed.")
    storage = get_storage()
    obj = storage.head(v.storage_key)
    if obj is None:
        raise InvalidAssetError("No uploaded file was found. Upload the file first.")
    if obj.size_bytes != v.file_size_bytes:
        storage.delete(v.storage_key)
        raise InvalidAssetError("The uploaded file size does not match the declared size.")
    data = storage.read_bytes(v.storage_key, v.file_size_bytes)
    try:
        register_version_bytes(asset, v, data)
    except InvalidAssetError:
        storage.delete(v.storage_key)
        db.commit()
        raise
    audit.record(
        db,
        action="asset.version_uploaded",
        resource_type="three_d_asset",
        resource_id=asset.id,
        actor_user_id=user.id,
        metadata={"version": n, "triangles": v.metadata_json.get("triangle_count")},
    )
    db.commit()
    return v


def review_asset(
    db: Session, user: User, asset_id: uuid.UUID, decision: str, notes: str | None
) -> ThreeDAsset:
    asset = get_asset_for(db, user, asset_id, manage=True)
    if asset.latest_version == 0:
        raise ConflictError("Upload a valid model version before reviewing.")
    asset.review_status = decision
    asset.review_notes = notes
    asset.reviewed_by = user.id
    asset.reviewed_at = datetime.now(UTC)
    audit.record(
        db,
        action=f"asset.review.{decision}",
        resource_type="three_d_asset",
        resource_id=asset.id,
        actor_user_id=user.id,
        metadata={"version": asset.latest_version},
    )
    db.commit()
    return asset


def download_url(db: Session, user: User, asset_id: uuid.UUID, n: int) -> str:
    asset = get_asset_for(db, user, asset_id, manage=False)
    v = _version(db, asset.id, n)
    if v.status != "ready":
        raise NotFoundError()
    return get_storage().presigned_download(
        key=v.storage_key, content_type=GLB_MIME, expires_in_s=get_settings().download_url_ttl_s
    )
