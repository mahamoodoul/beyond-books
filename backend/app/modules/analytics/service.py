"""Teacher analytics and knowledge-gap detection (design §15 Phase 9).

Everything is derived from stored evidence (progress, answers, teacher-final evaluations).
AI suggestions that a teacher has not reviewed are NOT used for mastery.
Class-level distributions (common wrong answers, missing concepts) are suppressed below
MIN_GROUP_SIZE students to avoid singling out individuals in aggregate views.
"""

import uuid
from collections import Counter, defaultdict
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import NotFoundError
from app.modules.analytics.models import LearningGapRecord
from app.modules.analytics.schemas import (
    AssessmentStat,
    ConceptCount,
    CourseAnalytics,
    Insight,
    LessonStat,
    ObjectiveMastery,
    ObjectiveStat,
    OptionCount,
    QuestionStat,
    Recommendation,
    StudentAttention,
    StudentInsights,
)
from app.modules.assessments.content import AssessmentContent, QuestionIn
from app.modules.assessments.models import (
    Assessment,
    AssessmentAttempt,
    AssessmentVersion,
    EvaluationResult,
    StudentAnswer,
)
from app.modules.chapters.models import Chapter, LearningObjective, PublishStatus
from app.modules.courses.access import get_course_for, resolve_course_access
from app.modules.courses.models import CourseEnrollment
from app.modules.lessons.models import Lesson
from app.modules.progress.models import LessonProgress
from app.modules.users.models import User

MIN_GROUP_SIZE = 3
GAP_BELOW = 0.5
MASTERED_AT = 0.8


def status_for(mastery: float) -> str:
    return "gap" if mastery < GAP_BELOW else "mastered" if mastery >= MASTERED_AT else "developing"


@dataclass
class Evidence:
    """One scored answer: earned/possible points, linked objective/lesson, raw answer details."""

    student_id: uuid.UUID
    assessment_id: uuid.UUID
    question: QuestionIn
    earned: float | None  # None → not final (awaiting teacher review)
    possible: float
    selected_option_key: str | None
    missing_concepts: list[str] = field(default_factory=list)


def _students(db: Session, course_id: uuid.UUID) -> list[User]:
    return list(
        db.scalars(
            select(User)
            .join(CourseEnrollment, CourseEnrollment.student_id == User.id)
            .where(CourseEnrollment.course_id == course_id, CourseEnrollment.status == "active")
            .order_by(User.display_name)
        )
    )


def _course_assessments(db: Session, course_id: uuid.UUID) -> list[tuple[Assessment, Chapter]]:
    return [
        (a, c)
        for a, c in db.execute(
            select(Assessment, Chapter)
            .join(Chapter, Chapter.id == Assessment.chapter_id)
            .where(Chapter.course_id == course_id)
            .order_by(Chapter.position, Assessment.created_at)
        ).all()
    ]


def _latest_attempts(db: Session, assessment_ids: list[uuid.UUID]) -> list[AssessmentAttempt]:
    """Latest submitted attempt per (student, assessment)."""
    if not assessment_ids:
        return []
    rows = db.scalars(
        select(AssessmentAttempt)
        .where(
            AssessmentAttempt.assessment_id.in_(assessment_ids),
            AssessmentAttempt.status != "in_progress",
        )
        .order_by(AssessmentAttempt.attempt_number)
    )
    latest: dict[tuple[uuid.UUID, uuid.UUID], AssessmentAttempt] = {}
    for r in rows:
        latest[(r.student_id, r.assessment_id)] = r
    return list(latest.values())


