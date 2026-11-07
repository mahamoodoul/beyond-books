import uuid

from pydantic import BaseModel


class Insight(BaseModel):
    severity: str  # info | warning | critical
    kind: str
    message: str
    target_id: str | None = None


class LessonStat(BaseModel):
    lesson_id: uuid.UUID
    title: str
    chapter_title: str
    completed: int
    completion_rate: float | None


class OptionCount(BaseModel):
    option_key: str
    text: str
    count: int


class QuestionStat(BaseModel):
    question_key: str
    question_text: str
    question_type: str
    responses: int
    avg_score_rate: float | None
    common_wrong: list[OptionCount]
    suppressed: bool


class AssessmentStat(BaseModel):
    assessment_id: uuid.UUID
    title: str
    students_attempted: int
    graded_attempts: int
    avg_score_rate: float | None
    pass_rate: float | None
    pending_reviews: int
    questions: list[QuestionStat]


class ObjectiveStat(BaseModel):
    objective_id: uuid.UUID
    text: str
    chapter_title: str
    students_with_evidence: int
    avg_mastery: float | None
    gaps: int
    developing: int
    mastered: int


class ConceptCount(BaseModel):
    concept: str
    count: int


class StudentAttention(BaseModel):
    student_id: uuid.UUID
    display_name: str
    completed_lessons: int
    gap_objectives: int
    reasons: list[str]


class CourseAnalytics(BaseModel):
    course_id: uuid.UUID
    enrolled: int
    min_group_size: int
    suppressed: bool
    total_lessons: int
    avg_completion_rate: float | None
    avg_score_rate: float | None
    lessons: list[LessonStat]
    assessments: list[AssessmentStat]
    objectives: list[ObjectiveStat]
    missing_concepts: list[ConceptCount]
    attention: list[StudentAttention]
    insights: list[Insight]


class ObjectiveMastery(BaseModel):
    objective_id: uuid.UUID
    text: str
    mastery: float | None
    evidence_count: int
    status: str  # gap | developing | mastered | no_evidence


class Recommendation(BaseModel):
    lesson_id: uuid.UUID
    lesson_title: str
    reason: str


class StudentInsights(BaseModel):
    student_id: uuid.UUID
    display_name: str
    course_id: uuid.UUID
    completed_lessons: int
    total_lessons: int
    attempts: int
    avg_score_rate: float | None
    objectives: list[ObjectiveMastery]
    recommendations: list[Recommendation]
