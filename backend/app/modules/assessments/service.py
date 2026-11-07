"""Assessments: authoring, versioned publishing, attempts, grading and teacher review.

Policy (ADR 0011, open decision #8): AI is ADVISORY. Multiple-choice is auto-scored; short-answer
scores become final only through teacher review. Attempts reference the published version they
were taken on, so later edits never change graded work.
"""

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import AppError, ConflictError, NotFoundError, PermissionDeniedError
from app.modules.assessments.content import AssessmentContent, QuestionIn, QuizSettings
from app.modules.assessments.models import (
    Assessment,
    AssessmentAttempt,
    AssessmentVersion,
    EvaluationResult,
    StudentAnswer,
)
from app.modules.assessments.schemas import (
    AnswerIn,
    AnswerResult,
    AssessmentSummary,
    AttemptResult,
    AttemptRow,
    ReviewItem,
    StudentAssessment,
    StudentOption,
    StudentQuestion,
    TeacherAssessment,
)
from app.modules.chapters.models import Chapter, LearningObjective, PublishStatus
from app.modules.chapters.service import chapter_access, get_chapter_for
from app.modules.courses.access import get_course_for
from app.modules.lessons.models import Lesson
from app.modules.operations import audit
from app.modules.three_d.models import ThreeDScene
from app.modules.users.models import User

STUDENT_READY_TYPES = {"mcq", "short_answer"}


class AssessmentNotPublishableError(AppError):
    status_code = 422
    code = "ASSESSMENT_NOT_PUBLISHABLE"
    message = "Add at least one question before publishing."


class AttemptLimitError(AppError):
    status_code = 409
    code = "ATTEMPT_LIMIT_REACHED"
    message = "You have used all attempts for this assessment."


def _content(a: Assessment) -> AssessmentContent:
    return AssessmentContent.model_validate(a.content)


def _settings(raw: dict[str, Any] | None) -> QuizSettings:
    return QuizSettings.model_validate(raw or {})


def _summary_fields(
    a: Assessment, content: AssessmentContent, settings: QuizSettings | None = None
) -> dict[str, Any]:
    settings = settings or _settings(a.settings)
    n = len(content.questions)
    return {
        "id": a.id,
        "chapter_id": a.chapter_id,
        "title": a.title,
        "status": a.status,
        "version": a.version,
        "published_version": a.published_version,
        "has_unpublished_changes": a.published_version != a.version,
        "question_count": len(content.questions),
        "max_score": content.max_score,
        "passing_score": a.passing_score,
        "max_attempts": a.max_attempts,
        "origin": a.origin,
        "settings": settings,
        "questions_per_attempt": min(n, settings.questions_per_attempt or n),
    }


def _published(db: Session, a: Assessment) -> AssessmentVersion | None:
    if a.published_version is None:
        return None
    return db.scalar(
        select(AssessmentVersion).where(
            AssessmentVersion.assessment_id == a.id,
            AssessmentVersion.version_number == a.published_version,
        )
    )


def validate_links(db: Session, chapter: Chapter, content: AssessmentContent) -> None:
    obj_ids = {q.learning_objective_id for q in content.questions if q.learning_objective_id}
    if obj_ids:
        found = set(
            db.scalars(
                select(LearningObjective.id).where(
                    LearningObjective.id.in_(obj_ids), LearningObjective.chapter_id == chapter.id
                )
            )
        )
        if found != obj_ids:
            raise NotFoundError("A linked learning objective is not part of this chapter.")
    lesson_ids = {q.lesson_id for q in content.questions if q.lesson_id}
    if lesson_ids:
        found = set(
            db.scalars(
                select(Lesson.id)
                .join(Chapter, Chapter.id == Lesson.chapter_id)
                .where(Lesson.id.in_(lesson_ids), Chapter.course_id == chapter.course_id)
            )
        )
        if found != lesson_ids:
            raise NotFoundError("A linked lesson is not part of this course.")
    for q in content.questions:
        if q.question_type == "hotspot_3d" and q.scene_id is not None:
            scene = _course_scene(db, chapter, q.scene_id)
            parts = {str(c.get("component_id")) for c in scene.scene_spec.get("components", [])}
            missing = sorted(set(q.target_component_ids) - parts)
            if missing:
                raise ConflictError(f"Question {q.key}: the 3D scene has no part(s) {missing}.")


