"""Deterministic offline LLM for tests, local development and demos without an API key.

It builds plausible, correctly-grounded output directly from the reference passages. It is NOT
a quality signal for prompts — use the real provider and human review for that.
"""

import re
from typing import Any, cast

from pydantic import BaseModel

from app.integrations.interfaces import LLMUsage, ReferencePassage, StructuredResult
from app.modules.ai_engine.schemas import (
    LessonLLM,
    OutlineChapterLLM,
    OutlineLLM,
    OutlineObjectiveLLM,
    SectionLLM,
    SourceRefLLM,
    VisualizationLLM,
)


def _sentences(text: str) -> list[str]:
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if len(s.strip()) > 20]


def _heading(text: str, fallback: str) -> str:
    first = text.strip().split("\n", 1)[0].strip()
    return first[:80] if 3 <= len(first) <= 80 else fallback


class FakeLLMProvider:
    name = "fake"
    model = "fake-structured-1"

    def generate_structured[T: BaseModel](
        self,
        *,
        system_prompt: str,
        task: str,
        references: list[ReferencePassage],
        output_schema: type[T],
        prompt_version: str,
        max_output_tokens: int,
    ) -> StructuredResult[T]:
        builders: dict[type[BaseModel], Any] = {
            OutlineLLM: self._outline,
            LessonLLM: self._lesson,
            SectionLLM: self._section,
        }
        output = builders[output_schema](references, task)
        chars_in = len(system_prompt) + len(task) + sum(len(r.text) for r in references)
        usage = LLMUsage(self.name, self.model, chars_in // 4, len(output.model_dump_json()) // 4)
        return StructuredResult(output=cast(T, output), usage=usage)

    def _outline(self, refs: list[ReferencePassage], _: str) -> OutlineLLM:
        chapters: list[OutlineChapterLLM] = []
        group = max(1, len(refs) // 3 + (len(refs) % 3 > 0))
        for i in range(0, len(refs), group):
            part = refs[i : i + group]
            first = part[0]
            sents = _sentences(" ".join(p.text for p in part))[:2] or ["the key ideas"]
            chapters.append(
                OutlineChapterLLM(
                    title=_heading(first.text, f"Chapter {len(chapters) + 1}"),
                    description=sents[0][:200],
                    document_id=first.document_id,
                    page_start=min(p.page_start for p in part),
                    page_end=max(p.page_end for p in part),
                    objectives=[
                        OutlineObjectiveLLM(text=f"Explain: {s[:150]}", pages=[first.page_start])
                        for s in sents
                    ],
                )
            )
        return OutlineLLM(subject="General", level="Secondary", chapters=chapters)

    def _section(self, refs: list[ReferencePassage], task: str) -> SectionLLM:
        ref = refs[0]
        body = "\n\n".join(_sentences(ref.text)[:4]) or ref.text[:600]
        return SectionLLM(
            title=_heading(ref.text, "Overview"),
            body_markdown=body,
            key_terms=sorted({w.lower() for w in re.findall(r"\b[A-Za-z]{8,}\b", ref.text)})[:5],
            source_refs=[SourceRefLLM(document_id=ref.document_id, page=ref.page_start)],
        )

    def _lesson(self, refs: list[ReferencePassage], task: str) -> LessonLLM:
        sections = [self._section([r], task) for r in refs[:5]]
        summary = [s for r in refs[:5] for s in _sentences(r.text)[:1]]
        return LessonLLM(
            title=sections[0].title if sections else "Lesson",
            sections=sections,
            summary=summary[:5],
            visualization_candidates=[
                VisualizationLLM(
                    concept=sections[0].title if sections else "Key structure",
                    visualization_type="diagram",
                    learning_reason="Seeing the parts in space helps students relate them.",
                )
            ],
        )
