import re
import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import AppError, ConflictError, NotFoundError
from app.integrations.interfaces import PresignedUpload
from app.integrations.storage import get_storage
from app.modules.courses.access import get_course_for
from app.modules.documents.extraction import sniff_ok
from app.modules.documents.models import DocumentPage, DocumentStatus, SourceDocument
from app.modules.documents.schemas import TextDocumentRequest, UploadUrlRequest
from app.modules.operations import audit
from app.modules.operations.jobs import JobType
from app.modules.operations.models import Job
from app.modules.operations.runner import create_job, dispatch
from app.modules.users.models import User


class InvalidUploadError(AppError):
    status_code = 422
    code = "INVALID_UPLOAD"
    message = "The uploaded file is not valid."


def _safe_filename(name: str) -> str:
    return re.sub(r"[^\w.\- ]", "_", name.rsplit("/", 1)[-1].rsplit("\\", 1)[-1])[:255] or "file"


def _key(course_id: uuid.UUID, doc_id: uuid.UUID) -> str:
    return f"courses/{course_id}/documents/{doc_id}/source"


def get_document_for(db: Session, user: User, doc_id: uuid.UUID) -> SourceDocument:
    doc = db.get(SourceDocument, doc_id)
    if doc is None:
        raise NotFoundError()
    get_course_for(db, user, doc.course_id, manage=True)
    return doc


def create_upload(
    db: Session, user: User, body: UploadUrlRequest
) -> tuple[SourceDocument, PresignedUpload]:
    s = get_settings()
    course = get_course_for(db, user, body.course_id, manage=True)
    if body.size_bytes > s.upload_max_bytes:
        raise InvalidUploadError(f"Files are limited to {s.upload_max_bytes // (1024 * 1024)} MB.")
    filename = _safe_filename(body.filename)
    doc = SourceDocument(
        id=uuid.uuid4(),
        course_id=course.id,
        uploaded_by=user.id,
        title=body.title or filename,
        original_filename=filename,
        mime_type=body.mime_type,
        size_bytes=body.size_bytes,
        storage_key="",
    )
    doc.storage_key = _key(course.id, doc.id)
    db.add(doc)
    upload = get_storage().presigned_upload(
        key=doc.storage_key,
        content_type=body.mime_type,
        max_bytes=body.size_bytes,
        expires_in_s=s.upload_url_ttl_s,
    )
    db.commit()
    return doc, upload


def _queue_extraction(
    db: Session, user: User, doc: SourceDocument, school_id: uuid.UUID | None
) -> Job:
    doc.processing_status = DocumentStatus.UPLOADED
    job = create_job(
        db,
        job_type=JobType.DOCUMENT_EXTRACTION,
        target_type="source_document",
        target_id=doc.id,
        requested_by=user.id,
        course_id=doc.course_id,
        school_id=school_id,
    )
    audit.record(
        db,
        action="document.upload",
        resource_type="source_document",
        resource_id=doc.id,
        actor_user_id=user.id,
        school_id=school_id,
        metadata={"mime_type": doc.mime_type, "size_bytes": doc.size_bytes},
    )
    db.commit()
    dispatch(job.id)
    db.refresh(job)
    db.refresh(doc)
    return job


def complete_upload(db: Session, user: User, doc_id: uuid.UUID) -> tuple[SourceDocument, Job]:
    doc = get_document_for(db, user, doc_id)
    if doc.processing_status != DocumentStatus.PENDING_UPLOAD:
        raise ConflictError("This upload has already been completed.")
    storage = get_storage()
    obj = storage.head(doc.storage_key)
    if obj is None:
        raise InvalidUploadError("No uploaded file was found. Upload the file first.")
    if obj.size_bytes != doc.size_bytes or obj.size_bytes > get_settings().upload_max_bytes:
        storage.delete(doc.storage_key)
        raise InvalidUploadError("The uploaded file size does not match the declared size.")
    if not sniff_ok(doc.mime_type, storage.read_bytes(doc.storage_key, 4096)):
        storage.delete(doc.storage_key)
        doc.processing_status = DocumentStatus.FAILED
        doc.error_message = "The file content does not match its declared type."
        db.commit()
        raise InvalidUploadError(doc.error_message)
    course = get_course_for(db, user, doc.course_id, manage=True)
    job = _queue_extraction(db, user, doc, course.school_id)
    return doc, job


def create_text_document(
    db: Session, user: User, body: TextDocumentRequest
) -> tuple[SourceDocument, Job]:
    course = get_course_for(db, user, body.course_id, manage=True)
    data = body.text.encode("utf-8")
    doc = SourceDocument(
        id=uuid.uuid4(),
        course_id=course.id,
        uploaded_by=user.id,
        title=body.title,
        original_filename="pasted-text.txt",
        mime_type="text/plain",
        size_bytes=len(data),
        storage_key="",
    )
    doc.storage_key = _key(course.id, doc.id)
    get_storage().put_bytes(doc.storage_key, data, "text/plain")
    db.add(doc)
    db.flush()
    job = _queue_extraction(db, user, doc, course.school_id)
    return doc, job


def list_documents(db: Session, user: User, course_id: uuid.UUID) -> list[SourceDocument]:
    get_course_for(db, user, course_id, manage=True)
    return list(
        db.scalars(
            select(SourceDocument)
            .where(
                SourceDocument.course_id == course_id,
                SourceDocument.processing_status != DocumentStatus.PENDING_UPLOAD,
            )
            .order_by(SourceDocument.created_at.desc())
        )
    )


def list_pages(
    db: Session, user: User, doc_id: uuid.UUID, offset: int, limit: int
) -> tuple[int, list[DocumentPage]]:
    get_document_for(db, user, doc_id)
    base = select(DocumentPage).where(DocumentPage.source_document_id == doc_id)
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    pages = db.scalars(base.order_by(DocumentPage.page_number).offset(offset).limit(limit))
    return total, list(pages)
