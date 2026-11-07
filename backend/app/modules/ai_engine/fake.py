"""Deterministic offline LLM for tests, local development and demos without an API key.

It builds plausible, correctly-grounded output directly from the reference passages. It is NOT
a quality signal for prompts — use the real provider and human review for that.
"""

import re
from typing import Any, cast

from pydantic import BaseModel

from app.integrations.interfaces import LLMUsage, ReferencePassage, StructuredResult
from app.modules.ai_engine.schemas import (
    GeneratorParamLLM,
    LessonLLM,
    OutlineChapterLLM,
    OutlineLLM,
    OutlineObjectiveLLM,
    SceneComponentLLM,
    ScenePlanLLM,
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
            ScenePlanLLM: self._scene_plan,
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

    def _scene_plan(self, refs: list[ReferencePassage], task: str) -> ScenePlanLLM:
        import json

        catalogue = (
            json.loads(task.split("CATALOGUE_JSON:", 1)[1]) if "CATALOGUE_JSON:" in task else {}
        )
        text = (
            " ".join(r.text for r in refs).lower() + " " + task.split("CATALOGUE_JSON:")[0].lower()
        )
        words = set(re.findall(r"[a-z]{3,}", text))
        sents = _sentences(" ".join(r.text for r in refs))

        def explain(part: str) -> str:
            key = part.replace("_", " ")
            hit = next((x for x in sents if key in x.lower()), "")
            return hit[:300]

        best, best_score = None, 0
        for a in catalogue.get("assets", []):
            hay = set(
                re.findall(
                    r"[a-z]{3,}", f"{a['name']} {a['description']} {a.get('subject') or ''}".lower()
                )
            )
            score = len(words & hay)
            if score > best_score:
                best, best_score = a, score
        empty: dict[str, Any] = {
            "asset_id": "",
            "generator": "",
            "generator_params": [],
            "generation_prompt": "",
        }
        if best:
            return ScenePlanLLM(
                **{
                    **empty,
                    "decision": "reuse_asset",
                    "asset_id": best["id"],
                    "title": f"Explore: {best['name']}",
                    "rationale": "A matching approved model exists.",
                    "components": [
                        SceneComponentLLM(
                            mesh_name=p,
                            label=p.replace("_", " ").capitalize(),
                            explanation=explain(p),
                        )
                        for p in best["parts"]
                    ],
                }
            )
        for gen, keys in (
            ("solar_system", {"planet", "planets", "sun", "orbit", "solar"}),
            ("atom", {"atom", "electron", "electrons", "nucleus", "proton"}),
        ):
            if words & keys:
                g = next(x for x in catalogue.get("generators", []) if x["name"] == gen)
                return ScenePlanLLM(
                    **{
                        **empty,
                        "decision": "procedural",
                        "generator": gen,
                        "generator_params": [
                            GeneratorParamLLM(name=k, value=4)
                            for k in g["params"]
                            if g["params"][k]["type"] == "int"
                        ],
                        "title": f"Explore: {gen.replace('_', ' ')}",
                        "rationale": "A procedural generator matches the topic.",
                        "components": [
                            SceneComponentLLM(
                                mesh_name=p,
                                label=p.replace("_", " ").capitalize(),
                                explanation=explain(p),
                            )
                            for p in g["parts"][:5]
                        ],
                    }
                )
        title = refs[0].text.split("\n", 1)[0][:80] if refs else "Lesson object"
        return ScenePlanLLM(
            **{
                **empty,
                "decision": "generate_asset",
                "title": title,
                "generation_prompt": f"A clear, simple educational 3D model of: {title}",
                "rationale": "No catalogue model or generator fits.",
                "components": [],
            }
        )
