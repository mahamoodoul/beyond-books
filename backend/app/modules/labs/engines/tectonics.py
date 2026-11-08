"""Earth-science lab engine: plate tectonics, Earth's layers and seismic waves.

State: a plate boundary type and how many million years the plates have moved (at a typical
5 cm a year), which layers of the Earth the student inspected, and the seismic wave and
seismometer position in the waves view. Rule-based on purpose, with the time scale stated:
1 million years at 5 cm a year moves a plate 50 km.
"""

from __future__ import annotations

import math
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.modules.labs.engines import EngineResult, register

KM_PER_MYR = 50  # 5 cm a year
MAX_MYR = 20
BOUNDARIES: dict[str, str] = {
    "subduction": "Ocean plate meets continent (convergent)",
    "collision": "Continent meets continent (convergent)",
    "divergent": "Plates move apart (divergent)",
    "transform": "Plates slide past each other (transform)",
}
LAYERS: dict[str, dict[str, Any]] = {
    "crust": {"name": "Crust", "from_km": 0, "to_km": 35, "state": "solid rock", "temp_c": 400},
    "mantle": {
        "name": "Mantle",
        "from_km": 35,
        "to_km": 2890,
        "state": "solid rock that flows very slowly",
        "temp_c": 3700,
    },
    "outer_core": {
        "name": "Outer core",
        "from_km": 2890,
        "to_km": 5150,
        "state": "liquid iron and nickel",
        "temp_c": 5000,
    },
    "inner_core": {
        "name": "Inner core",
        "from_km": 5150,
        "to_km": 6371,
        "state": "solid iron and nickel",
        "temp_c": 5400,
    },
}
P_SHADOW = (104, 140)  # degrees from the epicentre where no direct P wave arrives
S_LIMIT = 104  # S waves do not arrive beyond this: the liquid outer core stops them
TASKS: dict[str, str] = {
    "subduction": "Create a subduction zone",
    "mountains": "Push two continents together into mountains at least 5 km high",
    "compare": "Run three different boundary types and compare them",
    "layers": "Inspect all four layers of the Earth",
    "waves": "Send both P and S waves and find where they arrive",
}


class State(BaseModel):
    model_config = ConfigDict(extra="forbid")
    view: Literal["plates", "layers", "waves"] = "plates"
    boundary: str = "subduction"
    myr: int = Field(default=0, ge=0, le=MAX_MYR)
    seen_boundaries: list[str] = Field(default_factory=list, max_length=len(BOUNDARIES))
    layer: str | None = None
    inspected: list[str] = Field(default_factory=list, max_length=len(LAYERS))
    wave: Literal["P", "S"] = "P"
    station: int = Field(default=60, ge=0, le=180)
    seen_waves: list[Literal["P", "S"]] = Field(default_factory=list, max_length=2)

    @model_validator(mode="after")
    def _known(self) -> State:
        if self.boundary not in BOUNDARIES:
            raise ValueError(f"Unknown boundary {self.boundary!r}.")
        if any(b not in BOUNDARIES for b in self.seen_boundaries):
            raise ValueError("Unknown boundary in seen_boundaries.")
        if self.layer is not None and self.layer not in LAYERS:
            raise ValueError(f"Unknown layer {self.layer!r}.")
        if any(x not in LAYERS for x in self.inspected):
            raise ValueError("Unknown layer in inspected.")
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
    boundaries: list[str] = Field(default_factory=lambda: list(BOUNDARIES))

    @model_validator(mode="after")
    def _known(self) -> Palette:
        if not self.boundaries or any(b not in BOUNDARIES for b in self.boundaries):
            raise ValueError(f"Boundaries must be some of: {', '.join(BOUNDARIES)}")
        return self


def _r(v: float, nd: int) -> float:
    """Half-up rounding, identical to the frontend's Math.floor(v * 10**nd + 0.5) / 10**nd."""
    f = 10.0**nd
    return math.floor(v * f + 0.5) / f


def compute(s: State) -> dict[str, Any]:
    km = s.myr * KM_PER_MYR
    b = s.boundary
    out: dict[str, Any] = {"distance_km": km, "boundary": b}
    out["volcanoes"] = b in ("subduction", "divergent") and s.myr > 0
    out["mountain_km"] = _r(min(8.8, 0.45 * s.myr), 1) if b == "collision" else 0.0
    out["arc_km"] = _r(min(4.0, 0.3 * s.myr), 1) if b == "subduction" else 0.0
    out["trench_km"] = _r(min(8.0, 1.5 + 0.5 * s.myr), 1) if b == "subduction" else 0.0
    out["slab_km"] = min(660, s.myr * 40) if b == "subduction" else 0
    out["quake_depth"] = "shallow to deep" if b == "subduction" and s.myr >= 3 else "shallow"
    out["new_crust_km"] = km if b == "divergent" else 0
    out["offset_km"] = km if b == "transform" else 0
    # seismic waves at the station
    p_arrives = s.station < P_SHADOW[0] or s.station > P_SHADOW[1]
    s_arrives = s.station < S_LIMIT
    out["p_arrives"], out["s_arrives"] = p_arrives, s_arrives
    out["station_km"] = int(_r(s.station / 360 * 2 * math.pi * 6371, 0))
    return out


