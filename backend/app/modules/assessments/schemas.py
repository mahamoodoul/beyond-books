import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.modules.assessments.content import AssessmentContent, QuizSettings


class AssessmentCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    passing_score: float = Field(default=60, ge=0, le=100)
    max_attempts: int = Field(default=3, ge=1, le=20)
    settings: QuizSettings = Field(default_factory=QuizSettings)


class AssessmentUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    passing_score: float | None = Field(default=None, ge=0, le=100)
    max_attempts: int | None = Field(default=None, ge=1, le=20)
    settings: QuizSettings | None = None


class QuestionsUpdate(BaseModel):
    expected_version: int = Field(ge=1)
    content: AssessmentContent


class AssessmentSummary(BaseModel):
    id: uuid.UUID
    chapter_id: uuid.UUID
    title: str
    status: str
    version: int
    published_version: int | None
    has_unpublished_changes: bool
    question_count: int
    max_score: float
    passing_score: float
    max_attempts: int
    origin: str
    settings: QuizSettings
    questions_per_attempt: int  # questions a student answers per attempt (pool draw)


class TeacherAssessment(AssessmentSummary):
    content: AssessmentContent


class StudentOption(BaseModel):
    key: str
    text: str


class StudentQuestion(BaseModel):
    key: str
    question_type: str
    question_text: str
    points: float
    options: list[StudentOption]


class StudentAssessment(AssessmentSummary):
    """No answer keys, rubrics or explanations before submission."""

    questions: list[StudentQuestion]
    attempts_used: int


class AnswerIn(BaseModel):
    question_key: str = Field(max_length=64)
    selected_option_key: str | None = Field(default=None, max_length=64)
    answer_text: str | None = Field(default=None, max_length=5000)


class SubmitRequest(BaseModel):
    answers: list[AnswerIn] = Field(max_length=50)


class AttemptStart(BaseModel):
    attempt_id: uuid.UUID
    attempt_number: int
    assessment: StudentAssessment


class AnswerResult(BaseModel):
    answer_id: uuid.UUID
    question_key: str
    question_type: str
    question_text: str
    points: float
    selected_option_key: str | None
    answer_text: str | None
    correct_option_key: str | None
    is_correct: bool | None
    auto_score: float | None
    explanation: str | None
    ai_feedback: str | None
    ai_suggested_score: float | None
    missing_concepts: list[str]
    final_score: float | None
    teacher_feedback: str | None
    evaluation_status: str | None
    explain_further: dict[str, Any] | None
    lesson_id: uuid.UUID | None


class AttemptResult(BaseModel):
    attempt_id: uuid.UUID
    assessment_id: uuid.UUID
    assessment_title: str
    attempt_number: int
    status: str
    submitted_at: datetime | None
    score: float | None
    provisional_score: float | None
    max_score: float
    passing_score: float
    passed: bool | None
    answers: list[AnswerResult]


class AttemptRow(BaseModel):
    attempt_id: uuid.UUID
    student_id: uuid.UUID
    student_name: str
    attempt_number: int
    status: str
    score: float | None
    provisional_score: float | None
    max_score: float
    submitted_at: datetime | None
    pending_reviews: int


class ReviewItem(BaseModel):
    evaluation_id: uuid.UUID
    attempt_id: uuid.UUID
    student_name: str
    question_key: str
    question_text: str
    rubric: list[dict[str, Any]]
    model_answer: str
    answer_text: str | None
    points: float
    suggested_score: float | None
    feedback: str | None
    missing_concepts: list[str]
    confidence: float | None
    status: str


class ReviewDecision(BaseModel):
    final_score: float = Field(ge=0, le=100)
    teacher_feedback: str | None = Field(default=None, max_length=2000)
