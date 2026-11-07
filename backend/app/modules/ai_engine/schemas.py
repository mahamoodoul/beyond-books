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


class AnimationStepLLM(BaseModel):
    action: Literal[
        "highlight_component",
        "set_visibility",
        "set_opacity",
        "move_along_path",
        "rotate_component",
        "show_flow_particles",
        "camera_focus",
        "show_annotation",
        "wait",
    ]
    target_component: str
    duration_ms: int
    explanation: str
    visible: bool
    opacity: float
    axis: Literal["x", "y", "z"]
    degrees: float
    path_id: str


class AnimationPlanLLM(BaseModel):
    title: str
    steps: list[AnimationStepLLM]


class OptionLLM(BaseModel):
    text: str
    is_correct: bool


class CriterionLLM(BaseModel):
    description: str
    points: float


class QuestionLLM(BaseModel):
    question_type: Literal["mcq", "short_answer"]
    question_text: str
    points: float
    difficulty: Literal["easy", "medium", "hard"]
    explanation_correct: str
    explanation_general: str
    objective_index: int
    options: list[OptionLLM]
    rubric: list[CriterionLLM]
    model_answer: str


class AssessmentLLM(BaseModel):
    title: str
    questions: list[QuestionLLM]


class EvaluationLLM(BaseModel):
    score: float
    feedback: str
    missing_concepts: list[str]
    confidence: float


class ExplainLLM(BaseModel):
    explanation: str
    revision_section_title: str


class ModelPartLLM(BaseModel):
    name: str
    label: str
    shape: Literal["box", "sphere", "ellipsoid", "cylinder", "cone", "torus", "capsule"]
    size: list[float]
    position: list[float]
    rotation_deg: list[float]
    color: str
    opacity: float
    description: str


class Model3DLLM(BaseModel):
    title: str
    parts: list[ModelPartLLM]