def _evidence(db: Session, attempts: list[AssessmentAttempt]) -> list[Evidence]:
    if not attempts:
        return []
    versions = {
        v.id: AssessmentContent.model_validate(v.snapshot["content"])
        for v in db.scalars(
            select(AssessmentVersion).where(
                AssessmentVersion.id.in_({a.assessment_version_id for a in attempts})
            )
        )
    }
    by_attempt = {a.id: a for a in attempts}
    answers = list(
        db.scalars(select(StudentAnswer).where(StudentAnswer.attempt_id.in_(by_attempt)))
    )
    evals = {
        e.student_answer_id: e
        for e in db.scalars(
            select(EvaluationResult).where(
                EvaluationResult.student_answer_id.in_([s.id for s in answers])
            )
        )
    }
    out = []
    for s in answers:
        attempt = by_attempt[s.attempt_id]
        q = next(
            (
                q
                for q in versions[attempt.assessment_version_id].questions
                if q.key == s.question_key
            ),
            None,
        )
        if q is None:
            continue
        e = evals.get(s.id)
        earned = e.final_score if e else s.auto_score
        out.append(
            Evidence(
                attempt.student_id,
                attempt.assessment_id,
                q,
                earned,
                q.points,
                s.selected_option_key,
                list(e.missing_concepts) if e else [],
            )
        )
    return out


def _mastery(evidence: list[Evidence]) -> dict[tuple[uuid.UUID, uuid.UUID], tuple[float, int]]:
    """(student, objective) → (mastery, evidence count), final scores only."""
    earned: dict[tuple[uuid.UUID, uuid.UUID], float] = defaultdict(float)
    possible: dict[tuple[uuid.UUID, uuid.UUID], float] = defaultdict(float)
    count: Counter[tuple[uuid.UUID, uuid.UUID]] = Counter()
    for ev in evidence:
        if ev.question.learning_objective_id is None or ev.earned is None:
            continue
        key = (ev.student_id, ev.question.learning_objective_id)
        earned[key] += ev.earned
        possible[key] += ev.possible
        count[key] += 1
    return {k: (earned[k] / possible[k], count[k]) for k in possible if possible[k] > 0}


def refresh_gaps(
    db: Session, course_id: uuid.UUID, mastery: dict[tuple[uuid.UUID, uuid.UUID], tuple[float, int]]
) -> None:
    existing = {
        (r.user_id, r.learning_objective_id): r
        for r in db.scalars(
            select(LearningGapRecord).where(LearningGapRecord.course_id == course_id)
        )
    }
    for (sid, oid), (m, n) in mastery.items():
        rec = existing.pop((sid, oid), None)
        if rec is None:
            rec = LearningGapRecord(
                user_id=sid,
                course_id=course_id,
                learning_objective_id=oid,
                mastery=m,
                evidence_count=n,
                status=status_for(m),
            )
            db.add(rec)
        else:
            rec.mastery, rec.evidence_count, rec.status = m, n, status_for(m)
    for rec in existing.values():  # evidence disappeared (e.g. attempt deleted)
        db.delete(rec)
    db.commit()


def _rate(a: float, b: float) -> float | None:
    return round(a / b, 4) if b else None


