"""Text extraction, normalization and chunking (design §6.3 steps 5–7).

PDFs are untrusted input: parsing happens only in workers, with page and size limits.
Pages with too little text are flagged for OCR (OCR provider is a later addition).
"""

import re
from dataclasses import dataclass
from typing import Any

from app.integrations.interfaces import ExtractedDocument, ExtractedPage

MAX_PAGES = 1000
MIN_TEXT_CHARS = 40
TEXT_PSEUDO_PAGE_CHARS = 3000
CHUNK_TARGET_CHARS = 1500

PDF_MAGIC = b"%PDF-"
ALLOWED_MIME_TYPES = {"application/pdf", "text/plain", "text/markdown"}


class ExtractionError(Exception):
    pass


def normalize(text: str) -> str:
    text = text.replace("\x00", "").replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"(\w)-\n(\w)", r"\1\2", text)  # de-hyphenate line breaks
    text = re.sub(r"[ \t\f\v]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def sniff_ok(mime_type: str, head: bytes) -> bool:
    """Validate the file signature, not just the declared type/extension."""
    if mime_type == "application/pdf":
        return head.startswith(PDF_MAGIC)
    try:
        head.decode("utf-8")
    except UnicodeDecodeError as exc:
        # A multi-byte character may be cut at the end of the sniffed window.
        return exc.start >= len(head) - 3
    return b"\x00" not in head


class PyMuPDFExtractor:
    def extract(self, data: bytes) -> ExtractedDocument:
        import pymupdf

        try:
            doc: Any = pymupdf.open(stream=data, filetype="pdf")  # type: ignore[no-untyped-call]
        except Exception as exc:
            raise ExtractionError("The file is not a readable PDF.") from exc
        with doc:
            if doc.needs_pass:
                raise ExtractionError("Password-protected PDFs are not supported.")
            if doc.page_count > MAX_PAGES:
                raise ExtractionError(f"PDFs are limited to {MAX_PAGES} pages.")
            pages = []
            page: Any
            for i, page in enumerate(doc, start=1):
                text = normalize(page.get_text("text"))
                pages.append(
                    ExtractedPage(i, text, "text_layer", needs_ocr=len(text) < MIN_TEXT_CHARS)
                )
            return ExtractedDocument(page_count=doc.page_count, pages=pages)


def extract_plain_text(data: bytes) -> ExtractedDocument:
    """Split pasted/plain text into pseudo-pages at paragraph boundaries so that
    source references ("page N") still work."""
    text = normalize(data.decode("utf-8", errors="replace"))
    if not text:
        raise ExtractionError("The text is empty.")
    pages: list[str] = []
    current = ""
    for para in text.split("\n\n"):
        if current and len(current) + len(para) > TEXT_PSEUDO_PAGE_CHARS:
            pages.append(current)
            current = ""
        current = f"{current}\n\n{para}" if current else para
    if current:
        pages.append(current)
    return ExtractedDocument(
        page_count=len(pages),
        pages=[ExtractedPage(i, p, "plain_text") for i, p in enumerate(pages, start=1)],
    )


@dataclass(frozen=True)
class Chunk:
    index: int
    page_start: int
    page_end: int
    content: str

    @property
    def token_estimate(self) -> int:
        return max(1, len(self.content) // 4)


def chunk_pages(pages: list[ExtractedPage], target: int = CHUNK_TARGET_CHARS) -> list[Chunk]:
    """Greedy paragraph packing; each chunk records the page range it came from."""
    chunks: list[Chunk] = []
    buf: list[str] = []
    start = end = 0
    size = 0

    def flush() -> None:
        nonlocal buf, size
        if buf:
            chunks.append(Chunk(len(chunks), start, end, "\n\n".join(buf)))
        buf, size = [], 0

    for page in pages:
        for para in (p for p in page.text.split("\n\n") if p.strip()):
            while len(para) > target * 2:  # hard-split very long paragraphs
                head, para = para[:target], para[target:]
                if buf:
                    flush()
                start = end = page.page_number
                buf, size = [head], len(head)
                flush()
            if buf and size + len(para) > target:
                flush()
            if not buf:
                start = page.page_number
            buf.append(para)
            size += len(para)
            end = page.page_number
    flush()
    return chunks
