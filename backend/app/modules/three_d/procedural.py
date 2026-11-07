"""Allowlisted procedural generators (design §7.1-A).

The frontend runtime implements exactly these generators; the backend validates that a scene only
references a known generator, known params with sane bounds, and component mesh names the
generator actually produces. Adding a generator = add it here AND in
frontend/src/features/three-d/runtime/procedural.tsx, with tests.
"""

from dataclasses import dataclass
from typing import Any

from app.modules.three_d.contracts import ProceduralSource

_PLANETS = ["mercury", "venus", "earth", "mars", "jupiter", "saturn", "uranus", "neptune"]


@dataclass(frozen=True)
class Param:
    kind: type
    lo: float | None = None
    hi: float | None = None


@dataclass(frozen=True)
class Generator:
    name: str
    description: str
    params: dict[str, Param]

    def components(self, params: dict[str, Any]) -> list[str]:
        if self.name == "solar_system":
            return ["sun", *_PLANETS[: int(params.get("planet_count", 4))]]
        if self.name == "atom":
            n = int(params.get("electron_count", 3))
            return ["nucleus", *[f"electron_{i}" for i in range(1, n + 1)]]
        if self.name == "geometry_solids":
            return ["cube", "sphere", "cylinder", "cone", "tetrahedron"]
        return []


GENERATORS: dict[str, Generator] = {
    g.name: g
    for g in (
        Generator(
            "solar_system",
            "Sun and planets on orbits (not to scale).",
            {"planet_count": Param(int, 1, 8), "show_orbits": Param(bool)},
        ),
        Generator(
            "atom",
            "Bohr-style atom: nucleus with orbiting electrons.",
            {"electron_count": Param(int, 1, 12)},
        ),
        Generator("geometry_solids", "Basic 3D solids side by side.", {}),
    )
}


def validate_procedural(src: ProceduralSource) -> tuple[list[str], list[str]]:
    """Return (errors, component mesh names produced)."""
    gen = GENERATORS.get(src.generator)
    if gen is None:
        return [f"unknown procedural generator '{src.generator}'"], []
    errors = []
    for key, value in src.params.items():
        spec = gen.params.get(key)
        if spec is None:
            errors.append(f"{src.generator}: unknown param '{key}'")
            continue
        if spec.kind is bool and not isinstance(value, bool):
            errors.append(f"{src.generator}.{key} must be a boolean")
        elif spec.kind is int and (isinstance(value, bool) or not isinstance(value, int)):
            errors.append(f"{src.generator}.{key} must be an integer")
        elif (
            spec.lo is not None
            and spec.hi is not None
            and isinstance(value, int | float)
            and not spec.lo <= value <= spec.hi
        ):
            errors.append(f"{src.generator}.{key} must be between {spec.lo:g} and {spec.hi:g}")
    return errors, ([] if errors else gen.components(src.params))
