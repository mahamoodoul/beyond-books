import pytest

from app.modules.operations.jobs import (
    TERMINAL_STATUSES,
    InvalidJobTransitionError,
    JobStatus,
    assert_transition,
    can_transition,
)


@pytest.mark.parametrize(
    ("current", "target"),
    [
        (JobStatus.QUEUED, JobStatus.PROCESSING),
        (JobStatus.PROCESSING, JobStatus.VALIDATING),
        (JobStatus.VALIDATING, JobStatus.COMPLETED),
        (JobStatus.PROCESSING, JobStatus.RETRYING),
        (JobStatus.RETRYING, JobStatus.PROCESSING),
        (JobStatus.PROCESSING, JobStatus.FAILED),
        (JobStatus.VALIDATING, JobStatus.FAILED),
        (JobStatus.QUEUED, JobStatus.CANCELLED),
    ],
)
def test_allowed_transitions(current: JobStatus, target: JobStatus) -> None:
    assert can_transition(current, target)


@pytest.mark.parametrize("terminal", sorted(TERMINAL_STATUSES))
def test_terminal_states_are_final(terminal: JobStatus) -> None:
    for target in JobStatus:
        assert not can_transition(terminal, target)


def test_cannot_skip_validation() -> None:
    with pytest.raises(InvalidJobTransitionError):
        assert_transition(JobStatus.PROCESSING, JobStatus.COMPLETED)
