import uuid

from fastapi import APIRouter, status

from app.core.deps import DB, CurrentUser
from app.modules.assessments import service
from app.modules.assessments.schemas import (
    AssessmentCreate,
    AssessmentSummary,
    AssessmentUpdate,
    AttemptResult,
    AttemptRow,
    AttemptStart,
    QuestionsUpdate,
    ReviewDecision,
    ReviewItem,
    StudentAssessment,
    SubmitRequest,
    TeacherAssessment,
)
from app.modules.operations.api import JobOut
from app.modules.operations.models import Job

router = APIRouter(tags=["assessments"])


@router.post(
    "/chapters/{chapter_id}/assessments",
    response_model=TeacherAssessment,
    status_code=status.HTTP_201_CREATED,
)
def create(
    chapter_id: uuid.UUID, body: AssessmentCreate, user: CurrentUser, db: DB
) -> TeacherAssessment:
    chapter = service.manage_chapter(db, user, chapter_id)
    a = service.create_assessment(
        db, user, chapter, body.title, body.passing_score, body.max_attempts
    )
    db.commit()
    return service.teacher_view(a)


@router.get("/chapters/{chapter_id}/assessments", response_model=list[AssessmentSummary])
def list_assessments(chapter_id: uuid.UUID, user: CurrentUser, db: DB) -> list[AssessmentSummary]:
    return service.list_for_chapter(db, user, chapter_id)


@router.get("/assessments/{assessment_id}", response_model=TeacherAssessment | StudentAssessment)
def get_assessment(
    assessment_id: uuid.UUID, user: CurrentUser, db: DB
) -> TeacherAssessment | StudentAssessment:
    return service.get_assessment(db, user, assessment_id)


@router.patch("/assessments/{assessment_id}", response_model=TeacherAssessment)
def update(
    assessment_id: uuid.UUID, body: AssessmentUpdate, user: CurrentUser, db: DB
) -> TeacherAssessment:
    a = service.update_settings(db, user, assessment_id, body.model_dump(exclude_unset=True))
    return service.teacher_view(a)


@router.put("/assessments/{assessment_id}/questions", response_model=TeacherAssessment)
def replace_questions(
    assessment_id: uuid.UUID, body: QuestionsUpdate, user: CurrentUser, db: DB
) -> TeacherAssessment:
    a = service.replace_questions(db, user, assessment_id, body.expected_version, body.content)
    return service.teacher_view(a)


@router.post("/assessments/{assessment_id}/publish", response_model=TeacherAssessment)
def publish(assessment_id: uuid.UUID, user: CurrentUser, db: DB) -> TeacherAssessment:
    return service.teacher_view(service.publish(db, user, assessment_id))


@router.post("/assessments/{assessment_id}/unpublish", response_model=TeacherAssessment)
def unpublish(assessment_id: uuid.UUID, user: CurrentUser, db: DB) -> TeacherAssessment:
    return service.teacher_view(service.unpublish(db, user, assessment_id))


@router.post(
    "/assessments/{assessment_id}/attempts",
    response_model=AttemptStart,
    status_code=status.HTTP_201_CREATED,
)
def start_attempt(assessment_id: uuid.UUID, user: CurrentUser, db: DB) -> AttemptStart:
    attempt, view = service.start_attempt(db, user, assessment_id)
    return AttemptStart(
        attempt_id=attempt.id, attempt_number=attempt.attempt_number, assessment=view
    )


@router.post("/attempts/{attempt_id}/submit", response_model=AttemptResult)
def submit(attempt_id: uuid.UUID, body: SubmitRequest, user: CurrentUser, db: DB) -> AttemptResult:
    service.submit(db, user, attempt_id, body.answers)
    return service.result(db, user, attempt_id)


@router.get("/attempts/{attempt_id}", response_model=AttemptResult)
def get_attempt(attempt_id: uuid.UUID, user: CurrentUser, db: DB) -> AttemptResult:
    return service.result(db, user, attempt_id)


@router.get("/attempts/{attempt_id}/review", response_model=AttemptResult)
def teacher_attempt(attempt_id: uuid.UUID, user: CurrentUser, db: DB) -> AttemptResult:
    return service.result(db, user, attempt_id, as_teacher=True)


@router.get("/assessments/{assessment_id}/my-attempts", response_model=list[AttemptRow])
def my_attempts(assessment_id: uuid.UUID, user: CurrentUser, db: DB) -> list[AttemptRow]:
    return service.my_attempts(db, user, assessment_id)


@router.get("/assessments/{assessment_id}/attempts", response_model=list[AttemptRow])
def attempts(assessment_id: uuid.UUID, user: CurrentUser, db: DB) -> list[AttemptRow]:
    return service.list_attempts(db, user, assessment_id)


@router.get("/assessments/{assessment_id}/review-queue", response_model=list[ReviewItem])
def review_queue(assessment_id: uuid.UUID, user: CurrentUser, db: DB) -> list[ReviewItem]:
    return service.review_queue(db, user, assessment_id)


@router.post("/evaluations/{evaluation_id}/review", status_code=status.HTTP_204_NO_CONTENT)
def review(evaluation_id: uuid.UUID, body: ReviewDecision, user: CurrentUser, db: DB) -> None:
    service.review(db, user, evaluation_id, body.final_score, body.teacher_feedback)


@router.post(
    "/chapters/{chapter_id}/ai/assessment",
    response_model=JobOut,
    status_code=status.HTTP_202_ACCEPTED,
)
def generate(chapter_id: uuid.UUID, user: CurrentUser, db: DB) -> Job:
    from app.modules.ai_engine.assessment_ai import start_generation

    return start_generation(db, user, chapter_id)


@router.post(
    "/answers/{answer_id}/explain-further",
    response_model=JobOut,
    status_code=status.HTTP_202_ACCEPTED,
)
def explain_further(answer_id: uuid.UUID, user: CurrentUser, db: DB) -> Job:
    from app.modules.ai_engine.assessment_ai import start_explain_further

    return start_explain_further(db, user, answer_id)
