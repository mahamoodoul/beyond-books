"""Demo students with realistic activity, so the teacher's analytics have something to show.

For one teacher this creates (all idempotent, no AI calls):

  * one school ("Beyond Books Demo School") with the teacher as school admin, and one classroom
    in it with the teacher as classroom teacher;
  * N student accounts (default 50) as members of that school and classroom. Students that were
    already enrolled in the teacher's courses join the school too, so enrolment keeps working
    once the courses are linked to the school;
  * the teacher's courses linked to the school (only those without a school yet) and the whole
    classroom enrolled in every one of them;
  * for every PUBLISHED course: lesson progress, chapter progress, learning events (lessons and
    3D scenes opened, parts clicked, animations played) and graded quiz attempts, spread over the
    last few weeks. Each student follows a profile (strong / steady / struggling / inactive), so
    the analytics show a believable spread rather than uniform noise.

Activity is generated only for students that have none in that course yet, so re-running adds
the missing students and leaves existing ones alone. --reset removes the demo students' activity
first (their accounts and memberships stay).

    cd backend
    EDU3D_ENV_FILE=.env .venv/bin/python ../scripts/seed_students.py teacher@gmail.com
    EDU3D_ENV_FILE=.env .venv/bin/python ../scripts/seed_students.py teacher@gmail.com --count 30

Students sign in as demo.student01@example.com … with the password given by --password
(default: student-demo-123).
"""

import argparse
import os
import random
import sys
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

ROOT = Path(os.environ.get("SEED_ROOT") or Path(__file__).resolve().parents[1])
_backend = ROOT / "backend"
sys.path.insert(0, str(_backend if _backend.is_dir() else Path.cwd()))

import app.main  # noqa: E402,F401  (registers every model)
from app.modules.assessments.content import AssessmentContent, QuestionIn  # noqa: E402
from app.modules.assessments.models import (  # noqa: E402
    Assessment,
    AssessmentAttempt,
    EvaluationResult,
    StudentAnswer,
)
from app.modules.assessments.service import _published  # noqa: E402
from app.modules.authentication.schemas import RegisterRequest  # noqa: E402
from app.modules.authentication.service import register  # noqa: E402
from app.modules.chapters.models import Chapter, PublishStatus  # noqa: E402
from app.modules.classrooms.models import Classroom, ClassroomMembership, ClassroomRole  # noqa: E402
from app.modules.classrooms.service import add_member as add_classroom_member  # noqa: E402
from app.modules.classrooms.service import create_classroom  # noqa: E402
from app.modules.courses.models import Course, CourseEnrollment, CourseStatus  # noqa: E402
from app.modules.courses.service import enroll  # noqa: E402
from app.modules.lessons.models import Lesson  # noqa: E402
from app.modules.organizations.models import School, SchoolMembership, SchoolRole  # noqa: E402
from app.modules.organizations.service import add_member as add_school_member  # noqa: E402
from app.modules.organizations.service import create_school  # noqa: E402
from app.modules.progress.models import ChapterProgress, LearningEvent, LessonProgress  # noqa: E402
from app.modules.progress.service import _update_chapter  # noqa: E402
from app.modules.three_d.models import ThreeDScene  # noqa: E402
from app.modules.users.models import User  # noqa: E402
from app.modules.users.repository import get_by_email  # noqa: E402

SCHOOL_NAME = "Beyond Books Demo School"
SCHOOL_SLUG = "beyond-books-demo"
CLASSROOM_NAME = "Class 9A (demo)"
EMAIL_PREFIX = "demo.student"
EMAIL_DOMAIN = "example.com"
DEFAULT_PASSWORD = "student-demo-123"  # noqa: S105  demo accounts only

