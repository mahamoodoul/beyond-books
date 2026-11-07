"""Selects source passages for a task (design §6.3 steps 8–9).

Current strategy (no embeddings yet):
- Outline: the course's ready documents in reading order, within a character budget.
- Lesson/section: chunks overlapping the chapter's source page ranges; if the chapter has none,
  lexical overlap with the chapter title, description and objectives.
Semantic retrieval via pgvector + EmbeddingProvider can replace `_lexical` without changing callers.
"""

import re
import uuid
from collections import Counter
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.integrations.interfaces import ReferencePassage
from app.modules.chapters.models import Chapter, LearningObjective
from app.modules.documents.models import DocumentChunk, DocumentStatus, SourceDocument

_WORD = re.compile(r"[^\W\d_]{3,}", re.UNICODE)


@dataclass(frozen=True)
class Retrieval:
    passages: list[ReferencePassage]
    truncated: bool
    strategy: str


def _ready_docs(db: Session, course_id: uuid.UUID) -> list[SourceDocument]:
    return list(
        db.scalars(
            select(SourceDocument)
            .where(
                SourceDocument.course_id == course_id,
                SourceDocument.processing_status == DocumentStatus.READY,
            )
            .order_by(SourceDocument.created_at)
        )
    )


def _to_passage(c: DocumentChunk) -> ReferencePassage:
    return ReferencePassage(str(c.source_document_id), c.page_start, c.page_end, c.content)


def _budgeted(chunks: list[DocumentChunk], budget: int) -> tuple[list[ReferencePassage], bool]:
    out: list[ReferencePassage] = []
    used = 0
    for c in chunks:
        if used + len(c.content) > budget:
            return out, True
        out.append(_to_passage(c))
        used += len(c.content)
    return out, False


def _chunks(db: Session, doc_ids: list[uuid.UUID]) -> list[DocumentChunk]:
    if not doc_ids:
        return []
    order = {d: i for i, d in enumerate(doc_ids)}
    chunks = list(
        db.scalars(select(DocumentChunk).where(DocumentChunk.source_document_id.in_(doc_ids)))
    )
    return sorted(chunks, key=lambda c: (order[c.source_document_id], c.chunk_index))


def for_outline(db: Session, course_id: uuid.UUID) -> Retrieval:
    docs = _ready_docs(db, course_id)
    budget = get_settings().llm_max_input_chars
    per_doc = budget // max(1, len(docs))
    passages: list[ReferencePassage] = []
    truncated = False
    for d in docs:
        got, cut = _budgeted(_chunks(db, [d.id]), per_doc)
        passages += got
        truncated |= cut
    return Retrieval(passages, truncated, "document_order")


def _lexical(
    chunks: list[DocumentChunk], query: str, budget: int
) -> tuple[list[ReferencePassage], bool]:
    q = Counter(w.lower() for w in _WORD.findall(query))
    scored = []
    for c in chunks:
        words = Counter(w.lower() for w in _WORD.findall(c.content))
        score = sum(min(n, words[w]) for w, n in q.items())
        if score:
            scored.append((score, c))
    top = [c for _, c in sorted(scored, key=lambda x: (-x[0], x[1].chunk_index))]
    picked, truncated = _budgeted(top, budget)
    # Present in reading order for coherence.
    picked.sort(key=lambda p: (p.document_id, p.page_start))
    return picked, truncated


def for_chapter(db: Session, chapter: Chapter) -> Retrieval:
    budget = get_settings().llm_max_input_chars
    docs = {d.id: d for d in _ready_docs(db, chapter.course_id)}
    chunks = _chunks(db, list(docs))
    ranges = [
        (uuid.UUID(str(r["document_id"])), int(r["page_start"]), int(r["page_end"]))
        for r in chapter.source_refs or []
    ]
    if ranges:
        selected = [
            c
            for c in chunks
            if any(
                c.source_document_id == d and c.page_start <= end and c.page_end >= start
                for d, start, end in ranges
            )
        ]
        if selected:
            passages, truncated = _budgeted(selected, budget)
            return Retrieval(passages, truncated, "chapter_page_ranges")
    objectives = db.scalars(
        select(LearningObjective.objective_text).where(LearningObjective.chapter_id == chapter.id)
    )
    query = " ".join([chapter.title, chapter.description, *objectives])
    passages, truncated = _lexical(chunks, query, budget)
    return Retrieval(passages, truncated, "lexical")