def _course_scene(db: Session, chapter: Chapter, scene_id: uuid.UUID) -> ThreeDScene:
    scene = db.scalar(
        select(ThreeDScene)
        .join(Lesson, Lesson.id == ThreeDScene.lesson_id)
        .join(Chapter, Chapter.id == Lesson.chapter_id)
        .where(ThreeDScene.id == scene_id, Chapter.course_id == chapter.course_id)
    )
    if scene is None:
        raise NotFoundError("A linked 3D scene is not part of this course.")
    return scene


# ------------------------------------------------------------------ authoring


def _manage(db: Session, user: User, assessment_id: uuid.UUID) -> tuple[Assessment, Chapter]:
    a = db.get(Assessment, assessment_id)
    if a is None:
        raise NotFoundError()
    return a, get_chapter_for(db, user, a.chapter_id, manage=True)


def create_assessment(
    db: Session,
    user: User | None,
    chapter: Chapter,
    title: str,
    passing_score: float,
    max_attempts: int,
    content: AssessmentContent | None = None,
    origin: str = "manual",
    settings: QuizSettings | None = None,
) -> Assessment:
    content = (content or AssessmentContent()).with_keys()
    validate_links(db, chapter, content)
    a = Assessment(
        chapter_id=chapter.id,
        title=title,
        passing_score=passing_score,
        max_attempts=max_attempts,
        content=content.model_dump(mode="json"),
        origin=origin,
        settings=(settings or QuizSettings()).model_dump(mode="json"),
    )
    db.add(a)
    db.flush()
    return a


def teacher_view(a: Assessment) -> TeacherAssessment:
    c = _content(a)
    return TeacherAssessment(**_summary_fields(a, c), content=c)


def list_for_chapter(db: Session, user: User, chapter_id: uuid.UUID) -> list[AssessmentSummary]:
    chapter, access = chapter_access(db, user, chapter_id)
    rows = db.scalars(
        select(Assessment)
        .where(Assessment.chapter_id == chapter.id)
        .order_by(Assessment.created_at)
    )
    out = []
    for a in rows:
        if access.can_manage:
            out.append(AssessmentSummary(**_summary_fields(a, _content(a))))
        elif (v := _published(db, a)) is not None:
            c = AssessmentContent.model_validate(v.snapshot["content"])
            out.append(AssessmentSummary(**_summary_fields(a, c)))
    return out


def update_settings(
    db: Session, user: User, assessment_id: uuid.UUID, changes: dict[str, Any]
) -> Assessment:
    a, _ = _manage(db, user, assessment_id)
    if "settings" in changes:
        new = QuizSettings.model_validate(changes.pop("settings") or {}).model_dump(mode="json")
        if new != _settings(a.settings).model_dump(mode="json"):
            a.settings = new
            a.version += 1  # delivery settings are frozen per version: republish to apply
    for k, v in changes.items():
        setattr(a, k, v)
    db.commit()
    return a


def replace_questions(
    db: Session,
    user: User,
    assessment_id: uuid.UUID,
    expected_version: int,
    content: AssessmentContent,
) -> Assessment:
    a, chapter = _manage(db, user, assessment_id)
    if a.version != expected_version:
        raise ConflictError("This assessment was changed by someone else. Reload it.")
    try:
        content = content.with_keys()
    except ValueError as exc:
        raise ConflictError(str(exc)) from exc
    validate_links(db, chapter, content)
    a.content = content.model_dump(mode="json")
    a.version += 1
    db.commit()
    return a


