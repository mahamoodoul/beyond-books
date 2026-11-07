"""Canonical assessment content contract (teacher-authored and AI-generated).

Question types
  mcq              one correct option
  true_false       options "True" / "False", one correct
  multiple_select  one or more correct options ("select all that apply")
  short_answer     free text, rubric-marked (AI suggestion + teacher review)
  fill_blanks      `cloze_text` with blanks written as {{answer|alternative}}
  matching         `pairs` (prompt -> match) plus optional `distractors`
  ordering         `items` listed in the correct order; shown shuffled
  numeric          `numeric_answer` ± `tolerance`, optional `unit`
  hotspot_3d       pick the right part (`target_component_ids`) in a 3D scene (`scene_id`)
Every type except short_answer is marked automatically (see grading.py).
"""

import re
import uuid
from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

Key = Annotated[str, Field(pattern=r"^[a-z][a-z0-9_]{0,63}$")]

QuestionType = Literal[
    "mcq",
    "true_false",
    "multiple_select",
    "short_answer",
    "fill_blanks",
    "matching",
    "ordering",
    "numeric",
    "hotspot_3d",
]
OPTION_TYPES = {"mcq", "true_false", "multiple_select"}
AUTO_GRADED = {
    "mcq",
    "true_false",
    "multiple_select",
    "fill_blanks",
    "matching",
    "ordering",
    "numeric",
    "hotspot_3d",
}
# a blank is {{answer}} or {{answer|alternative|...}}
BLANK_RE = re.compile(r"\{\{([^{}]{1,200})\}\}")


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class OptionIn(_Strict):
    key: Key | None = None
    text: str = Field(min_length=1, max_length=500)
    is_correct: bool = False


class Criterion(_Strict):
    description: str = Field(min_length=1, max_length=500)
    points: float = Field(gt=0, le=100)


class PairIn(_Strict):
    key: Key | None = None
    prompt: str = Field(min_length=1, max_length=300)
    match: str = Field(min_length=1, max_length=300)


class ItemIn(_Strict):
    key: Key | None = None
    text: str = Field(min_length=1, max_length=300)


def parse_blanks(cloze: str) -> list[list[str]]:
    """Accepted answers for each blank, in order."""
    out = []
    for m in BLANK_RE.finditer(cloze):
        answers = [a.strip() for a in m.group(1).split("|") if a.strip()]
        out.append(answers)
    return out


def cloze_segments(cloze: str) -> list[dict[str, str]]:
    """Text pieces and blank placeholders (b1, b2, ...) for the student view; no answers."""
    segs: list[dict[str, str]] = []
    pos = 0
    for i, m in enumerate(BLANK_RE.finditer(cloze), 1):
        if m.start() > pos:
            segs.append({"text": cloze[pos : m.start()]})
        segs.append({"blank": f"b{i}"})
        pos = m.end()
    if pos < len(cloze):
        segs.append({"text": cloze[pos:]})
    return segs