FIRST = [
    "Emma",
    "Noah",
    "Olivia",
    "Liam",
    "Sofia",
    "Lucas",
    "Nora",
    "Oliver",
    "Ella",
    "Elias",
    "Maja",
    "Aksel",
    "Leah",
    "Filip",
    "Ingrid",
    "Jakob",
    "Sara",
    "Mathias",
    "Amalie",
    "Isak",
    "Frida",
    "Adam",
    "Thea",
    "Jonas",
    "Aisha",
    "Omar",
    "Mia",
    "Theo",
    "Hanna",
    "Daniel",
    "Selma",
    "Mohammed",
    "Ida",
    "Kasper",
    "Linnea",
    "Sander",
    "Julie",
    "Ahmed",
    "Tiril",
    "Max",
    "Vilde",
    "Leon",
    "Astrid",
    "Mateo",
    "Live",
    "Henrik",
    "Amina",
    "Victor",
    "Eline",
    "Nikolai",
    "Hedda",
    "Emil",
    "Ayla",
    "Tobias",
    "Mina",
    "Sebastian",
    "Oda",
    "Magnus",
    "Ruby",
    "Storm",
]
LAST = [
    "Hansen",
    "Johansen",
    "Olsen",
    "Larsen",
    "Andersen",
    "Pedersen",
    "Nilsen",
    "Kristiansen",
    "Jensen",
    "Karlsen",
    "Berg",
    "Haugen",
    "Hagen",
    "Ali",
    "Khan",
    "Nguyen",
    "Eriksen",
    "Moen",
    "Solberg",
    "Strand",
    "Dahl",
    "Lund",
    "Bakke",
    "Ahmed",
    "Hussain",
    "Lie",
    "Holm",
    "Sæther",
]

# profile -> (share of students, lessons done range, quiz probability, MCQ accuracy range)
PROFILES: dict[str, tuple[float, tuple[float, float], float, tuple[float, float]]] = {
    "strong": (0.20, (0.85, 1.0), 0.95, (0.85, 1.0)),
    "steady": (0.45, (0.45, 0.85), 0.80, (0.6, 0.85)),
    "struggling": (0.25, (0.15, 0.45), 0.55, (0.3, 0.6)),
    "inactive": (0.10, (0.0, 0.15), 0.0, (0.3, 0.5)),
}

SHORT_ANSWERS = {
    "strong": [
        "{model} In short: {rubric}.",
        "Because {rubric_l}. {model}",
    ],
    "steady": ["I think {rubric_l}.", "{rubric}. Not sure about the rest."],
    "struggling": ["It is important for the body.", "I don't remember this part.", ""],
    "inactive": [""],
}


def student_email(i: int) -> str:
    return f"{EMAIL_PREFIX}{i:02d}@{EMAIL_DOMAIN}"


def _teacher(db: Session, email: str) -> User:
    user = get_by_email(db, email)
    if user is None or user.account_type != "teacher":
        raise SystemExit(f"{email!r} is not a teacher account. Run `make seed-courses` first.")
    return user


def _school(db: Session, teacher: User) -> School:
    school = db.scalar(select(School).where(School.slug == SCHOOL_SLUG))
    if school is None:
        school, _ = create_school(db, teacher, SCHOOL_NAME, SCHOOL_SLUG)
        db.commit()
        print(f"created school {SCHOOL_NAME!r}")
        return school
    role = db.scalar(
        select(SchoolMembership.role).where(
            SchoolMembership.school_id == school.id, SchoolMembership.user_id == teacher.id
        )
    )
    if role is None:
        db.add(
            SchoolMembership(school_id=school.id, user_id=teacher.id, role=SchoolRole.SCHOOL_ADMIN)
        )
        db.commit()
    elif role != SchoolRole.SCHOOL_ADMIN:
        raise SystemExit(f"{teacher.email} is not an admin of {SCHOOL_NAME!r}; cannot add members.")
    return school


def _classroom(db: Session, teacher: User, school: School) -> Classroom:
    room = db.scalar(
        select(Classroom).where(Classroom.school_id == school.id, Classroom.name == CLASSROOM_NAME)
    )
    if room is None:
        room = create_classroom(db, teacher, school.id, CLASSROOM_NAME, "2026/27")
        db.commit()
        print(f"created classroom {CLASSROOM_NAME!r}")
    return room


def _join_school(db: Session, teacher: User, school: School, student: User) -> bool:
    member = db.scalar(
        select(SchoolMembership.id).where(
            SchoolMembership.school_id == school.id, SchoolMembership.user_id == student.id
        )
    )
    if member:
        return False
    add_school_member(db, teacher, school.id, student.email, SchoolRole.STUDENT)
    return True


