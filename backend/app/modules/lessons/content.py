"""Canonical lesson content contract (design §6.5). Used for teacher-authored AND AI-generated
lessons; AI output is converted into this shape and re-validated before it is stored."""

import uuid
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

LESSON_SCHEMA_VERSION = "1.0"

VisualizationType = Literal[
    "anatomical_model", "procedural_geometry", "simulation", "process_animation", "diagram"
]


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class SourceRef(_Strict):
    document_id: uuid.UUID
    page: int = Field(ge=1)


class LessonSection(_Strict):
    title: str = Field(min_length=1, max_length=200)
    body_markdown: str = Field(max_length=20_000)
    key_terms: list[str] = Field(default_factory=list, max_length=30)
    source_refs: list[SourceRef] = Field(default_factory=list, max_length=30)


class VisualizationCandidate(_Strict):
    concept: str = Field(min_length=1, max_length=200)
    visualization_type: VisualizationType
    learning_reason: str = Field(max_length=1000)


class LessonContent(_Strict):
    schema_version: Literal["1.0"] = "1.0"
    sections: list[LessonSection] = Field(default_factory=list, max_length=40)
    summary: list[str] = Field(default_factory=list, max_length=20)
    visualization_candidates: list[VisualizationCandidate] = Field(
        default_factory=list, max_length=10
    )
