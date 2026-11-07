"""Schemas the LLM must fill (structured outputs).

Deliberately simple (no defaults/constraints) so they are accepted by strict structured-output
modes. Model output is then validated, cleaned and converted into the strict domain contracts
(LessonContent etc.) in validation.py — never stored directly.
"""

from typing import Literal

from pydantic import BaseModel


class OutlineObjectiveLLM(BaseModel):
    text: str
    pages: list[int]


class OutlineChapterLLM(BaseModel):
    title: str
    description: str
    document_id: str
    page_start: int
    page_end: int
    objectives: list[OutlineObjectiveLLM]


class OutlineLLM(BaseModel):
    subject: str
    level: str
    chapters: list[OutlineChapterLLM]


class SourceRefLLM(BaseModel):
    document_id: str
    page: int


class SectionLLM(BaseModel):
    title: str
    body_markdown: str
    key_terms: list[str]
    source_refs: list[SourceRefLLM]


class VisualizationLLM(BaseModel):
    concept: str
    visualization_type: Literal[
        "anatomical_model", "procedural_geometry", "simulation", "process_animation", "diagram"
    ]
    learning_reason: str


class LessonLLM(BaseModel):
    title: str
    sections: list[SectionLLM]
    summary: list[str]
    visualization_candidates: list[VisualizationLLM]


class SceneComponentLLM(BaseModel):
    mesh_name: str
    label: str
    explanation: str


class GeneratorParamLLM(BaseModel):
    name: str
    value: float


class ScenePlanLLM(BaseModel):
    decision: Literal["reuse_asset", "procedural", "generate_asset", "none"]
    asset_id: str
    generator: str
    generator_params: list[GeneratorParamLLM]
    title: str
    components: list[SceneComponentLLM]
    generation_prompt: str
    rationale: str
