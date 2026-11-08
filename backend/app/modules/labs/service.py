import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.errors import ConflictError, NotFoundError, PermissionDeniedError
from app.modules.chapters.models import Chapter, PublishStatus
from app.modules.chapters.service import chapter_access
from app.modules.courses.access import can_manage_course, get_course_for, is_enrolled
from app.modules.courses.models import Course, CourseEnrollment, CourseStatus
from app.modules.labs.engines import get_engine, kinds
from app.modules.labs.models import CircuitLab, CircuitLabSession
from app.modules.labs.schemas import (
    LabCreate,
    LabKindOut,
    LabOut,
    LabSummary,
    LabUpdate,
    SessionOut,
    SessionResult,
    StudentSessionRow,
)
from app.modules.operations import audit
from app.modules.organizations.models import SchoolMembership
from app.modules.users.models import AccountType, User

PUBLISHED = "published"


# ----------------------------------------------------------------- helpers
def _lab(db: Session, lab_id: uuid.UUID) -> CircuitLab:
    lab = db.get(CircuitLab, lab_id)
    if lab is None:
        raise NotFoundError()
    return lab


def _can_manage(db: Session, user: User, lab: CircuitLab) -> bool:
    if lab.created_by == user.id:
        return True
    if lab.course_id is not None:
        course = db.get(Course, lab.course_id)
        return course is not None and can_manage_course(db, user, course)
    return False


def _manage(db: Session, user: User, lab_id: uuid.UUID) -> CircuitLab:
    lab = _lab(db, lab_id)
    if not _can_manage(db, user, lab):
        if lab.course_id is None:
            raise NotFoundError()
        get_course_for(db, user, lab.course_id, manage=True)  # 404 / 403 with the usual rules
    return lab


def _related_to_creator(db: Session, student_id: uuid.UUID, creator_id: uuid.UUID) -> bool:
    """A student is 'in reach' of a teacher when enrolled in any of the teacher's courses or
    a member of a school the teacher belongs to. Used for standalone labs."""
    enrolled = db.scalar(
        select(CourseEnrollment.id)
        .join(Course, Course.id == CourseEnrollment.course_id)
        .where(
            CourseEnrollment.student_id == student_id,
            CourseEnrollment.status == "active",
            Course.created_by == creator_id,
        )
        .limit(1)
    )
    if enrolled:
        return True
    mine = select(SchoolMembership.school_id).where(SchoolMembership.user_id == creator_id)
    shared = db.scalar(
        select(SchoolMembership.id)
        .where(SchoolMembership.user_id == student_id, SchoolMembership.school_id.in_(mine))
        .limit(1)
    )
    return shared is not None


def _student_can_open(db: Session, user: User, lab: CircuitLab) -> bool:
    """Published labs only. In a course: enrolled students (the course itself may be a draft).
    Standalone: students in reach of the teacher."""
    if lab.status != PUBLISHED:
        return False
    if lab.course_id is not None:
        return is_enrolled(db, user.id, lab.course_id)
    return _related_to_creator(db, user.id, lab.created_by)


def _visible(db: Session, user: User, lab_id: uuid.UUID) -> tuple[CircuitLab, bool]:
    """The lab and whether the user manages it; 404 when the user may not see it."""
    lab = _lab(db, lab_id)
    if _can_manage(db, user, lab):
        return lab, True
    if not _student_can_open(db, user, lab):
        raise NotFoundError()
    return lab, False


def _chapter_in_course(
    db: Session, course_id: uuid.UUID | None, chapter_id: uuid.UUID | None
) -> None:
    if chapter_id is None:
        return
    chapter = db.get(Chapter, chapter_id)
    if course_id is None or chapter is None or chapter.course_id != course_id:
        raise ConflictError("The chapter does not belong to this course.")


def _engine_or_409(kind: str) -> Any:
    try:
        return get_engine(kind)
    except ValueError as exc:
        raise ConflictError(str(exc)) from exc


def _validate_config(
    kind: str, goal: dict[str, Any] | None, palette: dict[str, Any] | None
) -> tuple[dict[str, Any], dict[str, Any]]:
    engine = _engine_or_409(kind)
    try:
        g = engine.validate_goal(goal) if goal is not None else engine.default_goal()
        p = engine.validate_palette(palette) if palette is not None else engine.default_palette()
    except ValueError as exc:
        raise ConflictError(f"Invalid lab settings: {exc}") from exc
    return g, p


def _session_of(db: Session, lab_id: uuid.UUID, student_id: uuid.UUID) -> CircuitLabSession | None:
    return db.scalar(
        select(CircuitLabSession).where(
            CircuitLabSession.lab_id == lab_id, CircuitLabSession.student_id == student_id
        )
    )


