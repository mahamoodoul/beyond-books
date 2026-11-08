"""Chemistry lab engine: build molecules from atoms and bonds.

State: atoms (element + position) and bonds (two atom ids + order 1..3). The engine checks
valence (how many bonds each element wants), recognises the molecule by its formula, names it,
gives the VSEPR shape of simple molecules, and tells the student what is still missing.
Goal: a list of target formulas; each is "achieved" once the student has built it correctly.
"""

from __future__ import annotations

from collections import Counter
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.errors import ConflictError
from app.modules.labs.engines import EngineResult, register

VALENCE: dict[str, int] = {"H": 1, "O": 2, "N": 3, "C": 4, "Cl": 1, "S": 2}
NAMES: dict[str, str] = {
    "H2O": "water",
    "CO2": "carbon dioxide",
    "CH4": "methane",
    "NH3": "ammonia",
    "O2": "oxygen gas",
    "N2": "nitrogen gas",
    "H2": "hydrogen gas",
    "Cl2": "chlorine gas",
    "HCl": "hydrogen chloride",
    "C2H6": "ethane",
    "C2H4": "ethene",
    "C2H2": "ethyne",
    "CH3OH": "methanol",
    "H2O2": "hydrogen peroxide",
    "H2S": "hydrogen sulfide",
    "CO": "carbon monoxide",
    "SO2": "sulfur dioxide",
    "NH2OH": "hydroxylamine",
}
# VSEPR for one central atom: (bonded neighbours, lone pairs) -> shape
SHAPES: dict[tuple[int, int], str] = {
    (2, 0): "linear",
    (2, 1): "bent",
    (2, 2): "bent",
    (3, 0): "trigonal planar",
    (3, 1): "trigonal pyramidal",
    (4, 0): "tetrahedral",
}
MAX_ATOMS = 20


class Atom(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1, max_length=32, pattern=r"^[A-Za-z0-9_-]+$")
    element: str
    x: float = Field(default=0, ge=-10_000, le=10_000)
    y: float = Field(default=0, ge=-10_000, le=10_000)

    @model_validator(mode="after")
    def _known(self) -> Atom:
        if self.element not in VALENCE:
            raise ValueError(f"Unknown element {self.element!r}.")
        return self


class Bond(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1, max_length=32, pattern=r"^[A-Za-z0-9_-]+$")
    a: str
    b: str
    order: int = Field(default=1, ge=1, le=3)


class Molecule(BaseModel):
    model_config = ConfigDict(extra="forbid")
    atoms: list[Atom] = Field(default_factory=list, max_length=MAX_ATOMS)
    bonds: list[Bond] = Field(default_factory=list, max_length=MAX_ATOMS * 2)

    @model_validator(mode="after")
    def _consistent(self) -> Molecule:
        ids = [a.id for a in self.atoms]
        if len(set(ids)) != len(ids):
            raise ValueError("Atom ids must be unique.")
        known = set(ids)
        pairs: set[frozenset[str]] = set()
        for b in self.bonds:
            if b.a not in known or b.b not in known:
                raise ValueError(f"Bond {b.id} connects an atom that does not exist.")
            if b.a == b.b:
                raise ValueError(f"Bond {b.id} connects an atom to itself.")
            key = frozenset((b.a, b.b))
            if key in pairs:
                raise ValueError("Two atoms can share only one bond; raise its order instead.")
            pairs.add(key)
        return self


class Goal(BaseModel):
    model_config = ConfigDict(extra="forbid")
    targets: list[str] = Field(
        default_factory=lambda: ["H2O", "CO2", "CH4"], min_length=1, max_length=8
    )

    @model_validator(mode="after")
    def _known(self) -> Goal:
        for t in self.targets:
            if t not in NAMES:
                raise ValueError(f"Unknown target {t!r}. Known: {', '.join(sorted(NAMES))}")
        return self


class Palette(BaseModel):
    model_config = ConfigDict(extra="forbid")
    H: int = Field(default=8, ge=0, le=20)
    O: int = Field(default=4, ge=0, le=10)  # noqa: E741
    C: int = Field(default=3, ge=0, le=10)
    N: int = Field(default=2, ge=0, le=10)
    Cl: int = Field(default=2, ge=0, le=10)
    S: int = Field(default=0, ge=0, le=10)


def formula(atoms: list[Atom]) -> str:
    """Hill order: C first, then H, then the rest alphabetically; no C -> alphabetical."""
    counts = Counter(a.element for a in atoms)
    if "C" in counts:
        order = ["C", "H"] + sorted(e for e in counts if e not in ("C", "H"))
    else:
        order = sorted(counts)
    return "".join(f"{e}{counts[e] if counts[e] > 1 else ''}" for e in order if e in counts)


