"""Data subject rights (GDPR art. 15/17/20) for the pilot: export and erasure (design §12).

Export returns the personal data we hold about the caller in machine-readable JSON.
Deletion removes the account and, by cascade, enrolments, progress, learning events, attempts,
answers and evaluations. References in shared records (audit logs, jobs, versions) become NULL.
Teachers who still own courses/classrooms/documents must transfer or delete them first, so
that deleting one account never silently destroys a school's teaching material.
"""

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import ConflictError, UnauthenticatedError
from app.modules.assessments.models import AssessmentAttempt, EvaluationResult, StudentAnswer
from app.modules.authentication.identity import get_identity_provider
from app.modules.classrooms.models import Classroom, ClassroomMembership
from app.modules.courses.models import Course, CourseEnrollment
from app.modules.documents.models import SourceDocument
from app.modules.operations import audit
from app.modules.operations.models import AuditLog
from app.modules.organizations.models import SchoolMembership
from app.modules.progress.models import LearningEvent, LessonProgress
from app.modules.users.models import User


def _rows(db: Session, model: Any, *where: Any, fields: list[str]) -> list[dict[str, Any]]:
    return [
        {
            f: (
                str(v)
                if (v := getattr(r, f)) is not None
                and not isinstance(v, int | float | bool | str | list | dict)
                else v
            )
            for f in fields
        }
        for r in db.scalars(select(model).where(*where))
    ]


def export_user_data(db: Session, user: User) -> dict[str, Any]:
    attempts = list(
        db.scalars(select(AssessmentAttempt).where(AssessmentAttempt.student_id == user.id))
    )
    answers = (
        list(
            db.scalars(
                select(StudentAnswer).where(StudentAnswer.attempt_id.in_([a.id for a in attempts]))
            )
        )
        if attempts
        else []
    )
    evals = (
        {
            e.student_answer_id: e
            for e in db.scalars(
                select(EvaluationResult).where(
                    EvaluationResult.student_answer_id.in_([a.id for a in answers])
                )
            )
        }
        if answers
        else {}
    )
    audit.record(
        db, action="user.export", resource_type="user", resource_id=user.id, actor_user_id=user.id
    )
    db.commit()
    return {
        "profile": {
            "id": str(user.id),
            "email": user.email,
            "display_name": user.display_name,
            "account_type": user.account_type,
            "created_at": user.created_at.isoformat(),
        },
        "school_memberships": _rows(
            db,
            SchoolMembership,
            SchoolMembership.user_id == user.id,
            fields=["school_id", "role", "status", "joined_at"],
        ),
        "classroom_memberships": _rows(
            db,
            ClassroomMembership,
            ClassroomMembership.user_id == user.id,
            fields=["classroom_id", "membership_role", "status"],
        ),
        "enrollments": _rows(
            db,
            CourseEnrollment,
            CourseEnrollment.student_id == user.id,
            fields=["course_id", "status", "enrolled_at"],
        ),
        "lesson_progress": _rows(
            db,
            LessonProgress,
            LessonProgress.user_id == user.id,
            fields=["lesson_id", "status", "started_at", "completed_at"],
        ),
        "learning_events": _rows(
            db,
            LearningEvent,
            LearningEvent.user_id == user.id,
            fields=["event_type", "lesson_id", "scene_id", "payload", "created_at"],
        ),
        "assessment_attempts": [
            {
                "attempt_id": str(a.id),
                "assessment_id": str(a.assessment_id),
                "attempt_number": a.attempt_number,
                "status": a.status,
                "score": a.score,
                "max_score": a.max_score,
                "submitted_at": a.submitted_at.isoformat() if a.submitted_at else None,
                "answers": [
                    {
                        "question_key": s.question_key,
                        "selected_option_key": s.selected_option_key,
                        "answer_text": s.answer_text,
                        "auto_score": s.auto_score,
                        "ai_feedback": evals[s.id].feedback if s.id in evals else None,
                        "final_score": evals[s.id].final_score if s.id in evals else None,
                        "teacher_feedback": evals[s.id].teacher_feedback if s.id in evals else None,
                        "explain_further": s.explain_further,
                    }
                    for s in answers
                    if s.attempt_id == a.id
                ],
            }
            for a in attempts
        ],
        "courses_created": _rows(db, Course, Course.created_by == user.id, fields=["id", "title"]),
        "audit_trail": _rows(
            db,
            AuditLog,
            AuditLog.actor_user_id == user.id,
            fields=["action", "resource_type", "resource_id", "outcome", "created_at"],
        )[-500:],
    }


def delete_account(db: Session, user: User, password: str) -> None:
    if get_identity_provider().authenticate(db, user.email, password) is None:
        raise UnauthenticatedError("Password confirmation failed.")
    owned = []
    if db.scalar(select(Course.id).where(Course.created_by == user.id).limit(1)):
        owned.append("courses")
    if db.scalar(select(Classroom.id).where(Classroom.created_by == user.id).limit(1)):
        owned.append("classrooms")
    if db.scalar(select(SourceDocument.id).where(SourceDocument.uploaded_by == user.id).limit(1)):
        owned.append("uploaded documents")
    if owned:
        raise ConflictError(
            f"Transfer or delete your {', '.join(owned)} before deleting the account."
        )
    user_id = user.id
    db.delete(user)
    audit.record(db, action="user.delete", resource_type="user", resource_id=user_id)
    db.commit()