def achieved_now(s: State, r: dict[str, Any]) -> list[str]:
    now = []
    if s.boundary == "subduction" and s.myr >= 5:
        now.append("subduction")
    if s.boundary == "collision" and r["mountain_km"] >= 5:
        now.append("mountains")
    seen = set(s.seen_boundaries) | ({s.boundary} if s.myr >= 5 else set())
    if len(seen) >= 3:
        now.append("compare")
    if set(LAYERS) <= set(s.inspected) | ({s.layer} if s.layer else set()):
        now.append("layers")
    if {"P", "S"} <= set(s.seen_waves) | ({s.wave} if s.view == "waves" else set()):
        now.append("waves")
    return now


def message(s: State, r: dict[str, Any]) -> str:
    if s.view == "layers":
        if s.layer is None:
            return "Click a layer of the Earth to inspect it."
        x = LAYERS[s.layer]
        return (
            f"{x['name']}: from {x['from_km']} to {x['to_km']} km deep, {x['state']}, about "
            f"{x['temp_c']} °C."
        )
    if s.view == "waves":
        kind = (
            "P waves push and pull the rock; they are the fastest and travel through solids and "
            "liquids"
            if s.wave == "P"
            else "S waves shake the rock side to side; they are slower and only travel through "
            "solids"
        )
        arrive = r["p_arrives"] if s.wave == "P" else r["s_arrives"]
        where = f"A seismometer {s.station}° ({r['station_km']} km) round the Earth"
        if arrive:
            return f"{kind}. {where} records them."
        if s.wave == "S":
            return f"{kind}. {where} records none: the liquid outer core stops S waves."
        return (
            f"{kind}. {where} is in the P-wave shadow zone: the core bends the waves away from it."
        )
    if s.myr == 0:
        return "Drag the Time slider or press Run to move the plates."
    lead = f"{s.myr} million years at 5 cm a year: "
    if s.boundary == "subduction":
        return (
            lead + f"{r['distance_km']} km of ocean floor has slid under the continent. The "
            f"denser ocean plate sinks into the mantle, leaving a {r['trench_km']:g} km deep "
            f"trench; rock melting above it feeds volcanoes up to {r['arc_km']:g} km high. "
            f"Earthquakes strike from the surface down to {r['slab_km']} km."
        )
    if s.boundary == "collision":
        return (
            lead + "neither continent can sink, so the crust crumples and thickens into "
            f"mountains {r['mountain_km']:g} km high, like the Himalayas. Earthquakes are "
            "shallow, and there are no volcanoes."
        )
    if s.boundary == "divergent":
        return (
            lead + f"the plates moved {r['distance_km']} km apart. Magma rises into the gap "
            "and cools into new ocean floor, building a mid-ocean ridge with volcanoes and "
            "shallow earthquakes."
        )
    return (
        lead + f"the plates slid {r['distance_km']} km past each other along the fault. No crust "
        "is made or destroyed and there are no volcanoes, but the plates stick and slip in "
        "shallow earthquakes, like on the San Andreas Fault."
    )


class TectonicsEngine:
    kind = "tectonics"
    title = "Plate tectonics and earthquakes"
    description = (
        "Move plates at four kinds of boundary, look inside the Earth, and follow seismic "
        "waves through it."
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
        allowed = Palette.model_validate(palette or {}).boundaries
        if s.boundary not in allowed:  # e.g. a fresh board on a lab without subduction
            s.boundary = allowed[0]
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
            "boundaries": [{"name": k, "label": v} for k, v in BOUNDARIES.items()],
            "layers": [{"key": k, **v} for k, v in LAYERS.items()],
            "tasks": [{"key": k, "label": v} for k, v in TASKS.items()],
        }

    def goal_count(self, goal: dict[str, Any]) -> int:
        return len(goal.get("tasks") or [])

    def summary(self, result: dict[str, Any], state: dict[str, Any]) -> tuple[str, str | None]:
        text = (
            f"{state.get('boundary', '?')} after {state.get('myr', 0)} Myr, "
            f"{len(state.get('inspected') or [])}/4 layers, "
            f"{len(result.get('achieved') or [])} task(s) done"
        )
        return text, None


register(TectonicsEngine())