def publish(db: Session, user: User, assessment_id: uuid.UUID) -> Assessment:
    a, _ = _manage(db, user, assessment_id)
    content = _content(a)
    if not content.questions:
        raise AssessmentNotPublishableError()
    # students can only answer these two types so far; the rest are builder-only drafts
    unsupported = sorted({q.question_type for q in content.questions} - STUDENT_READY_TYPES)
    if unsupported:
        raise ConflictError(
            f"Students can't answer {', '.join(unsupported)} questions yet. "
            "Remove them or keep the quiz as a draft."
        )
    chapter = db.get(Chapter, a.chapter_id)
    assert chapter is not None
    for q in content.questions:
        if q.question_type == "hotspot_3d" and q.scene_id is not None:
            if _course_scene(db, chapter, q.scene_id).published_version is None:
                raise ConflictError(
                    f"Question {q.key} uses a 3D scene that is not published yet. Publish it first."
                )
    if _published(db, a) is None or a.published_version != a.version:
        exists = db.scalar(
            select(AssessmentVersion).where(
                AssessmentVersion.assessment_id == a.id,
                AssessmentVersion.version_number == a.version,
            )
        )
        if exists is None:
            db.add(
                AssessmentVersion(
                    assessment_id=a.id,
                    version_number=a.version,
                    published_by=user.id,
                    snapshot={
                        "title": a.title,
                        "passing_score": a.passing_score,
                        "content": content.model_dump(mode="json"),
                        "settings": _settings(a.settings).model_dump(mode="json"),
                    },
                )
            )
    a.published_version = a.version
    a.status = "published"
    audit.record(
        db,
        action="assessment.publish",
        resource_type="assessment",
        resource_id=a.id,
        actor_user_id=user.id,
        metadata={"version": a.version},
    )
    db.commit()
    return a


def unpublish(db: Session, user: User, assessment_id: uuid.UUID) -> Assessment:
    a, _ = _manage(db, user, assessment_id)
    a.published_version = None
    a.status = "draft"
    db.commit()
    return a


# ------------------------------------------------------------------- students


def _student_access(db: Session, user: User, a: Assessment) -> AssessmentVersion:
    chapter, access = chapter_access(db, user, a.chapter_id)  # 404 unless chapter visible
    if access.can_manage:
        raise PermissionDeniedError("Teachers preview assessments in the editor.")
    v = _published(db, a)
    if v is None or chapter.status != PublishStatus.PUBLISHED:
        raise NotFoundError()
    return v


def _attempts_used(db: Session, a: Assessment, user: User) -> int:
    return (
        db.scalar(
            select(func.count(AssessmentAttempt.id)).where(
                AssessmentAttempt.assessment_id == a.id, AssessmentAttempt.student_id == user.id
            )
        )
        or 0
    )


def _student_assessment(
    db: Session, user: User, a: Assessment, v: AssessmentVersion
) -> StudentAssessment:
    c = AssessmentContent.model_validate(v.snapshot["content"])
    return StudentAssessment(
        **_summary_fields(a, c),
        attempts_used=_attempts_used(db, a, user),
        questions=[
            StudentQuestion(
                key=str(q.key),
                question_type=q.question_type,
                question_text=q.question_text,
                points=q.points,
                options=[StudentOption(key=str(o.key), text=o.text) for o in q.options],
            )
            for q in c.questions
        ],
    )


def get_assessment(
    db: Session, user: User, assessment_id: uuid.UUID
) -> TeacherAssessment | StudentAssessment:
    a = db.get(Assessment, assessment_id)
    if a is None:
        raise NotFoundError()
    _, access = chapter_access(db, user, a.chapter_id)
    if access.can_manage:
        return teacher_view(a)
    return _student_assessment(db, user, a, _student_access(db, user, a))


def start_attempt(
    db: Session, user: User, assessment_id: uuid.UUID
) -> tuple[AssessmentAttempt, StudentAssessment]:
    a = db.get(Assessment, assessment_id)
    if a is None:
        raise NotFoundError()
    v = _student_access(db, user, a)
    open_attempt = db.scalar(
        select(AssessmentAttempt).where(
            AssessmentAttempt.assessment_id == a.id,
            AssessmentAttempt.student_id == user.id,
            AssessmentAttempt.status == "in_progress",
        )
    )
    if open_attempt is not None:  # resume instead of burning an attempt
        return open_attempt, _student_assessment(db, user, a, v)
    used = _attempts_used(db, a, user)
    if used >= a.max_attempts:
        raise AttemptLimitError()
    content = AssessmentContent.model_validate(v.snapshot["content"])
    attempt = AssessmentAttempt(
        assessment_id=a.id,
        assessment_version_id=v.id,
        student_id=user.id,
        attempt_number=used + 1,
        max_score=content.max_score,
    )
    db.add(attempt)
    db.commit()
    return attempt, _student_assessment(db, user, a, v)


