"""Physics lab engine: fluid pressure and buoyancy.

State: an object (material or custom density, volume), a liquid (or custom density) and a
pressure probe depth. The engine computes whether the object floats or sinks, how much of it is
below the surface, the buoyant force, and the hydrostatic pressure at the probe. Goal: a list of
tasks the student must experience at least once.
"""

from __future__ import annotations

import math
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.modules.labs.engines import EngineResult, register

G = 9.81
MATERIALS: dict[str, float] = {  # kg/m³
    "wood": 600,
    "ice": 917,
    "plastic": 950,
    "wax": 900,
    "rubber": 1100,
    "glass": 2500,
    "aluminium": 2700,
    "steel": 7850,
    "custom": 0,
}
LIQUIDS: dict[str, float] = {
    "fresh water": 1000,
    "salt water": 1025,
    "oil": 920,
    "honey": 1420,
    "custom": 0,
}
TASKS: dict[str, str] = {
    "float": "Make an object float",
    "sink": "Make an object sink",
    "half": "Find an object that floats about half submerged",
    "salt": "Compare fresh and salt water with the same object",
    "pressure": "Read a pressure of at least 10 kPa above the surface",
}
TANK_DEPTH_M = 2.0


class State(BaseModel):
    model_config = ConfigDict(extra="forbid")
    material: str = "wood"
    object_density: float = Field(default=600, ge=50, le=20_000)  # used when material == custom
    volume_l: float = Field(default=1.0, ge=0.1, le=50)
    liquid: str = "fresh water"
    liquid_density: float = Field(default=1000, ge=500, le=2000)  # used when liquid == custom
    probe_depth_m: float = Field(default=0.5, ge=0, le=TANK_DEPTH_M)
    tried_liquids: list[str] = Field(default_factory=list, max_length=10)  # for the "salt" task

    @model_validator(mode="after")
    def _known(self) -> State:
        if self.material not in MATERIALS:
            raise ValueError(f"Unknown material {self.material!r}.")
        if self.liquid not in LIQUIDS:
            raise ValueError(f"Unknown liquid {self.liquid!r}.")
        return self

    @property
    def rho_object(self) -> float:
        return self.object_density if self.material == "custom" else MATERIALS[self.material]

    @property
    def rho_liquid(self) -> float:
        return self.liquid_density if self.liquid == "custom" else LIQUIDS[self.liquid]


class Goal(BaseModel):
    model_config = ConfigDict(extra="forbid")
    tasks: list[str] = Field(
        default_factory=lambda: ["float", "sink", "salt", "pressure"], min_length=1, max_length=5
    )

    @model_validator(mode="after")
    def _known(self) -> Goal:
        for t in self.tasks:
            if t not in TASKS:
                raise ValueError(f"Unknown task {t!r}. Known: {', '.join(TASKS)}")
        return self


class Palette(BaseModel):
    """What the student may change."""

    model_config = ConfigDict(extra="forbid")
    materials: list[str] = Field(default_factory=lambda: [m for m in MATERIALS if m != "custom"])
    liquids: list[str] = Field(default_factory=lambda: [x for x in LIQUIDS if x != "custom"])
    allow_custom_density: bool = True


def _r(v: float, nd: int) -> float:
    """Half-up rounding, identical to the frontend's Math.floor(v * 10**nd + 0.5) / 10**nd."""
    f = 10.0**nd
    return math.floor(v * f + 0.5) / f


def compute(s: State) -> dict[str, Any]:
    rho_o, rho_l = s.rho_object, s.rho_liquid
    volume = s.volume_l / 1000  # m³
    mass = rho_o * volume
    weight = mass * G
    floats = rho_o < rho_l
    submerged_fraction = min(1.0, rho_o / rho_l)
    buoyant = rho_l * G * volume * submerged_fraction
    pressure = rho_l * G * s.probe_depth_m  # Pa above atmospheric
    return {
        "object_density": rho_o,
        "liquid_density": rho_l,
        "mass_kg": _r(mass, 3),
        "weight_n": _r(weight, 2),
        "floats": floats,
        "submerged_fraction": _r(submerged_fraction, 3),
        "buoyant_force_n": _r(buoyant, 2),
        "net_force_n": _r(buoyant - weight, 2),  # 0 when floating at rest
        "probe_depth_m": s.probe_depth_m,
        "pressure_kpa": _r(pressure / 1000, 2),
        "tank_depth_m": TANK_DEPTH_M,
    }


class BuoyancyEngine:
    kind = "buoyancy"
    title = "Fluid pressure and buoyancy"
    description = "Drop objects into liquids, change densities, and measure pressure at depth."

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
        return s.model_dump()

    def evaluate(
        self, state: dict[str, Any], goal: dict[str, Any], achieved: list[str]
    ) -> EngineResult:
        s = State.model_validate(state)
        g = Goal.model_validate(goal)
        r = compute(s)
        now: list[str] = []
        if r["floats"]:
            now.append("float")
        else:
            now.append("sink")
        if r["floats"] and 0.4 <= r["submerged_fraction"] <= 0.6:
            now.append("half")
        if {"fresh water", "salt water"} <= set(s.tried_liquids) | {s.liquid}:
            now.append("salt")
        if r["pressure_kpa"] >= 10:
            now.append("pressure")
        now = [t for t in now if t in g.tasks]
        done = sorted(set(achieved) | set(now))
        r["achieved"] = done
        r["tasks"] = g.tasks
        met = all(t in done for t in g.tasks)
        pct = round(r["submerged_fraction"] * 100)
        if r["floats"]:
            msg = (
                f"It floats with {pct}% under the surface: its density "
                f"({r['object_density']:.0f} kg/m³) is lower than the liquid's "
                f"({r['liquid_density']:.0f} kg/m³). Buoyant force {r['buoyant_force_n']} N "
                f"balances its weight {r['weight_n']} N."
            )
        else:
            msg = (
                f"It sinks: its density ({r['object_density']:.0f} kg/m³) is higher than "
                f"the liquid's ({r['liquid_density']:.0f} kg/m³). Buoyant force "
                f"{r['buoyant_force_n']} N is less than its weight {r['weight_n']} N."
            )
        msg += f" Pressure at {s.probe_depth_m:.2f} m: {r['pressure_kpa']} kPa."
        if met:
            msg += " Every task done!"
        return EngineResult(result=r, message=msg, goal_met=met, achieved=now)

    def options(self) -> dict[str, Any]:
        return {
            "materials": [{"name": m, "density": d} for m, d in MATERIALS.items() if m != "custom"],
            "liquids": [{"name": x, "density": d} for x, d in LIQUIDS.items() if x != "custom"],
            "tasks": [{"key": k, "label": v} for k, v in TASKS.items()],
            "tank_depth_m": TANK_DEPTH_M,
        }

    def goal_count(self, goal: dict[str, Any]) -> int:
        return len(goal.get("tasks") or [])

    def summary(self, result: dict[str, Any], state: dict[str, Any]) -> tuple[str, str | None]:
        verb = "floats" if result.get("floats") else "sinks"
        text = (
            f"{state.get('material', '?')} in {state.get('liquid', '?')}: {verb}, "
            f"{result.get('pressure_kpa', 0)} kPa at probe, "
            f"{len(result.get('achieved') or [])} task(s) done"
        )
        return text, None


register(BuoyancyEngine())