def _join_classroom(db: Session, teacher: User, room: Classroom, student: User) -> bool:
    member = db.scalar(
        select(ClassroomMembership.id).where(
            ClassroomMembership.classroom_id == room.id, ClassroomMembership.user_id == student.id
        )
    )
    if member:
        return False
    add_classroom_member(db, teacher, room.id, student.email, ClassroomRole.STUDENT)
    return True


def _students(db: Session, count: int, password: str, rng: random.Random) -> list[User]:
    out = []
    created = 0
    for i in range(1, count + 1):
        email = student_email(i)
        user = get_by_email(db, email)
        if user is None:
            name = f"{FIRST[(i - 1) % len(FIRST)]} {LAST[rng.randrange(len(LAST))]}"
            user = register(
                db,
                RegisterRequest(
                    email=email, password=password, display_name=name, account_type="student"
                ),
            )
            created += 1
        out.append(user)
    db.commit()
    print(f"students: {created} created, {count - created} already existed")
    return out


def _profile(rng: random.Random) -> str:
    r = rng.random()
    acc = 0.0
    for name, (share, *_rest) in PROFILES.items():
        acc += share
        if r <= acc:
            return name
    return "steady"


def _scene_targets(
    db: Session, lesson_ids: list[uuid.UUID]
) -> dict[uuid.UUID, list[tuple[uuid.UUID, list[str], list[str]]]]:
    """lesson_id -> [(scene_id, component ids, animation ids)] for published scenes."""
    out: dict[uuid.UUID, list[tuple[uuid.UUID, list[str], list[str]]]] = {}
    if not lesson_ids:
        return out
    for scene in db.scalars(
        select(ThreeDScene).where(
            ThreeDScene.lesson_id.in_(lesson_ids), ThreeDScene.published_spec.is_not(None)
        )
    ):
        spec: dict[str, Any] = scene.published_spec or {}
        parts = [
            str(c.get("component_id") or c.get("id"))
            for c in spec.get("components") or []
            if isinstance(c, dict) and (c.get("component_id") or c.get("id"))
        ]
        anims = [
            str(a.get("animation_id") or a.get("id"))
            for a in spec.get("animation_refs") or []
            if isinstance(a, dict) and (a.get("animation_id") or a.get("id"))
        ]
        out.setdefault(scene.lesson_id, []).append((scene.id, parts, anims))
    return out


def _event(
    db: Session,
    user: User,
    course_id: uuid.UUID,
    lesson_id: uuid.UUID,
    at: datetime,
    kind: str,
    **payload: Any,
) -> None:
    db.add(
        LearningEvent(
            user_id=user.id,
            course_id=course_id,
            lesson_id=lesson_id,
            scene_id=payload.pop("scene_id", None),
            event_type=kind,
            payload={k: v for k, v in payload.items() if v},
            created_at=at,
        )
    )


def _answer_text(profile: str, q: QuestionIn, rng: random.Random) -> str:
    rubric = [c.description for c in (q.rubric or [])]
    first = rubric[0] if rubric else "the main idea"
    template = rng.choice(SHORT_ANSWERS[profile])
    return template.format(
        model=(q.model_answer or "").strip(),
        rubric=first,
        rubric_l=first[:1].lower() + first[1:],
    ).strip()


