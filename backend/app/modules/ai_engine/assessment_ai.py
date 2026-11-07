"""AI for assessments: generation, ADVISORY answer evaluation, Explain Further (design §6.2)."""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import AppError, ConflictError, NotFoundError
from app.integrations.interfaces import ReferencePassage
from app.modules.ai_engine import retrieval
from app.modules.ai_engine.prompts import (
    ANSWER_EVALUATION,
    ASSESSMENT_GENERATION,
    EXPLAIN_FURTHER,
)
from app.modules.ai_engine.schemas import AssessmentLLM, EvaluationLLM, ExplainLLM
from app.modules.ai_engine.validation import OutputRejectedError
from app.modules.assessments.content import AssessmentContent, QuestionIn
from app.modules.assessments.models import (
    Assessment,
    AssessmentAttempt,
    EvaluationResult,
    StudentAnswer,
)
from app.modules.assessments.service import (
    course_of,
    create_assessment,
    question_for_answer,
    recompute,
)
from app.modules.chapters.models import Chapter, LearningObjective
from app.modules.lessons.content import LessonContent
from app.modules.lessons.models import Lesson, LessonVersion
from app.modules.operations import audit
from app.modules.operations.jobs import JobType
from app.modules.operations.models import Job
from app.modules.operations.runner import PermanentJobError, create_job, dispatch, handler
from app.modules.users.models import User

MAX_EXPLAIN_PER_STUDENT_PER_DAY = 20


def _objectives(db: Session, chapter_id: uuid.UUID) -> list[LearningObjective]:
    return list(
        db.scalars(
            select(LearningObjective)
            .where(LearningObjective.chapter_id == chapter_id)
            .order_by(LearningObjective.position)
        )
    )


# ------------------------------------------------------------- generation


def convert_assessment(
    plan: AssessmentLLM, objectives: list[LearningObjective]
) -> AssessmentContent:
    questions: list[QuestionIn] = []
    for q in plan.questions[:20]:
        obj = objectives[q.objective_index].id if 0 <= q.objective_index < len(objectives) else None
        points = max(0.5, min(100.0, round(q.points * 2) / 2))
        data: dict[str, Any] = {
            "question_type": q.question_type,
            "question_text": q.question_text.strip()[:2000],
            "difficulty": q.difficulty,
            "explanation_correct": q.explanation_correct[:2000],
            "explanation_general": q.explanation_general[:2000],
            "learning_objective_id": obj,
        }
        if q.question_type == "mcq":
            data["points"] = 1
            data["options"] = [
                {"text": o.text.strip()[:500], "is_correct": o.is_correct}
                for o in q.options[:6]
                if o.text.strip()
            ]
        else:
            crit = [c for c in q.rubric[:10] if c.description.strip() and c.points > 0]
            total = sum(c.points for c in crit)
            if not crit or total <= 0:
                continue
            # Normalise rubric points to the question's points (keeps the contract invariant).
            scaled = [round(c.points / total * points, 2) for c in crit]
            scaled[-1] = round(points - sum(scaled[:-1]), 2)
            data["points"] = points
            data["rubric"] = [
                {"description": c.description.strip()[:500], "points": p}
                for c, p in zip(crit, scaled, strict=True)
                if p > 0
            ]
            data["model_answer"] = q.model_answer[:2000]
            if abs(sum(r["points"] for r in data["rubric"]) - points) > 1e-6:
                continue
        try:
            questions.append(QuestionIn.model_validate(data))
        except ValueError:
            continue
    if not questions:
        raise OutputRejectedError("EMPTY_OUTPUT", "No valid questions were generated.")
    return AssessmentContent(questions=questions).with_keys()


@handler(JobType.ASSESSMENT_GENERATION)
def generate_assessment(db: Session, job: Job) -> dict[str, Any]:
    from app.modules.ai_engine.workflows import _call, _chapter_task, _record, _rejected

    chapter = db.get(Chapter, job.target_id)
    if chapter is None:
        raise PermanentJobError("CHAPTER_MISSING", "The chapter no longer exists.")
    objectives = _objectives(db, chapter.id)
    found = retrieval.for_chapter(db, chapter)
    task = (
        _chapter_task(db, chapter)
        + "\nObjective numbers: "
        + ", ".join(f"{i}={o.objective_text[:80]}" for i, o in enumerate(objectives))
    )
    plan, usage = _call(db, job, ASSESSMENT_GENERATION, task, found.passages, AssessmentLLM)
    try:
        content = convert_assessment(plan, objectives)
    except OutputRejectedError as exc:
        raise _rejected(exc) from exc
    a = create_assessment(
        db,
        None,
        chapter,
        (plan.title.strip() or f"{chapter.title} quiz")[:200],
        60.0,
        3,
        content,
        origin="ai",
    )
    _record(
        db,
        job,
        usage,
        ASSESSMENT_GENERATION,
        kind="assessment",
        target_type="assessment",
        target_id=a.id,
        output=content.model_dump(mode="json"),
        validation={},
        status="applied",
    )
    db.commit()
    return {"assessment_id": str(a.id), "questions": len(content.questions)}


