"""Biology lab engine: the respiratory system and gas exchange.

State: the breathing phase the student is looking at (in / out), breathing rate and depth
(tidal volume), an activity level (rest, walk, run) and whether they zoomed into an alveolus
and traced an oxygen molecule into the blood.

Educational model, not a clinical one: alveolar ventilation = rate x (tidal volume - dead
space); about 6 % of that air's volume is taken up as oxygen. If the uptake covers what the
activity needs, blood oxygen saturation stays at 98 %; otherwise it falls with the shortfall.
"""

from __future__ import annotations

import math
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.modules.labs.engines import EngineResult, register

DEAD_SPACE_L = 0.15  # air in the trachea and bronchi that never reaches an alveolus
O2_EXTRACTED = 0.06  # share of the alveolar air volume taken up as oxygen
ACTIVITIES: dict[str, float] = {"rest": 0.2, "walk": 0.8, "run": 2.0}  # O2 needed, L/min
TASKS: dict[str, str] = {
    "inhale": "Breathe in and watch the diaphragm and lungs",
    "exhale": "Breathe out and compare",
    "rate": "Raise the breathing rate to 25 breaths a minute or more",
    "exercise": "Keep blood oxygen at 95 % or more while running",
    "trace": "Zoom into an alveolus and trace oxygen into the blood",
}


class State(BaseModel):
    model_config = ConfigDict(extra="forbid")
    phase: Literal["in", "out"] = "out"
    rate: int = Field(default=12, ge=6, le=40)  # breaths per minute
    depth_l: float = Field(default=0.5, ge=0.2, le=1.5)  # tidal volume, litres
    activity: str = "rest"
    view: Literal["lungs", "alveolus"] = "lungs"
    traced: bool = False
    seen: list[Literal["in", "out"]] = Field(default_factory=list, max_length=2)

    @model_validator(mode="after")
    def _known(self) -> State:
        if self.activity not in ACTIVITIES:
            raise ValueError(f"Unknown activity {self.activity!r}.")
        return self


class Goal(BaseModel):
    model_config = ConfigDict(extra="forbid")
    tasks: list[str] = Field(
        default_factory=lambda: list(TASKS), min_length=1, max_length=len(TASKS)
    )

    @model_validator(mode="after")
    def _known(self) -> Goal:
        for t in self.tasks:
            if t not in TASKS:
                raise ValueError(f"Unknown task {t!r}. Known: {', '.join(TASKS)}")
        return self


class Palette(BaseModel):
    model_config = ConfigDict(extra="forbid")
    activities: list[str] = Field(default_factory=lambda: list(ACTIVITIES))

    @model_validator(mode="after")
    def _known(self) -> Palette:
        if not self.activities or any(a not in ACTIVITIES for a in self.activities):
            raise ValueError(f"Activities must be some of: {', '.join(ACTIVITIES)}")
        return self


def _r(v: float, nd: int) -> float:
    """Half-up rounding, identical to the frontend's Math.floor(v * 10**nd + 0.5) / 10**nd."""
    f = 10.0**nd
    return math.floor(v * f + 0.5) / f


def compute(s: State) -> dict[str, Any]:
    minute = s.rate * s.depth_l
    alveolar = s.rate * max(0.0, s.depth_l - DEAD_SPACE_L)
    uptake = alveolar * O2_EXTRACTED
    need = ACTIVITIES[s.activity]
    ratio = uptake / need
    sat = 98.0 if ratio >= 1 else max(70.0, 98 - (1 - ratio) * 40)
    if ratio < 1:
        co2 = "rising"
    elif ratio > 3:
        co2 = "low"  # breathing far more than needed: CO2 is blown off
    else:
        co2 = "normal"
    return {
        "minute_ventilation_l": _r(minute, 1),
        "alveolar_ventilation_l": _r(alveolar, 1),
        "o2_uptake_l": _r(uptake, 2),
        "o2_need_l": need,
        "saturation": _r(sat, 1),
        "co2": co2,
        "breath_seconds": _r(60 / s.rate, 2),
        "phase": s.phase,
    }