def _session_out(s: CircuitLabSession | None) -> SessionOut | None:
    if s is None:
        return None
    return SessionOut(
        id=s.id,
        status=s.status,
        interactions=s.interactions,
        state=s.state or {},
        result=s.result or {},
        achieved=[str(a) for a in (s.achieved or [])],
        started_at=s.started_at,
        last_activity_at=s.last_activity_at,
        completed_at=s.completed_at,
    )


def to_out(db: Session, user: User, lab: CircuitLab, can_manage: bool) -> LabOut:
    course = db.get(Course, lab.course_id) if lab.course_id else None
    chapter = db.get(Chapter, lab.chapter_id) if lab.chapter_id else None
    started = completed = 0
    session = None
    note = None
    if can_manage:
        started = (
            db.scalar(
                select(func.count(CircuitLabSession.id)).where(CircuitLabSession.lab_id == lab.id)
            )
            or 0
        )
        completed = (
            db.scalar(
                select(func.count(CircuitLabSession.id)).where(
                    CircuitLabSession.lab_id == lab.id, CircuitLabSession.status == "completed"
                )
            )
            or 0
        )
        if lab.status != PUBLISHED:
            note = "Students cannot open this lab yet: it is a draft. Publish it when ready."
        elif course is None:
            note = (
                "Standalone lab: open to students enrolled in any of your courses and to "
                "students of your schools, in their Labs tab."
            )
        elif course.status != CourseStatus.PUBLISHED:
            note = (
                f"Open to students enrolled in “{course.title}” through their Labs tab. The "
                "course is still a draft, so they will not see the course page itself."
            )
        elif chapter is not None and chapter.status != PublishStatus.PUBLISHED:
            note = (
                f"Open to enrolled students through their Labs tab. The chapter “{chapter.title}” "
                "is a draft, so the lab does not show on the course page until it is published."
            )
    else:
        session = _session_out(_session_of(db, lab.id, user.id))
    return LabOut(
        id=lab.id,
        kind=lab.kind,
        course_id=lab.course_id,
        course_title=course.title if course else None,
        chapter_id=lab.chapter_id,
        chapter_title=chapter.title if chapter else None,
        title=lab.title,
        instructions=lab.instructions,
        goal=lab.goal or {},
        palette=lab.palette or {},
        status=lab.status,
        can_manage=can_manage,
        created_at=lab.created_at,
        updated_at=lab.updated_at,
        students_started=started,
        students_completed=completed,
        session=session,
        visibility_note=note,
    )


def lab_kinds() -> list[LabKindOut]:
    return [
        LabKindOut(
            kind=e.kind,
            title=e.title,
            description=e.description,
            default_goal=e.default_goal(),
            default_palette=e.default_palette(),
            options=e.options(),
        )
        for e in kinds()
    ]


# ----------------------------------------------------------------- teacher
def create_lab(db: Session, user: User, course_id: uuid.UUID | None, body: LabCreate) -> CircuitLab:
    if course_id is not None:
        get_course_for(db, user, course_id, manage=True)
    _chapter_in_course(db, course_id, body.chapter_id)
    goal, palette = _validate_config(body.kind, body.goal, body.palette)
    lab = CircuitLab(
        course_id=course_id,
        chapter_id=body.chapter_id,
        created_by=user.id,
        kind=body.kind,
        title=body.title.strip(),
        instructions=body.instructions,
        goal=goal,
        palette=palette,
    )
    db.add(lab)
    db.flush()
    audit.record(
        db,
        action="lab.create",
        resource_type="circuit_lab",
        resource_id=lab.id,
        actor_user_id=user.id,
        metadata={"kind": body.kind, "course_id": str(course_id) if course_id else None},
    )
    db.commit()
    return lab


def update_lab(db: Session, user: User, lab_id: uuid.UUID, body: LabUpdate) -> CircuitLab:
    lab = _manage(db, user, lab_id)
    if body.title is not None:
        lab.title = body.title.strip()
    if body.clear_course:
        lab.course_id, lab.chapter_id = None, None
    elif body.course_id is not None and body.course_id != lab.course_id:
        get_course_for(db, user, body.course_id, manage=True)
        lab.course_id, lab.chapter_id = body.course_id, None
    if body.clear_chapter:
        lab.chapter_id = None
    elif body.chapter_id is not None:
        _chapter_in_course(db, lab.course_id, body.chapter_id)
        lab.chapter_id = body.chapter_id
    if body.instructions is not None:
        lab.instructions = body.instructions
    if body.goal is not None or body.palette is not None:
        goal, palette = _validate_config(
            lab.kind,
            body.goal if body.goal is not None else lab.goal,
            body.palette if body.palette is not None else lab.palette,
        )
        lab.goal, lab.palette = goal, palette
    if body.status is not None and body.status != lab.status:
        lab.status = body.status
        audit.record(
            db,
            action=f"lab.{body.status}",
            resource_type="circuit_lab",
            resource_id=lab.id,
            actor_user_id=user.id,
        )
    db.commit()
    return lab


