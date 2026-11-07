"""Validates and converts model output into domain contracts (design §6.4).

- Source references must point at pages that were actually provided to the model.
- Unsupported references are removed and reported; fully ungrounded output is rejected.
- Output is clipped to contract limits, then validated by the strict domain schema.
"""

import uuid
from dataclasses import dataclass, field
from typing import Any

from pydantic import ValidationError

from app.integrations.interfaces import ReferencePassage
from app.modules.ai_engine.schemas import LessonLLM, OutlineLLM, SectionLLM
from app.modules.lessons.content import LessonContent, LessonSection


class OutputRejectedError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


@dataclass
class ValidationReport:
    removed_refs: int = 0
    kept_refs: int = 0
    sections_without_sources: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {
            "removed_refs": self.removed_refs,
            "kept_refs": self.kept_refs,
            "sections_without_sources": self.sections_without_sources,
            "warnings": self.warnings,
        }


def allowed_pages(passages: list[ReferencePassage]) -> set[tuple[str, int]]:
    return {(p.document_id, page) for p in passages for page in range(p.page_start, p.page_end + 1)}


def _clip(s: str, n: int) -> str:
    return s.strip()[:n]


def _section(
    s: SectionLLM, allowed: set[tuple[str, int]], report: ValidationReport
) -> dict[str, Any]:
    refs, seen = [], set()
    for r in s.source_refs:
        key = (r.document_id, r.page)
        if key in allowed and key not in seen:
            seen.add(key)
            refs.append({"document_id": r.document_id, "page": r.page})
        elif key not in allowed:
            report.removed_refs += 1
    report.kept_refs += len(refs)
    title = _clip(s.title, 200) or "Section"
    if not refs:
        report.sections_without_sources.append(title)
    return {
        "title": title,
        "body_markdown": _clip(s.body_markdown, 20_000),
        "key_terms": [_clip(t, 100) for t in s.key_terms if t.strip()][:30],
        "source_refs": refs[:30],
    }


def convert_section(
    s: SectionLLM, passages: list[ReferencePassage]
) -> tuple[LessonSection, ValidationReport]:
    report = ValidationReport()
    data = _section(s, allowed_pages(passages), report)
    if report.kept_refs == 0:
        raise OutputRejectedError(
            "UNGROUNDED_OUTPUT", "The generated section cited no provided source."
        )
    return LessonSection.model_validate(data), report


def convert_lesson(
    lesson: LessonLLM, passages: list[ReferencePassage]
) -> tuple[str, LessonContent, ValidationReport]:
    report = ValidationReport()
    allowed = allowed_pages(passages)
    sections = [
        _section(s, allowed, report) for s in lesson.sections[:40] if s.body_markdown.strip()
    ]
    if not sections:
        raise OutputRejectedError("EMPTY_OUTPUT", "The model returned no lesson sections.")
    if report.kept_refs == 0:
        raise OutputRejectedError(
            "UNGROUNDED_OUTPUT", "The generated lesson cited none of the provided sources."
        )
    if report.removed_refs:
        report.warnings.append(f"{report.removed_refs} unsupported source reference(s) removed.")
    try:
        content = LessonContent.model_validate(
            {
                "sections": sections,
                "summary": [_clip(x, 500) for x in lesson.summary if x.strip()][:20],
                "visualization_candidates": [
                    {
                        "concept": _clip(v.concept, 200),
                        "visualization_type": v.visualization_type,
                        "learning_reason": _clip(v.learning_reason, 1000),
                    }
                    for v in lesson.visualization_candidates[:10]
                    if v.concept.strip()
                ],
            }
        )
    except ValidationError as exc:
        raise OutputRejectedError(
            "INVALID_OUTPUT", "The generated lesson failed validation."
        ) from exc
    return _clip(lesson.title, 200) or "Lesson", content, report


def convert_outline(
    outline: OutlineLLM, passages: list[ReferencePassage], page_counts: dict[str, int]
) -> tuple[dict[str, Any], ValidationReport]:
    """Return a teacher-reviewable proposal. Page ranges are clamped to real document pages."""
    report = ValidationReport()
    allowed = allowed_pages(passages)
    chapters = []
    for ch in outline.chapters[:30]:
        title = _clip(ch.title, 200)
        if not title:
            continue
        refs = []
        pages = page_counts.get(ch.document_id)
        if pages:
            start = max(1, min(ch.page_start, pages))
            end = max(start, min(ch.page_end, pages))
            refs.append({"document_id": ch.document_id, "page_start": start, "page_end": end})
            report.kept_refs += 1
        else:
            report.removed_refs += 1
            report.sections_without_sources.append(title)
        objectives = []
        for o in ch.objectives[:10]:
            if not o.text.strip():
                continue
            o_refs = [
                {"document_id": ch.document_id, "page": p}
                for p in sorted(set(o.pages))
                if (ch.document_id, p) in allowed
            ]
            objectives.append({"text": _clip(o.text, 1000), "source_refs": o_refs})
        chapters.append(
            {
                "title": title,
                "description": _clip(ch.description, 2000),
                "source_refs": refs,
                "objectives": objectives,
            }
        )
    if not chapters:
        raise OutputRejectedError("EMPTY_OUTPUT", "The model proposed no chapters.")
    if report.kept_refs == 0:
        raise OutputRejectedError(
            "UNGROUNDED_OUTPUT", "No proposed chapter maps to a source document."
        )
    return {
        "subject": _clip(outline.subject, 80),
        "level": _clip(outline.level, 80),
        "chapters": chapters,
    }, report


def parse_uuid(value: str) -> uuid.UUID | None:
    try:
        return uuid.UUID(value)
    except ValueError:
        return None