def achieved_now(s: State, r: dict[str, Any]) -> list[str]:
    seen = set(s.seen) | {s.phase}
    now = [p for p in ("inhale", "exhale") if {"inhale": "in", "exhale": "out"}[p] in seen]
    if s.rate >= 25:
        now.append("rate")
    if s.activity == "run" and r["saturation"] >= 95:
        now.append("exercise")
    if s.view == "alveolus" and s.traced:
        now.append("trace")
    return now


def message(s: State, r: dict[str, Any]) -> str:
    if s.phase == "in":
        msg = (
            "Breathing in: the diaphragm contracts and flattens, the ribs lift, the chest gets "
            "bigger and air is pulled into the lungs."
        )
    else:
        msg = (
            "Breathing out: the diaphragm relaxes and domes up, the chest gets smaller and air "
            "is pushed out."
        )
    msg += (
        f" {s.rate} breaths × {s.depth_l:.1f} L = {r['minute_ventilation_l']:g} L of air a minute; "
        f"the body takes {r['o2_uptake_l']:g} L of oxygen from it and needs {r['o2_need_l']:g} L "
        f"while you {s.activity}."
    )
    if r["co2"] == "rising":
        msg += f" Not enough: blood oxygen drops to {r['saturation']:g} % and CO₂ builds up."
    elif r["co2"] == "low":
        msg += " Far more than needed: CO₂ is blown off too fast, which can make you dizzy."
    else:
        msg += f" Enough: blood oxygen stays at {r['saturation']:g} %."
    return msg


class RespirationEngine:
    kind = "respiration"
    title = "Breathing and gas exchange"
    description = (
        "Move the diaphragm, change breathing rate and depth, exercise, and follow oxygen "
        "from an alveolus into the blood."
    )

    def default_goal(self) -> dict[str, Any]:
        return Goal().model_dump()

    def default_palette(self) -> dict[str, Any]:
        return Palette().model_dump()

    def validate_goal(self, goal: dict[str, Any]) -> dict[str, Any]:
        return Goal.model_validate(goal).model_dump()

    def validate_palette(self, palette: dict[str, Any]) -> dict[str, Any]:
        return Palette.model_validate(palette).model_dump()

    def validate_state(self, state: dict[str, Any], palette: dict[str, Any]) -> dict[str, Any]:
        s = State.model_validate(state)
        allowed = Palette.model_validate(palette or {}).activities
        if s.activity not in allowed:  # e.g. a fresh board on a lab without "rest"
            s.activity = allowed[0]
        return s.model_dump()

    def evaluate(
        self, state: dict[str, Any], goal: dict[str, Any], achieved: list[str]
    ) -> EngineResult:
        s = State.model_validate(state)
        g = Goal.model_validate(goal)
        r = compute(s)
        now = [t for t in achieved_now(s, r) if t in g.tasks]
        done = sorted(set(achieved) | set(now))
        r["achieved"], r["tasks"] = done, g.tasks
        met = all(t in done for t in g.tasks)
        msg = message(s, r) + (" Every task done!" if met else "")
        return EngineResult(result=r, message=msg, goal_met=met, achieved=now)

    def options(self) -> dict[str, Any]:
        return {
            "activities": [{"name": a, "o2_need_l": v} for a, v in ACTIVITIES.items()],
            "tasks": [{"key": k, "label": v} for k, v in TASKS.items()],
        }

    def goal_count(self, goal: dict[str, Any]) -> int:
        return len(goal.get("tasks") or [])

    def summary(self, result: dict[str, Any], state: dict[str, Any]) -> tuple[str, str | None]:
        text = (
            f"{state.get('activity', '?')}, {state.get('rate', '?')}/min × "
            f"{state.get('depth_l', '?')} L: O₂ {result.get('saturation', '?')} %, "
            f"{len(result.get('achieved') or [])} task(s) done"
        )
        flag = "low oxygen" if result.get("co2") == "rising" else None
        return text, flag


register(RespirationEngine())