# ------------------------------------------------------------- evaluation


def queue_evaluation(db: Session, attempt: AssessmentAttempt) -> Job:
    a = db.get(Assessment, attempt.assessment_id)
    assert a is not None
    job = create_job(
        db,
        job_type=JobType.ANSWER_EVALUATION,
        target_type="assessment_attempt",
        target_id=attempt.id,
        requested_by=attempt.student_id,
        course_id=course_of(db, a),
    )
    db.commit()
    dispatch(job.id)
    return job


def _answer_passage(text: str) -> ReferencePassage:
    return ReferencePassage("student_answer", 1, 1, text)


@handler(JobType.ANSWER_EVALUATION)
def evaluate_attempt(db: Session, job: Job) -> dict[str, Any]:
    """Only the question, rubric and answer text are sent — no student identity (design §6.4)."""
    from app.modules.ai_engine.workflows import _call, _record

    attempt = db.get(AssessmentAttempt, job.target_id)
    if attempt is None:
        raise PermanentJobError("ATTEMPT_MISSING", "The attempt no longer exists.")
    pending = db.execute(
        select(EvaluationResult, StudentAnswer)
        .join(StudentAnswer, StudentAnswer.id == EvaluationResult.student_answer_id)
        .where(StudentAnswer.attempt_id == attempt.id, EvaluationResult.status == "pending_ai")
    ).all()
    done = 0
    for e, s in pending:
        q, _, _ = question_for_answer(db, s)
        rubric = "\n".join(f"- ({c.points:g} pt) {c.description}" for c in q.rubric)
        task = (
            f"Question ({q.points:g} points): {q.question_text}\nRubric:\n{rubric}\n"
            f"Model answer: {q.model_answer}\nEvaluate the student answer in the excerpt."
        )
        try:
            out, usage = _call(
                db,
                job,
                ANSWER_EVALUATION,
                task,
                [_answer_passage(s.answer_text or "")],
                EvaluationLLM,
            )
        except PermanentJobError:
            e.status = "pending_review"  # teacher grades without a suggestion
            e.feedback = None
            continue
        e.suggested_score = round(max(0.0, min(q.points, out.score)) * 2) / 2
        e.feedback = out.feedback.strip()[:2000] or None
        e.missing_concepts = [m.strip()[:200] for m in out.missing_concepts if m.strip()][:10]
        e.confidence = max(0.0, min(1.0, out.confidence))
        e.status = "pending_review"
        _record(
            db,
            job,
            usage,
            ANSWER_EVALUATION,
            kind="evaluation",
            target_type="student_answer",
            target_id=s.id,
            output=out.model_dump(),
            validation={},
            status="proposed",
        )
        done += 1
    recompute(db, attempt)
    db.commit()
    return {"evaluated": done}


# --------------------------------------------------------- explain further


class ExplainBudgetError(AppError):
    status_code = 429
    code = "EXPLAIN_LIMIT_REACHED"
    message = "You have reached today's limit for extra explanations."


def start_explain_further(db: Session, user: User, answer_id: uuid.UUID) -> Job:
    s = db.get(StudentAnswer, answer_id)
    if s is None:
        raise NotFoundError()
    attempt = db.get(AssessmentAttempt, s.attempt_id)
    if attempt is None or attempt.student_id != user.id:
        raise NotFoundError()
    if attempt.status == "in_progress":
        raise ConflictError("Submit the attempt first.")
    if s.is_correct:
        raise ConflictError("This answer is already correct.")
    since = datetime.now(UTC) - timedelta(days=1)
    used = (
        db.scalar(
            select(func.count(Job.id)).where(
                Job.requested_by == user.id,
                Job.job_type == JobType.EXPLAIN_FURTHER,
                Job.created_at >= since,
            )
        )
        or 0
    )
    if used >= MAX_EXPLAIN_PER_STUDENT_PER_DAY:
        raise ExplainBudgetError()
    _, _, a = question_for_answer(db, s)
    job = create_job(
        db,
        job_type=JobType.EXPLAIN_FURTHER,
        target_type="student_answer",
        target_id=s.id,
        requested_by=user.id,
        course_id=course_of(db, a),
    )
    db.commit()
    dispatch(job.id)
    db.refresh(job)
    return job