def _own_attempt(db: Session, user: User, attempt_id: uuid.UUID) -> AssessmentAttempt:
    attempt = db.get(AssessmentAttempt, attempt_id)
    if attempt is None or attempt.student_id != user.id:
        raise NotFoundError()
    return attempt


def _version_content(
    db: Session, attempt: AssessmentAttempt
) -> tuple[AssessmentVersion, AssessmentContent]:
    v = db.get(AssessmentVersion, attempt.assessment_version_id)
    assert v is not None
    return v, AssessmentContent.model_validate(v.snapshot["content"])


def submit(
    db: Session, user: User, attempt_id: uuid.UUID, answers: list[AnswerIn]
) -> AssessmentAttempt:
    """Grade MCQ immediately; queue AI evaluation for short answers (advisory)."""
    attempt = _own_attempt(db, user, attempt_id)
    if attempt.status != "in_progress":
        raise ConflictError("This attempt has already been submitted.")
    _, content = _version_content(db, attempt)
    by_key = {a.question_key: a for a in answers}
    unknown = set(by_key) - {str(q.key) for q in content.questions}
    if unknown:
        raise ConflictError(f"Unknown question keys: {sorted(unknown)}")
    auto_total = 0.0
    needs_ai = False
    for q in content.questions:
        given = by_key.get(str(q.key))
        ans = StudentAnswer(
            attempt_id=attempt.id,
            question_key=str(q.key),
            question_type=q.question_type,
            max_points=q.points,
        )
        if q.question_type == "mcq":
            selected = given.selected_option_key if given else None
            correct = next(o.key for o in q.options if o.is_correct)
            ans.selected_option_key = selected
            ans.is_correct = selected == correct
            ans.auto_score = q.points if ans.is_correct else 0.0
            auto_total += ans.auto_score
            db.add(ans)
        else:
            text = (given.answer_text or "").strip() if given else ""
            ans.answer_text = text or None
            db.add(ans)
            db.flush()
            if text:
                needs_ai = True
                db.add(
                    EvaluationResult(
                        student_answer_id=ans.id, rubric_version=attempt_version(db, attempt)
                    )
                )
            else:  # blank answers score 0 without AI or review
                ans.auto_score = 0.0
    now = datetime.now(UTC)
    attempt.submitted_at = now
    attempt.provisional_score = auto_total
    attempt.status = "submitted"
    if not needs_ai:
        attempt.status, attempt.score, attempt.graded_at = "graded", auto_total, now
    db.commit()
    if needs_ai:
        from app.modules.ai_engine.assessment_ai import queue_evaluation

        queue_evaluation(db, attempt)
    return attempt


def attempt_version(db: Session, attempt: AssessmentAttempt) -> int:
    v = db.get(AssessmentVersion, attempt.assessment_version_id)
    assert v is not None
    return v.version_number


def recompute(db: Session, attempt: AssessmentAttempt) -> None:
    """Provisional = auto + AI suggestions; final only when every short answer is reviewed."""
    answers = list(db.scalars(select(StudentAnswer).where(StudentAnswer.attempt_id == attempt.id)))
    evals = {
        e.student_answer_id: e
        for e in db.scalars(
            select(EvaluationResult).where(
                EvaluationResult.student_answer_id.in_([a.id for a in answers])
            )
        )
    }
    provisional = final = 0.0
    complete = True
    for a in answers:
        e = evals.get(a.id)
        if e is None:
            provisional += a.auto_score or 0
            final += a.auto_score or 0
            continue
        provisional += e.final_score if e.final_score is not None else (e.suggested_score or 0)
        if e.final_score is None:
            complete = False
        else:
            final += e.final_score
    attempt.provisional_score = provisional
    if complete and attempt.status != "graded":
        attempt.status, attempt.score, attempt.graded_at = "graded", final, datetime.now(UTC)
    elif complete:
        attempt.score = final


