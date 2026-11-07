"""Canonical assessment content contract (teacher-authored and AI-generated)."""

import uuid
from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

Key = Annotated[str, Field(pattern=r"^[a-z][a-z0-9_]{0,63}$")]


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class OptionIn(_Strict):
    key: Key | None = None
    text: str = Field(min_length=1, max_length=500)
    is_correct: bool = False


class Criterion(_Strict):
    description: str = Field(min_length=1, max_length=500)
    points: float = Field(gt=0, le=100)


class QuestionIn(_Strict):
    key: Key | None = None
    question_type: Literal["mcq", "short_answer"]
    question_text: str = Field(min_length=1, max_length=2000)
    points: float = Field(default=1, gt=0, le=100)
    difficulty: Literal["easy", "medium", "hard"] = "medium"
    explanation_correct: str = Field(default="", max_length=2000)
    explanation_general: str = Field(default="", max_length=2000)
    learning_objective_id: uuid.UUID | None = None
    lesson_id: uuid.UUID | None = None
    options: list[OptionIn] = Field(default_factory=list, max_length=6)
    rubric: list[Criterion] = Field(default_factory=list, max_length=10)
    model_answer: str = Field(default="", max_length=2000)

    @model_validator(mode="after")
    def _check(self) -> Self:
        if self.question_type == "mcq":
            if not 2 <= len(self.options) <= 6:
                raise ValueError("multiple-choice questions need 2–6 options")
            if sum(o.is_correct for o in self.options) != 1:
                raise ValueError("multiple-choice questions need exactly one correct option")
            if self.rubric:
                raise ValueError("multiple-choice questions do not use a rubric")
        else:
            if self.options:
                raise ValueError("short-answer questions do not have options")
            if not self.rubric:
                raise ValueError("short-answer questions need at least one rubric criterion")
            total = sum(c.points for c in self.rubric)
            if abs(total - self.points) > 1e-6:
                raise ValueError(
                    f"rubric points ({total:g}) must equal question points ({self.points:g})"
                )
        return self


class AssessmentContent(_Strict):
    schema_version: Literal["1.0"] = "1.0"
    questions: list[QuestionIn] = Field(default_factory=list, max_length=50)

    def with_keys(self) -> "AssessmentContent":
        """Assign stable keys (q1.., a/b/c..) where missing; keys must be unique."""
        used = {q.key for q in self.questions if q.key}
        n = 1
        questions = []
        for q in self.questions:
            key = q.key
            while key is None:
                cand = f"q{n}"
                n += 1
                if cand not in used:
                    key = cand
                    used.add(cand)
            opts = [
                o.model_copy(update={"key": o.key or f"o{chr(97 + i)}"})
                for i, o in enumerate(q.options)
            ]
            questions.append(q.model_copy(update={"key": key, "options": opts}))
        keys = [q.key for q in questions]
        if len(keys) != len(set(keys)):
            raise ValueError("question keys must be unique")
        for q in questions:
            okeys = [o.key for o in q.options]
            if len(okeys) != len(set(okeys)):
                raise ValueError(f"option keys must be unique in {q.key}")
        return self.model_copy(update={"questions": questions})

    @property
    def max_score(self) -> float:
        return sum(q.points for q in self.questions)