def _attempt(
    db: Session,
    teacher: User,
    student: User,
    profile: str,
    assessment: Assessment,
    at: datetime,
    rng: random.Random,
    number: int = 1,
) -> AssessmentAttempt | None:
    version = _published(db, assessment)
    if version is None:
        return None
    content = AssessmentContent.model_validate(version.snapshot["content"])
    accuracy = rng.uniform(*PROFILES[profile][3]) + (0.1 if number > 1 else 0.0)
    attempt = AssessmentAttempt(
        assessment_id=assessment.id,
        assessment_version_id=version.id,
        student_id=student.id,
        attempt_number=number,
        max_score=content.max_score,
        started_at=at,
        submitted_at=at + timedelta(minutes=rng.randint(6, 25)),
        status="submitted",
    )
    db.add(attempt)
    db.flush()
    total = 0.0
    complete = True
    for q in content.questions:
        ans = StudentAnswer(
            attempt_id=attempt.id,
            question_key=str(q.key),
            question_type=q.question_type,
            max_points=q.points,
            created_at=attempt.submitted_at,
        )
        if q.question_type == "mcq":
            correct = next(o.key for o in q.options if o.is_correct)
            wrong = [o.key for o in q.options if not o.is_correct]
            right = rng.random() < accuracy
            ans.selected_option_key = correct if right or not wrong else rng.choice(wrong)
            ans.is_correct = ans.selected_option_key == correct
            ans.auto_score = q.points if ans.is_correct else 0.0
            total += ans.auto_score
            db.add(ans)
            continue
        text = _answer_text(profile, q, rng)
        ans.answer_text = text or None
        db.add(ans)
        db.flush()
        if not text:
            ans.auto_score = 0.0
            continue
        share = min(1.0, max(0.0, accuracy + rng.uniform(-0.2, 0.1)))
        suggested = round(q.points * share * 2) / 2
        rubric = [c.description for c in (q.rubric or [])]
        missing = rubric[1:] if share < 0.7 and len(rubric) > 1 else []
        pending = rng.random() < 0.15  # some answers still wait for the teacher's review
        db.add(
            EvaluationResult(
                student_answer_id=ans.id,
                rubric_version=version.version_number,
                suggested_score=suggested,
                final_score=None if pending else suggested,
                feedback=(
                    "Good, complete answer."
                    if share >= 0.85
                    else "Right idea; add why it matters."
                    if share >= 0.5
                    else "Re-read this section: "
                    + (rubric[0] if rubric else "the key concept")
                    + "."
                ),
                missing_concepts=missing,
                confidence=round(0.6 + 0.35 * share, 2),
                status="pending_review" if pending else "accepted",
                reviewed_by=None if pending else teacher.id,
                reviewed_at=None
                if pending
                else attempt.submitted_at + timedelta(hours=rng.randint(2, 30)),
                created_at=attempt.submitted_at,
            )
        )
        total += suggested
        complete = complete and not pending
    attempt.provisional_score = total
    if complete:
        attempt.status, attempt.score = "graded", total
        attempt.graded_at = attempt.submitted_at + timedelta(hours=rng.randint(1, 30))
    return attempt


