"""Lab engines: one per kind of lab. An engine validates the teacher's config (goal + palette)
and the student's state, evaluates a state and decides whether the goal is met.

The frontend holds a matching evaluator per kind (frontend/src/features/labs/engines/) for
instant feedback; the server's result is the one stored. Keep them in step."""

from __future__ import annotations

from typing import Any, Protocol

from pydantic import BaseModel


class EngineResult(BaseModel):
    result: dict[str, Any]  # what the UI renders (lit bulbs, formula, buoyant force ...)
    message: str
    goal_met: bool
    achieved: list[str] = []  # sub-goals satisfied by this state (merged into the session)


class Engine(Protocol):
    kind: str
    title: str
    description: str

    def default_goal(self) -> dict[str, Any]: ...
    def default_palette(self) -> dict[str, Any]: ...
    def validate_goal(self, goal: dict[str, Any]) -> dict[str, Any]: ...
    def validate_palette(self, palette: dict[str, Any]) -> dict[str, Any]: ...
    def validate_state(self, state: dict[str, Any], palette: dict[str, Any]) -> dict[str, Any]: ...
    def evaluate(
        self, state: dict[str, Any], goal: dict[str, Any], achieved: list[str]
    ) -> EngineResult: ...
    def options(self) -> dict[str, Any]: ...
    def goal_count(self, goal: dict[str, Any]) -> int: ...
    def summary(self, result: dict[str, Any], state: dict[str, Any]) -> tuple[str, str | None]: ...


_ENGINES: dict[str, Engine] = {}


def register(engine: Engine) -> Engine:
    _ENGINES[engine.kind] = engine
    return engine


def get_engine(kind: str) -> Engine:
    if kind not in _ENGINES:
        _load()
    try:
        return _ENGINES[kind]
    except KeyError as exc:
        raise ValueError(
            f"Unknown lab kind '{kind}'. Known: {', '.join(sorted(_ENGINES))}"
        ) from exc


ORDER = ("circuit", "molecules", "buoyancy", "respiration", "orbits", "tectonics")


def kinds() -> list[Engine]:
    _load()
    return [_ENGINES[k] for k in ORDER if k in _ENGINES]


def _load() -> None:
    if _ENGINES:
        return
    from app.modules.labs.engines import (  # noqa: F401
        buoyancy,
        circuit,
        molecules,
        orbits,
        respiration,
        tectonics,
    )
