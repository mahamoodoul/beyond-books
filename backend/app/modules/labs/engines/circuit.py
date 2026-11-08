"""Circuit lab engine: wraps the DC circuit solver in app/modules/labs/circuit.py."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.core.errors import ConflictError
from app.modules.labs.circuit import Circuit, evaluate
from app.modules.labs.engines import EngineResult, register


class Goal(BaseModel):
    model_config = ConfigDict(extra="forbid")
    min_lit: int = Field(default=1, ge=1, le=10)
    require_switch: bool = False


class Palette(BaseModel):
    model_config = ConfigDict(extra="forbid")
    battery: int = Field(default=1, ge=1, le=3)
    bulb: int = Field(default=2, ge=1, le=6)
    switch: int = Field(default=1, ge=0, le=4)


class CircuitEngine:
    kind = "circuit"
    title = "Electric circuit"
    description = "Battery, bulbs, switches and wires. Build a loop and see what lights up."

    def default_goal(self) -> dict[str, Any]:
        return Goal().model_dump()

    def default_palette(self) -> dict[str, Any]:
        return Palette().model_dump()

    def validate_goal(self, goal: dict[str, Any]) -> dict[str, Any]:
        return Goal.model_validate(goal).model_dump()

    def validate_palette(self, palette: dict[str, Any]) -> dict[str, Any]:
        return Palette.model_validate(palette).model_dump()

    def validate_state(self, state: dict[str, Any], palette: dict[str, Any]) -> dict[str, Any]:
        circuit = Circuit.model_validate(state)
        p = Palette.model_validate(palette)
        for kind in ("battery", "bulb", "switch"):
            if circuit.count(kind) > getattr(p, kind):
                raise ConflictError(f"This lab allows at most {getattr(p, kind)} {kind}(s).")
        return circuit.model_dump()

    def evaluate(
        self, state: dict[str, Any], goal: dict[str, Any], achieved: list[str]
    ) -> EngineResult:
        circuit = Circuit.model_validate(state)
        g = Goal.model_validate(goal)
        ev = evaluate(circuit)
        met = len(ev.lit) >= g.min_lit and (
            not g.require_switch or any(p.type == "switch" and p.closed for p in circuit.parts)
        )
        return EngineResult(
            result=ev.model_dump(),
            message=ev.message,
            goal_met=met,
            achieved=["lit"] if met else [],
        )

    def options(self) -> dict[str, Any]:
        return {"parts": ["battery", "bulb", "switch"]}

    def goal_count(self, goal: dict[str, Any]) -> int:
        return 1

    def summary(self, result: dict[str, Any], state: dict[str, Any]) -> tuple[str, str | None]:
        parts = len(state.get("parts") or [])
        wires = len(state.get("wires") or [])
        lit = len(result.get("lit") or [])
        text = f"{parts} parts, {wires} wires, {lit} lit"
        if result.get("short_circuit"):
            return text, "short circuit"
        if parts and not result.get("has_battery"):
            return text, "no battery"
        return text, None


register(CircuitEngine())