class QuestionIn(_Strict):
    key: Key | None = None
    question_type: QuestionType
    question_text: str = Field(min_length=1, max_length=2000)
    points: float = Field(default=1, gt=0, le=100)
    difficulty: Literal["easy", "medium", "hard"] = "medium"
    explanation_correct: str = Field(default="", max_length=2000)
    explanation_general: str = Field(default="", max_length=2000)
    learning_objective_id: uuid.UUID | None = None
    lesson_id: uuid.UUID | None = None
    # mcq / true_false / multiple_select
    options: list[OptionIn] = Field(default_factory=list, max_length=8)
    # short_answer
    rubric: list[Criterion] = Field(default_factory=list, max_length=10)
    model_answer: str = Field(default="", max_length=2000)
    # fill_blanks
    cloze_text: str = Field(default="", max_length=4000)
    case_sensitive: bool = False
    # matching
    pairs: list[PairIn] = Field(default_factory=list, max_length=10)
    distractors: list[str] = Field(default_factory=list, max_length=6)
    # ordering
    items: list[ItemIn] = Field(default_factory=list, max_length=10)
    # numeric
    numeric_answer: float | None = None
    tolerance: float = Field(default=0, ge=0)
    unit: str = Field(default="", max_length=40)
    # hotspot_3d
    scene_id: uuid.UUID | None = None
    target_component_ids: list[Key] = Field(default_factory=list, max_length=10)

    @model_validator(mode="after")
    def _check(self) -> Self:
        t = self.question_type
        used = {
            "options": bool(self.options),
            "rubric": bool(self.rubric),
            "cloze_text": bool(self.cloze_text),
            "pairs": bool(self.pairs or self.distractors),
            "items": bool(self.items),
            "numeric_answer": self.numeric_answer is not None,
            "scene_id": self.scene_id is not None or bool(self.target_component_ids),
        }
        allowed = {
            "mcq": "options",
            "true_false": "options",
            "multiple_select": "options",
            "short_answer": "rubric",
            "fill_blanks": "cloze_text",
            "matching": "pairs",
            "ordering": "items",
            "numeric": "numeric_answer",
            "hotspot_3d": "scene_id",
        }[t]
        stray = [f for f, on in used.items() if on and f != allowed]
        if stray:
            raise ValueError(f"{_label(t)} questions do not use {', '.join(stray)}")

        n_correct = sum(o.is_correct for o in self.options)
        if t == "mcq":
            if not 2 <= len(self.options) <= 8:
                raise ValueError("multiple-choice questions need 2–8 options")
            if n_correct != 1:
                raise ValueError("multiple-choice questions need exactly one correct option")
        elif t == "true_false":
            texts = [o.text.strip().lower() for o in self.options]
            if texts != ["true", "false"] or n_correct != 1:
                raise ValueError("true/false questions need the options True, False; one correct")
        elif t == "multiple_select":
            if not 2 <= len(self.options) <= 8:
                raise ValueError("multiple-select questions need 2–8 options")
            if n_correct < 1:
                raise ValueError("multiple-select questions need at least one correct option")
        elif t == "short_answer":
            if not self.rubric:
                raise ValueError("short-answer questions need at least one rubric criterion")
            total = sum(c.points for c in self.rubric)
            if abs(total - self.points) > 1e-6:
                raise ValueError(
                    f"rubric points ({total:g}) must equal question points ({self.points:g})"
                )
        elif t == "fill_blanks":
            blanks = parse_blanks(self.cloze_text)
            if not 1 <= len(blanks) <= 15:
                raise ValueError("fill-in-the-blank text needs 1–15 blanks written as {{answer}}")
            if any(not b for b in blanks):
                raise ValueError("every blank needs at least one accepted answer")
        elif t == "matching":
            if not 2 <= len(self.pairs) <= 10:
                raise ValueError("matching questions need 2–10 pairs")
            matches = [p.match.strip().lower() for p in self.pairs] + [
                d.strip().lower() for d in self.distractors
            ]
            if len(matches) != len(set(matches)):
                raise ValueError("matching answers (and decoys) must all be different")
        elif t == "ordering":
            if not 3 <= len(self.items) <= 10:
                raise ValueError("ordering questions need 3–10 items")
        elif t == "numeric":
            if self.numeric_answer is None:
                raise ValueError("numeric questions need a correct answer")
        elif t == "hotspot_3d":
            if self.scene_id is None or not self.target_component_ids:
                raise ValueError("3D questions need a scene and at least one correct part")
        return self


def _label(t: str) -> str:
    return {
        "mcq": "multiple-choice",
        "true_false": "true/false",
        "multiple_select": "multiple-select",
        "short_answer": "short-answer",
        "fill_blanks": "fill-in-the-blank",
        "matching": "matching",
        "ordering": "ordering",
        "numeric": "numeric",
        "hotspot_3d": "3D",
    }[t]


class QuizSettings(_Strict):
    """Delivery settings, frozen into each published version."""

    time_limit_minutes: int | None = Field(default=None, ge=1, le=600)
    shuffle_questions: bool = False
    shuffle_options: bool = False
    # draw this many questions from the pool for each attempt (None = all)
    questions_per_attempt: int | None = Field(default=None, ge=1, le=50)
    partial_credit: bool = True
    reveal_answers: Literal["after_submit", "after_last_attempt", "never"] = "after_submit"
    layout: Literal["all", "one_per_page"] = "all"
    allow_back: bool = True


class AssessmentContent(_Strict):
    schema_version: Literal["1.0"] = "1.0"
    questions: list[QuestionIn] = Field(default_factory=list, max_length=50)

    def with_keys(self) -> "AssessmentContent":
        """Assign stable keys (q1.., oa/ob.., p1.., i1..) where missing; keys must be unique."""
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
            pairs = [
                p.model_copy(update={"key": p.key or f"p{i + 1}"}) for i, p in enumerate(q.pairs)
            ]
            items = [
                it.model_copy(update={"key": it.key or f"i{i + 1}"}) for i, it in enumerate(q.items)
            ]
            questions.append(
                q.model_copy(update={"key": key, "options": opts, "pairs": pairs, "items": items})
            )
        keys = [q.key for q in questions]
        if len(keys) != len(set(keys)):
            raise ValueError("question keys must be unique")
        for q in questions:
            for name, sub in (("option", q.options), ("pair", q.pairs), ("item", q.items)):
                skeys = [s.key for s in sub]
                if len(skeys) != len(set(skeys)):
                    raise ValueError(f"{name} keys must be unique in {q.key}")
        return self.model_copy(update={"questions": questions})

    @property
    def max_score(self) -> float:
        return sum(q.points for q in self.questions)
