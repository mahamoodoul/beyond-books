import uuid

from fastapi import APIRouter

from app.core.deps import DB, CurrentUser
from app.modules.analytics import service
from app.modules.analytics.schemas import CourseAnalytics, StudentInsights

router = APIRouter(tags=["analytics"])


@router.get("/courses/{course_id}/analytics", response_model=CourseAnalytics)
def course_analytics(course_id: uuid.UUID, user: CurrentUser, db: DB) -> CourseAnalytics:
    return service.course_analytics(db, user, course_id)


@router.get("/courses/{course_id}/students/{student_id}/insights", response_model=StudentInsights)
def student_insights(
    course_id: uuid.UUID, student_id: uuid.UUID, user: CurrentUser, db: DB
) -> StudentInsights:
    return service.student_insights(db, user, course_id, student_id)


@router.get("/courses/{course_id}/my-insights", response_model=StudentInsights)
def my_insights(course_id: uuid.UUID, user: CurrentUser, db: DB) -> StudentInsights:
    return service.student_insights(db, user, course_id, user.id)
