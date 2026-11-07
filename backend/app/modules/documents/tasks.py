import hashlib
from typing import Any

from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.integrations.storage import get_storage
from app.modules.documents.extraction import (
    ExtractionError,
    PyMuPDFExtractor,
    chunk_pages,
    extract_plain_text,
)
from app.modules.documents.models import (
    DocumentChunk,
    DocumentPage,
    DocumentStatus,
    SourceDocument,
)
from app.modules.operations.jobs import JobType
from app.modules.operations.models import Job
from app.modules.operations.runner import PermanentJobError, handler


def _fail(db: Session, doc: SourceDocument, message: str) -> None:
    doc.processing_status = DocumentStatus.FAILED
    doc.error_message = message
    db.commit()


@handler(JobType.DOCUMENT_EXTRACTION)
def extract_document(db: Session, job: Job) -> dict[str, Any]:
    doc = db.get(SourceDocument, job.target_id)
    if doc is None:
        raise PermanentJobError("DOCUMENT_MISSING", "The document no longer exists.")
    doc.processing_status = DocumentStatus.PROCESSING
    db.commit()

    data = get_storage().read_bytes(doc.storage_key, get_settings().upload_max_bytes + 1)
    try:
        if doc.mime_type == "application/pdf":
            extracted = PyMuPDFExtractor().extract(data)
        else:
            extracted = extract_plain_text(data)
    except ExtractionError as exc:
        _fail(db, doc, str(exc))
        raise PermanentJobError("EXTRACTION_FAILED", str(exc)) from exc

    # Idempotent: a retried job replaces earlier partial output.
    db.execute(delete(DocumentPage).where(DocumentPage.source_document_id == doc.id))
    db.execute(delete(DocumentChunk).where(DocumentChunk.source_document_id == doc.id))
    needs_ocr = 0
    for p in extracted.pages:
        needs_ocr += p.needs_ocr
        db.add(
            DocumentPage(
                source_document_id=doc.id,
                page_number=p.page_number,
                extracted_text=p.text,
                extraction_method=p.method,
                quality_status="needs_ocr" if p.needs_ocr else "ok",
            )
        )
    chunks = chunk_pages([p for p in extracted.pages if p.text])
    for c in chunks:
        db.add(
            DocumentChunk(
                source_document_id=doc.id,
                chunk_index=c.index,
                page_start=c.page_start,
                page_end=c.page_end,
                content=c.content,
                token_count=c.token_estimate,
            )
        )
    if not chunks:
        db.rollback()
        _fail(
            db, doc, "No text could be extracted. Scanned PDFs need OCR, which is not enabled yet."
        )
        raise PermanentJobError("NO_TEXT", "No extractable text.")

    doc.checksum = hashlib.sha256(data).hexdigest()
    doc.page_count = extracted.page_count
    doc.pages_needing_ocr = needs_ocr
    doc.processing_status = DocumentStatus.READY
    doc.error_message = None
    db.commit()
    return {
        "page_count": extracted.page_count,
        "chunks": len(chunks),
        "pages_needing_ocr": needs_ocr,
    }
