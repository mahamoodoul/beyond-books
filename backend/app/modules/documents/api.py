import uuid

from fastapi import APIRouter, Query, status

from app.core.deps import DB, CurrentUser
from app.modules.documents import service
from app.modules.documents.models import SourceDocument
from app.modules.documents.schemas import (
    DocumentJobResponse,
    DocumentOut,
    PageList,
    PageOut,
    TextDocumentRequest,
    UploadInstructions,
    UploadUrlRequest,
    UploadUrlResponse,
)
from app.modules.operations.api import JobOut

router = APIRouter(tags=["documents"])


@router.post(
    "/documents/upload-url", response_model=UploadUrlResponse, status_code=status.HTTP_201_CREATED
)
def upload_url(body: UploadUrlRequest, user: CurrentUser, db: DB) -> UploadUrlResponse:
    doc, upload = service.create_upload(db, user, body)
    return UploadUrlResponse(
        document=DocumentOut.model_validate(doc),
        upload=UploadInstructions(url=upload.url, method=upload.method, headers=upload.headers),
    )


@router.post("/documents/{doc_id}/complete", response_model=DocumentJobResponse)
def complete(doc_id: uuid.UUID, user: CurrentUser, db: DB) -> DocumentJobResponse:
    doc, job = service.complete_upload(db, user, doc_id)
    return DocumentJobResponse(
        document=DocumentOut.model_validate(doc), job=JobOut.model_validate(job)
    )


@router.post(
    "/documents/text", response_model=DocumentJobResponse, status_code=status.HTTP_201_CREATED
)
def create_text(body: TextDocumentRequest, user: CurrentUser, db: DB) -> DocumentJobResponse:
    doc, job = service.create_text_document(db, user, body)
    return DocumentJobResponse(
        document=DocumentOut.model_validate(doc), job=JobOut.model_validate(job)
    )


@router.get("/documents/{doc_id}", response_model=DocumentOut)
def get_document(doc_id: uuid.UUID, user: CurrentUser, db: DB) -> SourceDocument:
    return service.get_document_for(db, user, doc_id)


@router.get("/courses/{course_id}/documents", response_model=list[DocumentOut])
def list_documents(course_id: uuid.UUID, user: CurrentUser, db: DB) -> list[SourceDocument]:
    return service.list_documents(db, user, course_id)


@router.get("/documents/{doc_id}/pages", response_model=PageList)
def list_pages(
    doc_id: uuid.UUID,
    user: CurrentUser,
    db: DB,
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
) -> PageList:
    total, pages = service.list_pages(db, user, doc_id, offset, limit)
    return PageList(total=total, items=[PageOut.model_validate(p) for p in pages])