def course_analytics(db: Session, user: User, course_id: uuid.UUID) -> CourseAnalytics:
    course = get_course_for(db, user, course_id, manage=True)
    students = _students(db, course.id)
    sids = {s.id for s in students}
    n = len(students)
    suppressed = n < MIN_GROUP_SIZE

    lessons = db.execute(
        select(Lesson, Chapter)
        .join(Chapter, Chapter.id == Lesson.chapter_id)
        .where(
            Chapter.course_id == course.id,
            Chapter.status == PublishStatus.PUBLISHED,
            Lesson.published_version.is_not(None),
        )
        .order_by(Chapter.position, Lesson.position)
    ).all()
    done = Counter(
        p.lesson_id
        for p in db.scalars(
            select(LessonProgress).where(
                LessonProgress.course_id == course.id,
                LessonProgress.status == "completed",
                LessonProgress.user_id.in_(sids),
            )
        )
    )
    per_student_done = Counter(
        p.user_id
        for p in db.scalars(
            select(LessonProgress).where(
                LessonProgress.course_id == course.id,
                LessonProgress.status == "completed",
                LessonProgress.user_id.in_(sids),
                LessonProgress.lesson_id.in_([lesson.id for lesson, _ in lessons]),
            )
        )
    )
    lesson_stats = [
        LessonStat(
            lesson_id=lesson.id,
            title=lesson.title,
            chapter_title=ch.title,
            completed=done[lesson.id],
            completion_rate=_rate(done[lesson.id], n),
        )
        for lesson, ch in lessons
    ]
    total_lessons = len(lessons)
    avg_completion = (
        _rate(sum(per_student_done.values()), n * total_lessons) if total_lessons else None
    )

    pairs = _course_assessments(db, course.id)
    attempts = [a for a in _latest_attempts(db, [a.id for a, _ in pairs]) if a.student_id in sids]
    evidence = _evidence(db, attempts)

    a_stats: list[AssessmentStat] = []
    for a, _ in pairs:
        mine = [x for x in attempts if x.assessment_id == a.id]
        graded = [x for x in mine if x.score is not None and x.max_score]
        pending = sum(1 for ev in evidence if ev.assessment_id == a.id and ev.earned is None)
        latest_v = db.scalar(
            select(AssessmentVersion)
            .where(AssessmentVersion.assessment_id == a.id)
            .order_by(AssessmentVersion.version_number.desc())
        )
        texts: dict[str, QuestionIn] = {}
        if latest_v:
            texts = {
                str(q.key): q
                for q in AssessmentContent.model_validate(latest_v.snapshot["content"]).questions
            }
        by_q: dict[str, list[Evidence]] = defaultdict(list)
        for ev in evidence:
            if ev.assessment_id == a.id:
                by_q[str(ev.question.key)].append(ev)
        q_stats = []
        for key, evs in by_q.items():
            q = texts.get(key, evs[0].question)
            final = [e for e in evs if e.earned is not None]
            wrong = Counter(
                e.selected_option_key
                for e in evs
                if q.question_type == "mcq" and e.earned == 0 and e.selected_option_key
            )
            labels = {o.key: o.text for o in q.options}
            q_stats.append(
                QuestionStat(
                    question_key=key,
                    question_text=q.question_text,
                    question_type=q.question_type,
                    responses=len(evs),
                    avg_score_rate=_rate(
                        sum(e.earned or 0 for e in final), sum(e.possible for e in final)
                    ),
                    common_wrong=[]
                    if suppressed
                    else [
                        OptionCount(option_key=k, text=labels.get(k, k), count=c)
                        for k, c in wrong.most_common(3)
                    ],
                    suppressed=suppressed,
                )
            )
        q_stats.sort(key=lambda s: (s.avg_score_rate is None, s.avg_score_rate or 0))
        passing = [
            x
            for x in graded
            if latest_v and x.score is not None and x.score / x.max_score * 100 >= a.passing_score
        ]
        a_stats.append(
            AssessmentStat(
                assessment_id=a.id,
                title=a.title,
                students_attempted=len({x.student_id for x in mine}),
                graded_attempts=len(graded),
                avg_score_rate=_rate(
                    sum(x.score or 0 for x in graded), sum(x.max_score for x in graded)
                ),
                pass_rate=_rate(len(passing), len(graded)),
                pending_reviews=pending,
                questions=q_stats,
            )
        )

    mastery = _mastery(evidence)
    refresh_gaps(db, course.id, mastery)
    objectives = db.execute(
        select(LearningObjective, Chapter)
        .join(Chapter, Chapter.id == LearningObjective.chapter_id)
        .where(Chapter.course_id == course.id)
        .order_by(Chapter.position, LearningObjective.position)
    ).all()
    o_stats = []
    for o, ch in objectives:
        vals = [m for (sid, oid), (m, _) in mastery.items() if oid == o.id]
        states = Counter(status_for(m) for m in vals)
        o_stats.append(
            ObjectiveStat(
                objective_id=o.id,
                text=o.objective_text,
                chapter_title=ch.title,
                students_with_evidence=len(vals),
                avg_mastery=round(sum(vals) / len(vals), 4) if vals else None,
                gaps=states["gap"],
                developing=states["developing"],
                mastered=states["mastered"],
            )
        )

    concepts = Counter(
        c.lower() for ev in evidence if ev.earned is not None for c in ev.missing_concepts
    )
    missing = (
        []
        if suppressed
        else [ConceptCount(concept=c, count=k) for c, k in concepts.most_common(10)]
    )

    gap_by_student = Counter(sid for (sid, _), (m, _) in mastery.items() if status_for(m) == "gap")
    attempted = {(x.student_id, x.assessment_id) for x in attempts}
    published = [a for a, _ in pairs if a.published_version is not None]
    attention = []
    for s in students:
        reasons = []
        if total_lessons and per_student_done[s.id] == 0:
            reasons.append("has not completed any lesson")
        missing_quizzes = [a.title for a in published if (s.id, a.id) not in attempted]
        if missing_quizzes:
            reasons.append(f"has not attempted: {', '.join(missing_quizzes[:3])}")
        if gap_by_student[s.id]:
            reasons.append(f"knowledge gap in {gap_by_student[s.id]} objective(s)")
        if reasons:
            attention.append(
                StudentAttention(
                    student_id=s.id,
                    display_name=s.display_name,
                    completed_lessons=per_student_done[s.id],
                    gap_objectives=gap_by_student[s.id],
                    reasons=reasons,
                )
            )

    graded_all = [x for x in attempts if x.score is not None and x.max_score]
    avg_score = _rate(sum(x.score or 0 for x in graded_all), sum(x.max_score for x in graded_all))
    return CourseAnalytics(
        course_id=course.id,
        enrolled=n,
        min_group_size=MIN_GROUP_SIZE,
        suppressed=suppressed,
        total_lessons=total_lessons,
        avg_completion_rate=avg_completion,
        avg_score_rate=avg_score,
        lessons=lesson_stats,
        assessments=a_stats,
        objectives=o_stats,
        missing_concepts=missing,
        attention=attention,
        insights=_insights(n, lesson_stats, a_stats, o_stats, attention, missing),
    )