def delete_lab(db: Session, user: User, lab_id: uuid.UUID) -> None:
    lab = _manage(db, user, lab_id)
    db.delete(lab)
    db.commit()


def list_labs(db: Session, user: User) -> list[LabOut]:
    """Teachers: labs they created or that sit in their courses. Students: published labs in
    their courses (whatever the course status) plus standalone labs of teachers in reach."""
    if user.account_type == AccountType.TEACHER:
        rows = db.scalars(
            select(CircuitLab)
            .outerjoin(Course, Course.id == CircuitLab.course_id)
            .where(or_(CircuitLab.created_by == user.id, Course.created_by == user.id))
            .order_by(CircuitLab.updated_at.desc())
        )
        return [to_out(db, user, lab, True) for lab in rows]
    rows = db.scalars(
        select(CircuitLab)
        .where(CircuitLab.status == PUBLISHED)
        .order_by(CircuitLab.updated_at.desc())
    )
    return [to_out(db, user, lab, False) for lab in rows if _student_can_open(db, user, lab)]


def list_for_chapter(db: Session, user: User, chapter_id: uuid.UUID) -> list[LabSummary]:
    chapter, access = chapter_access(db, user, chapter_id)
    q = (
        select(CircuitLab)
        .where(CircuitLab.chapter_id == chapter.id)
        .order_by(CircuitLab.created_at)
    )
    if not access.can_manage:
        q = q.where(CircuitLab.status == PUBLISHED)
    out = []
    for lab in db.scalars(q):
        s = None if access.can_manage else _session_of(db, lab.id, user.id)
        out.append(
            LabSummary(
                id=lab.id,
                kind=lab.kind,
                chapter_id=lab.chapter_id,
                title=lab.title,
                status=lab.status,
                goal=lab.goal or {},
                session_status=s.status if s else None,
            )
        )
    return out


def get_lab(db: Session, user: User, lab_id: uuid.UUID) -> LabOut:
    lab, can_manage = _visible(db, user, lab_id)
    return to_out(db, user, lab, can_manage)


# ----------------------------------------------------------------- student
def put_session(db: Session, user: User, lab_id: uuid.UUID, state: dict[str, Any]) -> SessionResult:
    """Evaluate the student's state and store it. Teachers get the evaluation only."""
    lab, can_manage = _visible(db, user, lab_id)
    engine = _engine_or_409(lab.kind)
    try:
        clean = engine.validate_state(state, lab.palette or {})
    except ValueError as exc:
        raise ConflictError(f"Invalid lab state: {exc}") from exc
    previous: list[str] = []
    s = None
    if not can_manage:
        if user.account_type != AccountType.STUDENT:
            raise PermissionDeniedError()
        s = _session_of(db, lab.id, user.id)
        previous = [str(a) for a in (s.achieved or [])] if s else []
    ev = engine.evaluate(clean, lab.goal or {}, previous)
    achieved = sorted(set(previous) | set(ev.achieved))
    if can_manage:
        return SessionResult(
            result=ev.result,
            message=ev.message,
            goal_met=ev.goal_met,
            achieved=achieved,
            session=None,
        )
    now = datetime.now(UTC)
    if s is None:
        s = CircuitLabSession(
            lab_id=lab.id, student_id=user.id, started_at=now, interactions=0, status="in_progress"
        )
        db.add(s)
    s.state = clean
    s.result = {**ev.result, "goal_met": ev.goal_met, "message": ev.message}
    s.achieved = achieved
    s.interactions += 1
    s.last_activity_at = now
    if ev.goal_met and s.status != "completed":
        s.status, s.completed_at = "completed", now
    db.commit()
    db.refresh(s)
    return SessionResult(
        result=ev.result,
        message=ev.message,
        goal_met=ev.goal_met,
        achieved=achieved,
        session=_session_out(s),
    )


def list_sessions(db: Session, user: User, lab_id: uuid.UUID) -> list[StudentSessionRow]:
    lab = _manage(db, user, lab_id)
    engine = _engine_or_409(lab.kind)
    total = engine.goal_count(lab.goal or {})
    rows = db.execute(
        select(CircuitLabSession, User)
        .join(User, User.id == CircuitLabSession.student_id)
        .where(CircuitLabSession.lab_id == lab.id)
        .order_by(CircuitLabSession.last_activity_at.desc())
    ).all()
    out = []
    for s, student in rows:
        result = s.result or {}
        summary, flag = engine.summary(result, s.state or {})
        out.append(
            StudentSessionRow(
                student_id=student.id,
                display_name=student.display_name,
                status=s.status,
                interactions=s.interactions,
                summary=summary,
                flag=flag,
                achieved=len(s.achieved or []),
                total=total,
                goal_met=bool(result.get("goal_met")),
                started_at=s.started_at,
                last_activity_at=s.last_activity_at,
                completed_at=s.completed_at,
            )
        )
    return out
