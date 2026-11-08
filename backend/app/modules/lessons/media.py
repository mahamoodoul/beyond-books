"""Lesson media: pictures and AR scan targets stored with a lesson.

Same upload flow as 3D models: `start_upload` returns a presigned PUT URL, the client uploads the
file, `complete_upload` checks it (size + file signature) and marks it ready. Viewing follows the
lesson's own rules: managers always, everyone else only for published lessons they can open.
"""

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import AppError, ConflictError, NotFoundError
from app.integrations.storage import get_storage
from app.modules.chapters.service import chapter_access, get_chapter_for
from app.modules.lessons.models import Lesson, LessonMedia, LessonMediaKind
from app.modules.lessons.schemas import LessonMediaCreate, LessonMediaOut
from app.modules.operations import audit
from app.modules.users.models import User

MAX_BYTES = {LessonMediaKind.IMAGE: 15 * 1024 * 1024, LessonMediaKind.AR_TARGET: 30 * 1024 * 1024}
EXTENSIONS = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"}


class InvalidMediaError(AppError):
    status_code = 422
    code = "INVALID_MEDIA"
    message = "The file is not a supported picture or AR target."


def _signature_ok(kind: str, content_type: str, head: bytes) -> bool:
    if kind == LessonMediaKind.IMAGE:
        return {
            "image/png": head.startswith(b"\x89PNG\r\n\x1a\n"),
            "image/jpeg": head.startswith(b"\xff\xd8\xff"),
            "image/webp": head[:4] == b"RIFF" and head[8:12] == b"WEBP",
        }.get(content_type, False)
    # MindAR .mind: a MessagePack map ({"v": ..., "dataList": [...]})
    return bool(head) and (0x80 <= head[0] <= 0x8F or head[0] in (0xDE, 0xDF)) and b"dataList" in head


def _lesson(db: Session, lesson_id: uuid.UUID) -> Lesson:
    lesson = db.get(Lesson, lesson_id)
    if lesson is None:
        raise NotFoundError()
    return lesson


def _media(db: Session, user: User, media_id: uuid.UUID) -> LessonMedia:
    media = db.get(LessonMedia, media_id)
    if media is None:
        raise NotFoundError()
    get_chapter_for(db, user, _lesson(db, media.lesson_id).chapter_id, manage=True)
    return media


def to_out(media: LessonMedia, *, with_url: bool = False) -> LessonMediaOut:
    out = LessonMediaOut.model_validate(media)
    if with_url and media.status == "ready":
        out.url = get_storage().presigned_download(
            key=media.storage_key,
            content_type=media.content_type,
            expires_in_s=get_settings().download_url_ttl_s,
        )
    return out


def start_upload(
    db: Session, user: User, lesson_id: uuid.UUID, body: LessonMediaCreate
) -> tuple[LessonMedia, str, str, dict[str, str]]:
    lesson = _lesson(db, lesson_id)
    get_chapter_for(db, user, lesson.chapter_id, manage=True)
    is_image = body.kind == LessonMediaKind.IMAGE
    if is_image != (body.content_type in EXTENSIONS):
        raise InvalidMediaError(
            "Pictures must be PNG, JPEG or WebP; AR targets must be application/octet-stream."
        )
    if body.size_bytes > MAX_BYTES[body.kind]:
        raise InvalidMediaError(f"This file is limited to {MAX_BYTES[body.kind] // (1024 * 1024)} MB.")
    media_id = uuid.uuid4()
    ext = EXTENSIONS.get(body.content_type, "mind")
    position = db.scalar(
        select(func.count()).select_from(LessonMedia).where(LessonMedia.lesson_id == lesson.id)
    )
    media = LessonMedia(
        id=media_id,
        lesson_id=lesson.id,
        kind=body.kind,
        title=body.title,
        alt_text=body.alt_text,
        position=position or 0,
        storage_key=f"lesson-media/{lesson.id}/{media_id}.{ext}",
        content_type=body.content_type,
        file_size_bytes=body.size_bytes,
        created_by=user.id,
    )
    db.add(media)
    up = get_storage().presigned_upload(
        key=media.storage_key,
        content_type=media.content_type,
        max_bytes=body.size_bytes,
        expires_in_s=get_settings().upload_url_ttl_s,
    )
    db.commit()
    return media, up.url, up.method, up.headers


def complete_upload(db: Session, user: User, media_id: uuid.UUID) -> LessonMedia:
    media = _media(db, user, media_id)
    if media.status != "pending_upload":
        raise ConflictError("This file has already been processed.")
    storage = get_storage()
    obj = storage.head(media.storage_key)
    if obj is None:
        raise InvalidMediaError("No uploaded file was found. Upload the file first.")
    if obj.size_bytes != media.file_size_bytes:
        storage.delete(media.storage_key)
        raise InvalidMediaError("The uploaded file size does not match the declared size.")
    head = storage.read_bytes(media.storage_key, 64)
    if not _signature_ok(media.kind, media.content_type, head):
        storage.delete(media.storage_key)
        raise InvalidMediaError()
    media.status = "ready"
    audit.record(
        db,
        action="lesson.media_uploaded",
        resource_type="lesson",
        resource_id=media.lesson_id,
        actor_user_id=user.id,
        metadata={"media_id": str(media.id), "kind": media.kind},
    )
    db.commit()
    return media


def list_media(db: Session, user: User, lesson_id: uuid.UUID) -> list[LessonMediaOut]:
    lesson = _lesson(db, lesson_id)
    _, access = chapter_access(db, user, lesson.chapter_id)
    if not access.can_manage and lesson.published_version is None:
        raise NotFoundError()
    rows = db.scalars(
        select(LessonMedia)
        .where(LessonMedia.lesson_id == lesson.id)
        .order_by(LessonMedia.position, LessonMedia.created_at)
    )
    return [
        to_out(m, with_url=True)
        for m in rows
        if access.can_manage or m.status == "ready"
    ]


def delete_media(db: Session, user: User, media_id: uuid.UUID) -> None:
    media = _media(db, user, media_id)
    get_storage().delete(media.storage_key)
    audit.record(
        db,
        action="lesson.media_deleted",
        resource_type="lesson",
        resource_id=media.lesson_id,
        actor_user_id=user.id,
        metadata={"media_id": str(media.id), "kind": media.kind},
    )
    db.delete(media)
    db.commit()