def _pct(x: float | None) -> str:
    return "—" if x is None else f"{round(x * 100)}%"


def _insights(
    n: int,
    lessons: list[LessonStat],
    assessments: list[AssessmentStat],
    objectives: list[ObjectiveStat],
    attention: list[StudentAttention],
    missing: list[ConceptCount],
) -> list[Insight]:
    out: list[Insight] = []
    if n == 0:
        return [
            Insight(severity="info", kind="no_students", message="No students are enrolled yet.")
        ]
    for o in objectives:
        if o.students_with_evidence and o.gaps / o.students_with_evidence >= 0.4:
            out.append(
                Insight(
                    severity="critical",
                    kind="objective_gap",
                    target_id=str(o.objective_id),
                    message=f"“{o.text}”: {o.gaps} of {o.students_with_evidence} students show a "
                    f"knowledge gap (average mastery {_pct(o.avg_mastery)}). "
                    "Consider re-teaching it.",
                )
            )
    for a in assessments:
        for q in a.questions:
            if q.responses >= 2 and q.avg_score_rate is not None and q.avg_score_rate < 0.5:
                hint = (
                    f" Most common wrong answer: “{q.common_wrong[0].text}”."
                    if q.common_wrong
                    else ""
                )
                out.append(
                    Insight(
                        severity="warning",
                        kind="hard_question",
                        target_id=q.question_key,
                        message=f"{a.title} · {q.question_key}: only {_pct(q.avg_score_rate)} of "
                        f"points earned.{hint}",
                    )
                )
        if a.pending_reviews:
            out.append(
                Insight(
                    severity="info",
                    kind="pending_reviews",
                    target_id=str(a.assessment_id),
                    message=f"{a.title}: {a.pending_reviews} short answer(s) await your review.",
                )
            )
    for lesson in lessons:
        if (
            lesson.completion_rate is not None
            and lesson.completion_rate < 0.3
            and n >= MIN_GROUP_SIZE
        ):
            out.append(
                Insight(
                    severity="warning",
                    kind="low_completion",
                    target_id=str(lesson.lesson_id),
                    message=f"“{lesson.title}” completed by only "
                    f"{_pct(lesson.completion_rate)} of students.",
                )
            )
    if missing:
        out.append(
            Insight(
                severity="info",
                kind="missing_concepts",
                message="Frequently missing in written answers: "
                + ", ".join(c.concept for c in missing[:5])
                + ".",
            )
        )
    inactive = [s for s in attention if "has not completed any lesson" in s.reasons]
    if inactive:
        out.append(
            Insight(
                severity="warning",
                kind="inactive_students",
                message=f"{len(inactive)} student(s) have not completed any lesson yet.",
            )
        )
    order = {"critical": 0, "warning": 1, "info": 2}
    return sorted(out, key=lambda i: order[i.severity])