def _published_lessons(
    db: Session, chapter_id: uuid.UUID, preferred: uuid.UUID | None
) -> list[tuple[Lesson, LessonContent]]:
    lessons = list(
        db.scalars(
            select(Lesson)
            .where(Lesson.chapter_id == chapter_id, Lesson.published_version.is_not(None))
            .order_by(Lesson.position)
        )
    )
    if preferred:
        lessons.sort(key=lambda lesson: lesson.id != preferred)
    out = []
    for lesson in lessons:
        snap = db.scalar(
            select(LessonVersion).where(
                LessonVersion.lesson_id == lesson.id,
                LessonVersion.version_number == lesson.published_version,
            )
        )
        if snap:
            out.append((lesson, LessonContent.model_validate(snap.content_snapshot)))
    return out


@handler(JobType.EXPLAIN_FURTHER)
def explain_further(db: Session, job: Job) -> dict[str, Any]:
    from app.modules.ai_engine.workflows import _call, _record

    s = db.get(StudentAnswer, job.target_id)
    if s is None:
        raise PermanentJobError("ANSWER_MISSING", "The answer no longer exists.")
    q, _, a = question_for_answer(db, s)
    lessons = _published_lessons(db, a.chapter_id, q.lesson_id)
    passages: list[ReferencePassage] = []
    for lesson, content in lessons[:3]:
        for i, sec in enumerate(content.sections, start=1):
            passages.append(
                ReferencePassage(f"lesson:{lesson.id}", i, i, f"{sec.title}\n\n{sec.body_markdown}")
            )
    if not passages:
        raise PermanentJobError("NO_SOURCES", "There is no published lesson to explain from.")
    correct = next((o.text for o in q.options if o.is_correct), q.model_answer)
    given = (
        next((o.text for o in q.options if o.key == s.selected_option_key), None)
        if s.question_type == "mcq"
        else s.answer_text
    ) or "(no answer)"
    task = (
        f"Question: {q.question_text}\nCorrect answer: {correct}\n"
        f"Student's answer (untrusted): {given[:1000]}"
    )
    out, usage = _call(db, job, EXPLAIN_FURTHER, task, passages, ExplainLLM)
    explanation = out.explanation.strip()[:3000]
    if not explanation:
        raise PermanentJobError("EMPTY_OUTPUT", "No explanation was generated.")
    revision = None
    wanted = out.revision_section_title.strip().lower()
    for lesson, content in lessons:
        for i, sec in enumerate(content.sections):
            if sec.title.strip().lower() == wanted:
                revision = {
                    "lesson_id": str(lesson.id),
                    "lesson_title": lesson.title,
                    "section_index": i,
                    "section_title": sec.title,
                }
                break
        if revision:
            break
    if revision is None and lessons:
        lesson, _ = lessons[0]
        revision = {
            "lesson_id": str(lesson.id),
            "lesson_title": lesson.title,
            "section_index": None,
            "section_title": None,
        }
    s.explain_further = {
        "explanation": explanation,
        "revision": revision,
        "generated_at": datetime.now(UTC).isoformat(),
    }
    _record(
        db,
        job,
        usage,
        EXPLAIN_FURTHER,
        kind="explain_further",
        target_type="student_answer",
        target_id=s.id,
        output=s.explain_further,
        validation={},
        status="applied",
    )
    audit.record(
        db,
        action="ai.explain_further",
        resource_type="student_answer",
        resource_id=s.id,
        actor_user_id=job.requested_by,
    )
    db.commit()
    return s.explain_further


def start_generation(db: Session, user: User, chapter_id: uuid.UUID) -> Job:
    from app.modules.ai_engine.service import _start
    from app.modules.assessments.service import manage_chapter
    from app.modules.courses.models import Course

    chapter = manage_chapter(db, user, chapter_id)
    course = db.get(Course, chapter.course_id)
    assert course is not None
    return _start(db, user, course, JobType.ASSESSMENT_GENERATION, "chapter", chapter.id)
