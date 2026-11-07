"""Deterministic offline LLM for tests, local development and demos without an API key.

It builds plausible, correctly-grounded output directly from the reference passages. It is NOT
a quality signal for prompts — use the real provider and human review for that.
"""

import re
from typing import Any, cast

from pydantic import BaseModel

from app.integrations.interfaces import LLMUsage, ReferencePassage, StructuredResult
from app.modules.ai_engine.schemas import (
    AnimationPlanLLM,
    AnimationStepLLM,
    AssessmentLLM,
    CriterionLLM,
    EvaluationLLM,
    ExplainLLM,
    GeneratorParamLLM,
    LessonLLM,
    Model3DLLM,
    ModelPartLLM,
    OptionLLM,
    OutlineChapterLLM,
    OutlineLLM,
    OutlineObjectiveLLM,
    PartInsightLLM,
    QuestionLLM,
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
            AnimationPlanLLM: self._animation_plan,
            AssessmentLLM: self._assessment,
            EvaluationLLM: self._evaluation,
            ExplainLLM: self._explain,
            Model3DLLM: self._model_3d,
            PartInsightLLM: self._part_insight,
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

    def _animation_plan(self, refs: list[ReferencePassage], task: str) -> AnimationPlanLLM:
        ids = []
        for line in task.splitlines():
            if line.startswith("COMPONENT_IDS:"):
                ids = [x for x in line.split(":", 1)[1].strip().split(",") if x]
        sents = _sentences(" ".join(r.text for r in refs))
        neutral = {"visible": True, "opacity": 1.0, "axis": "y", "degrees": 0.0, "path_id": ""}

        def explain(cid: str) -> str:
            key = cid.replace("_", " ")
            return next((x for x in sents if key in x.lower()), f"Look at the {key}.")[:300]

        steps = []
        if ids:
            steps.append(
                AnimationStepLLM(
                    action="camera_focus",
                    target_component=ids[0],
                    duration_ms=1500,
                    explanation=explain(ids[0]),
                    **neutral,
                )
            )
        steps += [
            AnimationStepLLM(
                action="highlight_component",
                target_component=c,
                duration_ms=2500,
                explanation=explain(c),
                **neutral,
            )
            for c in ids[:6]
        ]
        steps.append(
            AnimationStepLLM(
                action="show_annotation",
                target_component="",
                duration_ms=3000,
                explanation=sents[0][:300] if sents else "Review the parts.",
                **neutral,
            )
        )
        return AnimationPlanLLM(title="Guided tour", steps=steps)

    def _assessment(self, refs: list[ReferencePassage], task: str) -> AssessmentLLM:
        sents = _sentences(" ".join(r.text for r in refs))[:6] or ["The topic is important."]
        questions = []
        for i, sent in enumerate(sents[:4]):
            words = [w for w in re.findall(r"[A-Za-z]{5,}", sent)]
            answer = words[-1] if words else "answer"
            stem = sent.replace(answer, "_____", 1)
            distractors = [
                w for w in ("membrane", "nucleus", "pressure", "energy") if w != answer.lower()
            ][:3]
            options = [OptionLLM(text=answer, is_correct=True)] + [
                OptionLLM(text=d, is_correct=False) for d in distractors
            ]
            options = options[i % 4 :] + options[: i % 4]
            questions.append(
                QuestionLLM(
                    question_type="mcq",
                    question_text=f"Fill in the blank: {stem}",
                    points=1,
                    difficulty="easy",
                    explanation_correct=sent[:300],
                    explanation_general=f"Re-read: {sent[:200]}",
                    objective_index=0 if i == 0 else -1,
                    options=options,
                    rubric=[],
                    model_answer="",
                )
            )
        model = " ".join(sents[:2])[:400]
        questions.append(
            QuestionLLM(
                question_type="short_answer",
                question_text="Explain the main idea of this chapter in your own words.",
                points=2,
                difficulty="medium",
                explanation_correct="",
                explanation_general="",
                objective_index=-1,
                options=[],
                rubric=[
                    CriterionLLM(description="States the key idea correctly", points=1),
                    CriterionLLM(description="Uses correct terminology", points=1),
                ],
                model_answer=model,
            )
        )
        return AssessmentLLM(title="Chapter quiz", questions=questions)

    def _evaluation(self, refs: list[ReferencePassage], task: str) -> EvaluationLLM:
        answer = " ".join(r.text for r in refs).lower()
        model = task.split("Model answer:", 1)[-1].lower()
        key = {w for w in re.findall(r"[a-z]{5,}", model)}
        got = {w for w in re.findall(r"[a-z]{5,}", answer)}
        points = float(re.search(r"\(([\d.]+) points\)", task).group(1))  # type: ignore[union-attr]
        ratio = len(key & got) / len(key) if key else 0.0
        missing = sorted(key - got)[:5]
        return EvaluationLLM(
            score=round(points * min(1.0, ratio * 1.5), 1),
            feedback="Good start."
            if ratio > 0.3
            else "Your answer misses key ideas from the lesson.",
            missing_concepts=missing,
            confidence=0.4 + 0.4 * min(1.0, ratio),
        )

    def _explain(self, refs: list[ReferencePassage], task: str) -> ExplainLLM:
        first = refs[0]
        title = first.text.split("\n", 1)[0].strip()
        sents = _sentences(" ".join(r.text for r in refs))[:3]
        return ExplainLLM(
            explanation=" ".join(sents) or first.text[:400], revision_section_title=title
        )

    def _model_3d(self, refs: list[ReferencePassage], task: str) -> Model3DLLM:
        words = [w.lower() for w in re.findall(r"[A-Za-z]{4,}", task.split(":", 1)[-1])][:3] or [
            "object"
        ]
        parts = [
            ModelPartLLM(
                name="body",
                label="Body",
                shape="ellipsoid",
                size=[1.2, 0.9, 0.9],
                position=[0, 0, 0],
                rotation_deg=[0, 0, 0],
                color="#6688cc",
                opacity=0.5,
                description="The outer body of the model.",
            )
        ]
        for i, w in enumerate(words):
            parts.append(
                ModelPartLLM(
                    name=w,
                    label=w.capitalize(),
                    shape=["sphere", "box", "cylinder"][i % 3],
                    size=[0.3, 0.4, 0.3],
                    position=[-0.6 + 0.6 * i, 0, 0],
                    rotation_deg=[0, 0, 0],
                    color=["#cc4444", "#44aa66", "#ddaa33"][i % 3],
                    opacity=1,
                    description=f"The {w} part of the model.",
                )
            )
        return Model3DLLM(title=" ".join(words), parts=parts)

    def _part_insight(self, refs: list[ReferencePassage], task: str) -> PartInsightLLM:
        part = next(
            (ln.split(":", 1)[1].strip() for ln in task.splitlines() if ln.startswith("Part:")),
            "part",
        )
        action = next(
            (ln.split(":", 1)[1].strip() for ln in task.splitlines() if ln.startswith("Action:")),
            "",
        )
        sents = _sentences(" ".join(r.text for r in refs))
        hit = next(
            (x for x in sents if part.lower().split()[0] in x.lower()), sents[0] if sents else ""
        )
        if action == "quiz_question":
            return PartInsightLLM(
                text=f"Question about the {part}.",
                question_text=f"Which statement about the {part} is correct?",
                options=[
                    hit[:150] or "It is part of the model.",
                    "It has no function.",
                    "It is made of metal.",
                    "It is outside the body.",
                ],
                correct_index=0,
                explanation=hit[:200],
            )
        prefix = {"simplify": "In simple words:", "compare": "Comparison:"}.get(action, "In depth:")
        return PartInsightLLM(
            text=f"{prefix} {hit or part}",
            question_text="",
            options=[],
            correct_index=-1,
            explanation="",
        )