def student_insights(
    db: Session, user: User, course_id: uuid.UUID, student_id: uuid.UUID
) -> StudentInsights:
    """Teachers (manage) for any enrolled student; students only for themselves."""
    access = resolve_course_access(db, user, course_id)
    if not access.can_manage and student_id != user.id:
        raise NotFoundError()
    student = db.get(User, student_id)
    if student is None or student.id not in {s.id for s in _students(db, course_id)}:
        raise NotFoundError()
    pairs = _course_assessments(db, course_id)
    attempts = [
        a for a in _latest_attempts(db, [a.id for a, _ in pairs]) if a.student_id == student.id
    ]
    evidence = _evidence(db, attempts)
    mastery = {oid: v for (sid, oid), v in _mastery(evidence).items()}
    objectives = db.scalars(
        select(LearningObjective)
        .join(Chapter, Chapter.id == LearningObjective.chapter_id)
        .where(Chapter.course_id == course_id)
        .order_by(Chapter.position, LearningObjective.position)
    )
    obj_out = []
    for o in objectives:
        m = mastery.get(o.id)
        obj_out.append(
            ObjectiveMastery(
                objective_id=o.id,
                text=o.objective_text,
                mastery=round(m[0], 4) if m else None,
                evidence_count=m[1] if m else 0,
                status=status_for(m[0]) if m else "no_evidence",
            )
        )
    # Revision recommendations: lessons linked to questions the student lost points on.
    weak_lessons: Counter[uuid.UUID] = Counter()
    for ev in evidence:
        if ev.earned is not None and ev.earned < ev.possible and ev.question.lesson_id:
            weak_lessons[ev.question.lesson_id] += 1
    recs = []
    for lid, k in weak_lessons.most_common(5):
        lesson = db.get(Lesson, lid)
        if lesson is not None and lesson.published_version is not None:
            recs.append(
                Recommendation(
                    lesson_id=lid,
                    lesson_title=lesson.title,
                    reason=f"{k} question(s) on this lesson were not fully correct",
                )
            )
    lesson_ids = list(
        db.scalars(
            select(Lesson.id)
            .join(Chapter, Chapter.id == Lesson.chapter_id)
            .where(
                Chapter.course_id == course_id,
                Chapter.status == PublishStatus.PUBLISHED,
                Lesson.published_version.is_not(None),
            )
        )
    )
    completed = (
        len(
            list(
                db.scalars(
                    select(LessonProgress.id).where(
                        LessonProgress.user_id == student.id,
                        LessonProgress.status == "completed",
                        LessonProgress.lesson_id.in_(lesson_ids),
                    )
                )
            )
        )
        if lesson_ids
        else 0
    )
    graded = [x for x in attempts if x.score is not None and x.max_score]
    return StudentInsights(
        student_id=student.id,
        display_name=student.display_name,
        course_id=course_id,
        completed_lessons=completed,
        total_lessons=len(lesson_ids),
        attempts=len(attempts),
        avg_score_rate=_rate(sum(x.score or 0 for x in graded), sum(x.max_score for x in graded)),
        objectives=obj_out,
        recommendations=recs,
    )
