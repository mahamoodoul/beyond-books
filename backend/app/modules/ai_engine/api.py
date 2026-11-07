import uuid
from datetime import datetime
from typing import Any, Literal

from fastapi import APIRouter, status
from pydantic import BaseModel, ConfigDict, Field

from app.core.deps import DB, CurrentUser
from app.modules.ai_engine import service
from app.modules.ai_engine.models import AIOutputVersion
from app.modules.chapters.models import Chapter
from app.modules.chapters.schemas import ChapterOut, ChapterSourceRef
from app.modules.operations.api import JobOut
from app.modules.operations.models import Job

router = APIRouter(tags=["ai"])


class OutlineProposalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    status: str
    output: dict[str, Any]
    validation: dict[str, Any]
    prompt_id: str
    prompt_version: str
    model: str
    created_at: datetime


class OutlineChapterIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=5000)
    source_refs: list[ChapterSourceRef] = Field(default_factory=list, max_length=20)
    objectives: list[str] = Field(default_factory=list, max_length=20)


class ApplyOutlineRequest(BaseModel):
    chapters: list[OutlineChapterIn] = Field(min_length=1, max_length=50)


class SectionRegenerateRequest(BaseModel):
    expected_version: int = Field(ge=1)
    instruction: str | None = Field(default=None, max_length=500)


class AIUsageOut(BaseModel):
    calls: int
    input_tokens: int
    output_tokens: int
    estimated_cost_usd: float | None


@router.post(
    "/courses/{course_id}/ai/outline", response_model=JobOut, status_code=status.HTTP_202_ACCEPTED
)
def generate_outline(course_id: uuid.UUID, user: CurrentUser, db: DB) -> Job:
    return service.start_outline(db, user, course_id)


@router.get("/courses/{course_id}/ai/outline-proposals", response_model=list[OutlineProposalOut])
def outline_proposals(course_id: uuid.UUID, user: CurrentUser, db: DB) -> list[AIOutputVersion]:
    return service.list_outline_proposals(db, user, course_id)


@router.post("/ai/outline-proposals/{proposal_id}/apply", response_model=list[ChapterOut])
def apply_outline(
    proposal_id: uuid.UUID, body: ApplyOutlineRequest, user: CurrentUser, db: DB
) -> list[Chapter]:
    chapters = [
        {
            **c.model_dump(exclude={"source_refs"}),
            "source_refs": [r.model_dump(mode="json") for r in c.source_refs],
        }
        for c in body.chapters
    ]
    return service.apply_outline(db, user, proposal_id, chapters)


@router.post("/ai/outline-proposals/{proposal_id}/discard", status_code=status.HTTP_204_NO_CONTENT)
def discard_outline(proposal_id: uuid.UUID, user: CurrentUser, db: DB) -> None:
    service.discard_outline(db, user, proposal_id)


@router.post(
    "/chapters/{chapter_id}/ai/lesson", response_model=JobOut, status_code=status.HTTP_202_ACCEPTED
)
def generate_lesson(chapter_id: uuid.UUID, user: CurrentUser, db: DB) -> Job:
    return service.start_lesson(db, user, chapter_id)


@router.post(
    "/lessons/{lesson_id}/ai/sections/{index}/regenerate",
    response_model=JobOut,
    status_code=status.HTTP_202_ACCEPTED,
)
def regenerate_section(
    lesson_id: uuid.UUID, index: int, body: SectionRegenerateRequest, user: CurrentUser, db: DB
) -> Job:
    return service.start_section(
        db, user, lesson_id, index, body.expected_version, body.instruction
    )


@router.post(
    "/lessons/{lesson_id}/ai/scene", response_model=JobOut, status_code=status.HTTP_202_ACCEPTED
)
def plan_scene(lesson_id: uuid.UUID, user: CurrentUser, db: DB) -> Job:
    return service.start_scene_plan(db, user, lesson_id)


@router.post(
    "/scenes/{scene_id}/ai/animation", response_model=JobOut, status_code=status.HTTP_202_ACCEPTED
)
def plan_animation(scene_id: uuid.UUID, user: CurrentUser, db: DB) -> Job:
    from app.modules.ai_engine.animation_planning import start_animation_plan

    return start_animation_plan(db, user, scene_id)


class PartInsightRequest(BaseModel):
    component_id: str = Field(min_length=1, max_length=64)
    action: Literal["explain_deeper", "simplify", "compare", "quiz_question"]
    compare_with: str | None = Field(default=None, max_length=64)


@router.post(
    "/scenes/{scene_id}/ai/part-insight",
    response_model=JobOut,
    status_code=status.HTTP_202_ACCEPTED,
)
def part_insight(scene_id: uuid.UUID, body: PartInsightRequest, user: CurrentUser, db: DB) -> Job:
    """AI help for one 3D part (teacher 3D Studio). Result in the job's `result`."""
    from app.modules.ai_engine.part_insight import start_part_insight

    return start_part_insight(db, user, scene_id, body.component_id, body.action, body.compare_with)


@router.get("/courses/{course_id}/ai/usage", response_model=AIUsageOut)
def usage(course_id: uuid.UUID, user: CurrentUser, db: DB) -> AIUsageOut:
    return AIUsageOut(**service.usage_summary(db, user, course_id))
