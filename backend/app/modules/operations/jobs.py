"""Asynchronous job lifecycle (design §10). Shared by PDF, AI and 3D generation jobs."""

from enum import StrEnum


class JobStatus(StrEnum):
    QUEUED = "queued"
    PROCESSING = "processing"
    RETRYING = "retrying"
    VALIDATING = "validating"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class JobType(StrEnum):
    DOCUMENT_EXTRACTION = "document_extraction"
    OUTLINE_GENERATION = "outline_generation"
    LESSON_GENERATION = "lesson_generation"
    SECTION_REGENERATION = "section_regeneration"
    SCENE_PLANNING = "scene_planning"
    ANIMATION_PLANNING = "animation_planning"
    ASSESSMENT_GENERATION = "assessment_generation"
    ANSWER_EVALUATION = "answer_evaluation"
    THREE_D_ASSET_GENERATION = "three_d_asset_generation"


TERMINAL_STATUSES = frozenset({JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED})

_TRANSITIONS: dict[JobStatus, frozenset[JobStatus]] = {
    JobStatus.QUEUED: frozenset({JobStatus.PROCESSING, JobStatus.CANCELLED}),
    JobStatus.PROCESSING: frozenset({JobStatus.VALIDATING, JobStatus.RETRYING, JobStatus.FAILED}),
    JobStatus.RETRYING: frozenset({JobStatus.PROCESSING}),
    JobStatus.VALIDATING: frozenset({JobStatus.COMPLETED, JobStatus.FAILED}),
    JobStatus.COMPLETED: frozenset(),
    JobStatus.FAILED: frozenset(),
    JobStatus.CANCELLED: frozenset(),
}


class InvalidJobTransitionError(ValueError):
    pass


def can_transition(current: JobStatus, target: JobStatus) -> bool:
    return target in _TRANSITIONS[current]


def assert_transition(current: JobStatus, target: JobStatus) -> None:
    if not can_transition(current, target):
        raise InvalidJobTransitionError(f"cannot move job from {current} to {target}")