def _activity(
    db: Session,
    teacher: User,
    course: Course,
    students: list[User],
    profiles: dict[uuid.UUID, str],
    days: int,
    seed: int,
) -> dict[str, int]:
    chapters = list(
        db.scalars(
            select(Chapter)
            .where(Chapter.course_id == course.id, Chapter.status == PublishStatus.PUBLISHED)
            .order_by(Chapter.position)
        )
    )
    lessons: list[tuple[Chapter, Lesson]] = []
    for ch in chapters:
        lessons += [
            (ch, lesson)
            for lesson in db.scalars(
                select(Lesson)
                .where(Lesson.chapter_id == ch.id, Lesson.published_version.is_not(None))
                .order_by(Lesson.position)
            )
        ]
    quizzes = {
        ch.id: [
            a
            for a in db.scalars(select(Assessment).where(Assessment.chapter_id == ch.id))
            if a.published_version is not None
        ]
        for ch in chapters
    }
    scenes = _scene_targets(db, [lesson.id for _, lesson in lessons])
    already = set(
        db.scalars(select(LessonProgress.user_id).where(LessonProgress.course_id == course.id))
    )
    now = datetime.now(UTC)
    stats = {"students": 0, "lessons": 0, "events": 0, "attempts": 0}
    for student in students:
        if student.id in already or not lessons:
            continue
        profile = profiles[student.id]
        # One generator per (seed, course, student): re-runs and --reset reproduce the same
        # activity, and a student who was "inactive" stays inactive instead of being re-rolled.
        rng = random.Random(f"{seed}:{course.id}:{student.email}")  # noqa: S311
        lo, hi = PROFILES[profile][1]
        n_done = round(len(lessons) * rng.uniform(lo, hi))
        touched = min(len(lessons), n_done + (1 if rng.random() < 0.7 else 0))
        if touched == 0:
            continue
        stats["students"] += 1
        t = now - timedelta(days=rng.uniform(days * 0.6, days), hours=rng.uniform(0, 12))
        done_chapters: set[uuid.UUID] = set()
        for idx, (ch, lesson) in enumerate(lessons[:touched]):
            completed = idx < n_done
            started = t
            finished = t + timedelta(minutes=rng.randint(12, 55))
            db.add(
                LessonProgress(
                    user_id=student.id,
                    lesson_id=lesson.id,
                    course_id=course.id,
                    status="completed" if completed else "in_progress",
                    started_at=started,
                    completed_at=finished if completed else None,
                    last_activity_at=finished
                    if completed
                    else started + timedelta(minutes=rng.randint(3, 20)),
                )
            )
            stats["lessons"] += 1
            _event(db, student, course.id, lesson.id, started, "lesson_opened")
            stats["events"] += 1
            for scene_id, parts, anims in scenes.get(lesson.id, []):
                if rng.random() < 0.85:
                    at = started + timedelta(minutes=rng.randint(2, 15))
                    _event(db, student, course.id, lesson.id, at, "scene_opened", scene_id=scene_id)
                    stats["events"] += 1
                    for part in rng.sample(parts, min(len(parts), rng.randint(1, 4))):
                        at += timedelta(seconds=rng.randint(20, 120))
                        _event(
                            db,
                            student,
                            course.id,
                            lesson.id,
                            at,
                            "component_selected",
                            scene_id=scene_id,
                            component_id=part,
                        )
                        stats["events"] += 1
                    if anims and rng.random() < 0.6:
                        at += timedelta(seconds=rng.randint(20, 90))
                        anim = rng.choice(anims)
                        _event(
                            db,
                            student,
                            course.id,
                            lesson.id,
                            at,
                            "animation_started",
                            scene_id=scene_id,
                            animation_id=anim,
                        )
                        _event(
                            db,
                            student,
                            course.id,
                            lesson.id,
                            at + timedelta(seconds=30),
                            "animation_completed",
                            scene_id=scene_id,
                            animation_id=anim,
                        )
                        stats["events"] += 2
            # last lesson of a chapter finished -> maybe take its quiz
            is_last_in_chapter = idx + 1 == len(lessons) or lessons[idx + 1][0].id != ch.id
            if completed and is_last_in_chapter:
                done_chapters.add(ch.id)
                for quiz in quizzes.get(ch.id, []):
                    if rng.random() < PROFILES[profile][2]:
                        when = finished + timedelta(hours=rng.uniform(1, 48))
                        a1 = _attempt(db, teacher, student, profile, quiz, when, rng)
                        stats["attempts"] += 1
                        if (
                            a1 is not None
                            and quiz.max_attempts >= 2
                            and a1.max_score
                            and (a1.provisional_score or 0) / a1.max_score < 0.6
                            and rng.random() < 0.5
                        ):
                            _attempt(
                                db,
                                teacher,
                                student,
                                profile,
                                quiz,
                                when + timedelta(days=rng.uniform(1, 4)),
                                rng,
                                number=2,
                            )
                            stats["attempts"] += 1
            t = finished + timedelta(hours=rng.uniform(6, 60))
            if t > now - timedelta(hours=1):
                t = now - timedelta(hours=rng.uniform(1, 12))
        db.flush()
        for ch in chapters:
            if any(lesson.chapter_id == ch.id for _, lesson in lessons[:touched]):
                _update_chapter(db, student.id, ch)
        # Chapter completion dates follow the lesson dates rather than "now".
        for cp in db.scalars(
            select(ChapterProgress).where(
                ChapterProgress.user_id == student.id, ChapterProgress.course_id == course.id
            )
        ):
            if cp.status == "completed":
                cp.completed_at = db.scalar(
                    select(LessonProgress.completed_at)
                    .join(Lesson, Lesson.id == LessonProgress.lesson_id)
                    .where(LessonProgress.user_id == student.id, Lesson.chapter_id == cp.chapter_id)
                    .order_by(LessonProgress.completed_at.desc())
                )
    db.commit()
    return stats