def result(
    db: Session, user: User, attempt_id: uuid.UUID, *, as_teacher: bool = False
) -> AttemptResult:
    attempt = db.get(AssessmentAttempt, attempt_id)
    if attempt is None:
        raise NotFoundError()
    a = db.get(Assessment, attempt.assessment_id)
    assert a is not None
    if as_teacher:
        get_chapter_for(db, user, a.chapter_id, manage=True)
    elif attempt.student_id != user.id:
        raise NotFoundError()
    v, content = _version_content(db, attempt)
    answers = {
        s.question_key: s
        for s in db.scalars(select(StudentAnswer).where(StudentAnswer.attempt_id == attempt.id))
    }
    evals = {
        e.student_answer_id: e
        for e in db.scalars(
            select(EvaluationResult).where(
                EvaluationResult.student_answer_id.in_([s.id for s in answers.values()])
            )
        )
    }
    submitted = attempt.status != "in_progress"
    rows: list[AnswerResult] = []
    for q in content.questions:
        s = answers.get(str(q.key))
        if s is None:
            continue
        e = evals.get(s.id)
        rows.append(
            AnswerResult(
                answer_id=s.id,
                question_key=s.question_key,
                question_type=q.question_type,
                question_text=q.question_text,
                points=q.points,
                selected_option_key=s.selected_option_key,
                answer_text=s.answer_text,
                correct_option_key=next((o.key for o in q.options if o.is_correct), None)
                if submitted
                else None,
                is_correct=s.is_correct,
                auto_score=s.auto_score,
                explanation=(q.explanation_correct if s.is_correct else q.explanation_general)
                or None,
                ai_feedback=e.feedback if e else None,
                ai_suggested_score=e.suggested_score if e else None,
                missing_concepts=e.missing_concepts if e else [],
                final_score=(e.final_score if e else s.auto_score),
                teacher_feedback=e.teacher_feedback if e else None,
                evaluation_status=e.status if e else None,
                explain_further=s.explain_further,
                lesson_id=q.lesson_id,
            )
        )
    passed = None
    if attempt.score is not None and attempt.max_score:
        passed = attempt.score / attempt.max_score * 100 >= float(v.snapshot["passing_score"])
    return AttemptResult(
        attempt_id=attempt.id,
        assessment_id=a.id,
        assessment_title=str(v.snapshot["title"]),
        attempt_number=attempt.attempt_number,
        status=attempt.status,
        submitted_at=attempt.submitted_at,
        score=attempt.score,
        provisional_score=attempt.provisional_score,
        max_score=attempt.max_score,
        passing_score=float(v.snapshot["passing_score"]),
        passed=passed,
        answers=rows,
    )


def my_attempts(db: Session, user: User, assessment_id: uuid.UUID) -> list[AttemptRow]:
    a = db.get(Assessment, assessment_id)
    if a is None:
        raise NotFoundError()
    chapter_access(db, user, a.chapter_id)  # 404 unless the caller may see this chapter
    rows = db.scalars(
        select(AssessmentAttempt)
        .where(
            AssessmentAttempt.assessment_id == assessment_id,
            AssessmentAttempt.student_id == user.id,
        )
        .order_by(AssessmentAttempt.attempt_number)
    )
    return [_row(db, r, user.display_name) for r in rows]


def _row(db: Session, r: AssessmentAttempt, name: str) -> AttemptRow:
    pending = (
        db.scalar(
            select(func.count(EvaluationResult.id))
            .join(StudentAnswer, StudentAnswer.id == EvaluationResult.student_answer_id)
            .where(StudentAnswer.attempt_id == r.id, EvaluationResult.final_score.is_(None))
        )
        or 0
    )
    return AttemptRow(
        attempt_id=r.id,
        student_id=r.student_id,
        student_name=name,
        attempt_number=r.attempt_number,
        status=r.status,
        score=r.score,
        provisional_score=r.provisional_score,
        max_score=r.max_score,
        submitted_at=r.submitted_at,
        pending_reviews=pending,
    )


