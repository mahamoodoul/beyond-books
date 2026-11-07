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


class SourcePassageOut(BaseModel):
    document_id: uuid.UUID
    document_title: str
    page_start: int
    page_end: int
    text: str


class ChapterSourceOut(BaseModel):
    """The textbook text the AI reads for this chapter (shown in the chapter studio)."""

    strategy: str  # chapter_page_ranges | lexical | none
    truncated: bool
    characters: int
    passages: list[SourcePassageOut]


@router.get("/chapters/{chapter_id}/source", response_model=ChapterSourceOut)
def chapter_source(chapter_id: uuid.UUID, user: CurrentUser, db: DB) -> ChapterSourceOut:
    from app.modules.ai_engine import retrieval
    from app.modules.chapters.service import get_chapter_for
    from app.modules.documents.models import SourceDocument

    chapter = get_chapter_for(db, user, chapter_id, manage=True)
    found = retrieval.for_chapter(db, chapter)
    titles = {
        str(d.id): d.title
        for d in db.query(SourceDocument).filter(SourceDocument.course_id == chapter.course_id)
    }
    passages = [
        SourcePassageOut(
            document_id=uuid.UUID(p.document_id),
            document_title=titles.get(p.document_id, "Source"),
            page_start=p.page_start,
            page_end=p.page_end,
            text=p.text,
        )
        for p in found.passages
    ]
    return ChapterSourceOut(
        strategy=found.strategy if passages else "none",
        truncated=found.truncated,
        characters=sum(len(p.text) for p in passages),
        passages=passages,
    )


class ApplySplitRequest(BaseModel):
    chapters: list[OutlineChapterIn] = Field(min_length=2, max_length=10)
    remove_original: bool = Field(
        default=False, description="Delete the original chapter (only if it has no content)"
    )


@router.post(
    "/chapters/{chapter_id}/ai/split", response_model=JobOut, status_code=status.HTTP_202_ACCEPTED
)
def propose_split(chapter_id: uuid.UUID, user: CurrentUser, db: DB) -> Job:
    """AI proposes 2-5 smaller chapters for a complex chapter. Result: `result.chapters`."""
    from app.modules.ai_engine.chapter_split import start_split

    return start_split(db, user, chapter_id)


@router.post("/chapters/{chapter_id}/split", response_model=list[ChapterOut])
def apply_split(
    chapter_id: uuid.UUID, body: ApplySplitRequest, user: CurrentUser, db: DB
) -> list[Chapter]:
    """Insert the (teacher-edited) chapters right after the original, as drafts."""
    from app.modules.ai_engine.chapter_split import apply_split as apply

    return apply(
        db,
        user,
        chapter_id,
        [c.model_dump() for c in body.chapters],
        remove_original=body.remove_original,
    )