def _components(m: Molecule) -> int:
    parent = {a.id: a.id for a in m.atoms}

    def find(x: str) -> str:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for b in m.bonds:
        ra, rb = find(b.a), find(b.b)
        if ra != rb:
            parent[ra] = rb
    return len({find(a.id) for a in m.atoms})


def analyse(m: Molecule) -> dict[str, Any]:
    used: Counter[str] = Counter()
    for b in m.bonds:
        used[b.a] += b.order
        used[b.b] += b.order
    over = [a.id for a in m.atoms if used[a.id] > VALENCE[a.element]]
    missing = {
        a.id: VALENCE[a.element] - used[a.id] for a in m.atoms if used[a.id] < VALENCE[a.element]
    }
    complete = bool(m.atoms) and not over and not missing and _components(m) == 1
    f = formula(m.atoms) if m.atoms else ""
    name = NAMES.get(f) if complete else None
    shape = None
    if complete and len(m.atoms) >= 3:
        # central atom = the one with most neighbours; lone pairs from its valence electrons
        neighbours: Counter[str] = Counter()
        for b in m.bonds:
            neighbours[b.a] += 1
            neighbours[b.b] += 1
        central_id, n = neighbours.most_common(1)[0]
        central = next(a for a in m.atoms if a.id == central_id)
        valence_electrons = {"H": 1, "C": 4, "N": 5, "O": 6, "Cl": 7, "S": 6}[central.element]
        lone_pairs = max(0, (valence_electrons - used[central_id]) // 2)
        shape = SHAPES.get((n, lone_pairs))
    return {
        "formula": f,
        "name": name,
        "complete": complete,
        "connected": _components(m) <= 1,
        "over_bonded": over,
        "missing": missing,  # atom id -> bonds still needed
        "shape": shape,
        "bond_orders": {b.id: b.order for b in m.bonds},
    }


class MoleculeEngine:
    kind = "molecules"
    title = "Molecular bonding"
    description = (
        "Drag atoms together and bond them. Build water, carbon dioxide, methane and more."
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
        m = Molecule.model_validate(state)
        p = Palette.model_validate(palette)
        counts = Counter(a.element for a in m.atoms)
        for element, n in counts.items():
            if n > getattr(p, element):
                raise ConflictError(
                    f"This lab allows at most {getattr(p, element)} {element} atom(s)."
                )
        return m.model_dump()

    def evaluate(
        self, state: dict[str, Any], goal: dict[str, Any], achieved: list[str]
    ) -> EngineResult:
        m = Molecule.model_validate(state)
        g = Goal.model_validate(goal)
        info = analyse(m)
        now = [info["formula"]] if info["complete"] and info["formula"] in g.targets else []
        done = sorted(set(achieved) | set(now))
        info["achieved"] = done
        info["targets"] = g.targets
        met = all(t in done for t in g.targets)
        if not m.atoms:
            msg = (
                "Add atoms from the palette, then bond them by clicking one atom and then another."
            )
        elif info["over_bonded"]:
            msg = "An atom has too many bonds. Click a bond to lower its order, or remove one."
        elif not info["connected"]:
            msg = "All atoms must be joined into one molecule. Bond the loose atoms."
        elif info["missing"]:
            need = sum(info["missing"].values())
            msg = (
                f"Not finished: {need} more bond{'s' if need != 1 else ''} needed. "
                "Some atoms still want bonds."
            )
        elif info["name"]:
            msg = f"You built {info['formula']} ({info['name']})"
            msg += f", shape: {info['shape']}." if info["shape"] else "."
            if info["formula"] in g.targets:
                msg += " Target reached." if not met else " Every target built!"
        else:
            msg = f"{info['formula']} is a valid molecule, but not one of the targets."
        return EngineResult(result=info, message=msg, goal_met=met, achieved=now)

    def options(self) -> dict[str, Any]:
        return {
            "targets": [{"formula": f, "name": n} for f, n in NAMES.items()],
            "elements": [{"symbol": e, "valence": v} for e, v in VALENCE.items()],
        }

    def goal_count(self, goal: dict[str, Any]) -> int:
        return len(goal.get("targets") or [])

    def summary(self, result: dict[str, Any], state: dict[str, Any]) -> tuple[str, str | None]:
        atoms = len(state.get("atoms") or [])
        f = result.get("formula") or "nothing yet"
        done = len(result.get("achieved") or [])
        text = f"{atoms} atoms, building {f}, {done} target(s) built"
        if result.get("over_bonded"):
            return text, "too many bonds"
        return text, None


register(MoleculeEngine())