def reset(db: Session, students: list[User]) -> None:
    ids = [s.id for s in students]
    if not ids:
        return
    attempts = list(
        db.scalars(select(AssessmentAttempt.id).where(AssessmentAttempt.student_id.in_(ids)))
    )
    if attempts:
        answers = list(
            db.scalars(select(StudentAnswer.id).where(StudentAnswer.attempt_id.in_(attempts)))
        )
        if answers:
            db.execute(
                delete(EvaluationResult).where(EvaluationResult.student_answer_id.in_(answers))
            )
            db.execute(delete(StudentAnswer).where(StudentAnswer.id.in_(answers)))
        db.execute(delete(AssessmentAttempt).where(AssessmentAttempt.id.in_(attempts)))
    db.execute(delete(LearningEvent).where(LearningEvent.user_id.in_(ids)))
    db.execute(delete(ChapterProgress).where(ChapterProgress.user_id.in_(ids)))
    db.execute(delete(LessonProgress).where(LessonProgress.user_id.in_(ids)))
    db.commit()
    print(f"reset: removed the activity of {len(ids)} demo students")


def run(
    db: Session,
    teacher_email: str,
    count: int = 50,
    password: str = DEFAULT_PASSWORD,
    days: int = 21,
    seed: int = 7,
    do_reset: bool = False,
) -> dict[str, Any]:
    rng = random.Random(seed)  # noqa: S311  demo data, reproducible on purpose
    teacher = _teacher(db, teacher_email)
    school = _school(db, teacher)
    room = _classroom(db, teacher, school)
    students = _students(db, count, password, rng)
    if do_reset:
        reset(db, students)

    courses = list(
        db.scalars(select(Course).where(Course.created_by == teacher.id).order_by(Course.title))
    )
    # Students enrolled before the courses joined the school must be school members as well.
    earlier = list(
        db.scalars(
            select(User)
            .join(CourseEnrollment, CourseEnrollment.student_id == User.id)
            .where(CourseEnrollment.course_id.in_([c.id for c in courses]))
            .distinct()
        )
    )
    joined = sum(_join_school(db, teacher, school, s) for s in [*students, *earlier])
    in_room = sum(_join_classroom(db, teacher, room, s) for s in students)
    db.commit()
    print(
        f"school {SCHOOL_NAME!r}: {joined} new members; classroom {CLASSROOM_NAME!r}: {in_room} new"
    )

    linked = 0
    for course in courses:
        if course.school_id is None:
            course.school_id = school.id
            linked += 1
    db.commit()
    enrolled = 0
    for course in courses:
        enrolled += enroll(db, teacher, course.id, None, room.id)[0]
    db.commit()
    print(
        f"courses: {linked} linked to the school, {enrolled} new enrolments "
        f"across {len(courses)} courses"
    )

    profiles = {s.id: _profile(random.Random(f"{seed}:{s.email}")) for s in students}  # noqa: S311
    totals: dict[str, Any] = {"students": count, "courses": {}}
    for course in courses:
        if course.status != CourseStatus.PUBLISHED:
            print(f"- {course.title}: draft, enrolled only (students only see published courses)")
            continue
        stats = _activity(db, teacher, course, students, profiles, days, seed)
        totals["courses"][str(course.id)] = {"title": course.title, **stats}
        print(
            f"- {course.title}: {stats['students']} students active, {stats['lessons']} lesson "
            f"records, {stats['events']} events, {stats['attempts']} quiz attempts"
        )
    return totals


def main() -> None:
    p = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    p.add_argument("teacher_email")
    p.add_argument("--count", type=int, default=50)
    p.add_argument("--password", default=DEFAULT_PASSWORD, help="password for all demo students")
    p.add_argument("--days", type=int, default=21, help="spread activity over the last N days")
    p.add_argument("--seed", type=int, default=7, help="random seed (same seed = same data)")
    p.add_argument("--reset", action="store_true", help="remove the demo students' activity first")
    args = p.parse_args()
    if len(args.password) < 12:
        raise SystemExit("--password must be at least 12 characters")
    from app.database.session import session_factory

    db = session_factory()()
    try:
        run(db, args.teacher_email, args.count, args.password, args.days, args.seed, args.reset)
    finally:
        db.close()


if __name__ == "__main__":
    main()