def list_attempts(db: Session, user: User, assessment_id: uuid.UUID) -> list[AttemptRow]:
    a, _ = _manage(db, user, assessment_id)
    rows = db.execute(
        select(AssessmentAttempt, User.display_name)
        .join(User, User.id == AssessmentAttempt.student_id)
        .where(AssessmentAttempt.assessment_id == a.id, AssessmentAttempt.status != "in_progress")
        .order_by(AssessmentAttempt.submitted_at.desc())
    ).all()
    return [_row(db, r, name) for r, name in rows]


# --------------------------------------------------------------------- review


def review_queue(db: Session, user: User, assessment_id: uuid.UUID) -> list[ReviewItem]:
    a, _ = _manage(db, user, assessment_id)
    rows = db.execute(
        select(EvaluationResult, StudentAnswer, AssessmentAttempt, User.display_name)
        .join(StudentAnswer, StudentAnswer.id == EvaluationResult.student_answer_id)
        .join(AssessmentAttempt, AssessmentAttempt.id == StudentAnswer.attempt_id)
        .join(User, User.id == AssessmentAttempt.student_id)
        .where(AssessmentAttempt.assessment_id == a.id, EvaluationResult.final_score.is_(None))
        .order_by(AssessmentAttempt.submitted_at)
    ).all()
    items = []
    for e, s, attempt, name in rows:
        _, content = _version_content(db, attempt)
        q = next(x for x in content.questions if x.key == s.question_key)
        items.append(
            ReviewItem(
                evaluation_id=e.id,
                attempt_id=attempt.id,
                student_name=name,
                question_key=s.question_key,
                question_text=q.question_text,
                rubric=[c.model_dump() for c in q.rubric],
                model_answer=q.model_answer,
                answer_text=s.answer_text,
                points=q.points,
                suggested_score=e.suggested_score,
                feedback=e.feedback,
                missing_concepts=e.missing_concepts,
                confidence=e.confidence,
                status=e.status,
            )
        )
    return items


def review(
    db: Session,
    user: User,
    evaluation_id: uuid.UUID,
    final_score: float,
    teacher_feedback: str | None,
) -> EvaluationResult:
    e = db.get(EvaluationResult, evaluation_id)
    if e is None:
        raise NotFoundError()
    s = db.get(StudentAnswer, e.student_answer_id)
    assert s is not None
    attempt = db.get(AssessmentAttempt, s.attempt_id)
    assert attempt is not None
    a = db.get(Assessment, attempt.assessment_id)
    assert a is not None
    get_chapter_for(db, user, a.chapter_id, manage=True)
    if final_score > s.max_points:
        raise ConflictError(f"The score cannot exceed {s.max_points:g} points.")
    e.final_score = final_score
    e.teacher_feedback = teacher_feedback
    e.status = "accepted" if e.suggested_score == final_score else "overridden"
    e.reviewed_by, e.reviewed_at = user.id, datetime.now(UTC)
    recompute(db, attempt)
    audit.record(
        db,
        action=f"evaluation.{e.status}",
        resource_type="evaluation_result",
        resource_id=e.id,
        actor_user_id=user.id,
        metadata={"suggested": e.suggested_score, "final": final_score},
    )
    db.commit()
    return e


def question_for_answer(
    db: Session, s: StudentAnswer
) -> tuple[QuestionIn, AssessmentAttempt, Assessment]:
    attempt = db.get(AssessmentAttempt, s.attempt_id)
    assert attempt is not None
    _, content = _version_content(db, attempt)
    a = db.get(Assessment, attempt.assessment_id)
    assert a is not None
    return next(q for q in content.questions if q.key == s.question_key), attempt, a


def course_of(db: Session, a: Assessment) -> uuid.UUID:
    chapter = db.get(Chapter, a.chapter_id)
    assert chapter is not None
    return chapter.course_id


def manage_chapter(db: Session, user: User, chapter_id: uuid.UUID) -> Chapter:
    chapter = get_chapter_for(db, user, chapter_id, manage=True)
    get_course_for(db, user, chapter.course_id, manage=True)
    return chapter
