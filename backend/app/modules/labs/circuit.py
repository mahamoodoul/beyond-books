"""A small DC circuit: batteries, bulbs, switches and wires, evaluated with nodal analysis.

The frontend runs the same evaluation (frontend/src/features/labs/circuit.ts) for instant
feedback; this copy is the one whose result is stored, so the two must agree. Keep the rules in
sync and covered by the same test cases.

Model: every part has two terminals, ``<part id>:a`` and ``<part id>:b``. Wires join terminals
(zero resistance). A closed switch joins its own terminals; an open one does not. A bulb is a
1 Ω resistor between its terminals. A battery is an ideal 1 V source, ``a`` positive. Terminals
joined by wires or closed switches form one electrical node. Modified nodal analysis gives the
node voltages; the current through a bulb is the voltage across it. A bulb with current flowing
is lit, its brightness relative to a single bulb across one battery.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

PartType = Literal["battery", "bulb", "switch"]
BULB_OHMS = 1.0
BATTERY_VOLTS = 1.0
LIT_THRESHOLD = 1e-6
G_MIN = (
    1e-9  # leak to ground on every node: keeps unconnected parts from making the system singular
)
MAX_PARTS = 30
MAX_WIRES = 80


class Part(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1, max_length=32, pattern=r"^[A-Za-z0-9_-]+$")
    type: PartType
    x: float = Field(default=0, ge=-10_000, le=10_000)
    y: float = Field(default=0, ge=-10_000, le=10_000)
    closed: bool = True  # switches only


class Wire(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1, max_length=32, pattern=r"^[A-Za-z0-9_-]+$")
    a: str = Field(max_length=40)  # "<part id>:a" or "<part id>:b"
    b: str = Field(max_length=40)


class Circuit(BaseModel):
    model_config = ConfigDict(extra="forbid")
    parts: list[Part] = Field(default_factory=list, max_length=MAX_PARTS)
    wires: list[Wire] = Field(default_factory=list, max_length=MAX_WIRES)

    @model_validator(mode="after")
    def _consistent(self) -> Circuit:
        ids = [p.id for p in self.parts]
        if len(set(ids)) != len(ids):
            raise ValueError("Part ids must be unique.")
        wire_ids = [w.id for w in self.wires]
        if len(set(wire_ids)) != len(wire_ids):
            raise ValueError("Wire ids must be unique.")
        terminals = {f"{p.id}:{t}" for p in self.parts for t in ("a", "b")}
        for w in self.wires:
            if w.a not in terminals or w.b not in terminals:
                raise ValueError(f"Wire {w.id} connects to a terminal that does not exist.")
            if w.a == w.b:
                raise ValueError(f"Wire {w.id} connects a terminal to itself.")
        return self

    def count(self, kind: PartType) -> int:
        return sum(1 for p in self.parts if p.type == kind)


class Evaluation(BaseModel):
    has_battery: bool
    short_circuit: bool
    lit: list[str]  # bulb ids with current flowing
    brightness: dict[str, float]  # bulb id -> 0..1
    closed_loop: bool  # at least one bulb carries current
    message: str


class _UnionFind:
    def __init__(self) -> None:
        self.parent: dict[str, str] = {}

    def find(self, x: str) -> str:
        self.parent.setdefault(x, x)
        while self.parent[x] != x:
            self.parent[x] = self.parent[self.parent[x]]
            x = self.parent[x]
        return x

    def union(self, a: str, b: str) -> None:
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.parent[ra] = rb


def _solve(matrix: list[list[float]], rhs: list[float]) -> list[float] | None:
    """Gaussian elimination with partial pivoting; None when singular."""
    n = len(rhs)
    a = [row[:] + [rhs[i]] for i, row in enumerate(matrix)]
    for col in range(n):
        pivot = max(range(col, n), key=lambda r: abs(a[r][col]))
        if abs(a[pivot][col]) < 1e-12:
            return None
        a[col], a[pivot] = a[pivot], a[col]
        for r in range(n):
            if r != col and a[r][col] != 0:
                f = a[r][col] / a[col][col]
                for c in range(col, n + 1):
                    a[r][c] -= f * a[col][c]
    return [a[i][n] / a[i][i] for i in range(n)]


def evaluate(circuit: Circuit) -> Evaluation:
    uf = _UnionFind()
    for p in circuit.parts:
        uf.find(f"{p.id}:a")
        uf.find(f"{p.id}:b")
        if p.type == "switch" and p.closed:
            uf.union(f"{p.id}:a", f"{p.id}:b")
    for w in circuit.wires:
        uf.union(w.a, w.b)

    batteries = [p for p in circuit.parts if p.type == "battery"]
    bulbs = [p for p in circuit.parts if p.type == "bulb"]
    off = {b.id: 0.0 for b in bulbs}
    if not batteries:
        return Evaluation(
            has_battery=False,
            short_circuit=False,
            lit=[],
            brightness=off,
            closed_loop=False,
            message="Add a battery to power the circuit.",
        )

    def node(t: str) -> str:
        return uf.find(t)

    if any(node(f"{b.id}:a") == node(f"{b.id}:b") for b in batteries):
        return Evaluation(
            has_battery=True,
            short_circuit=True,
            lit=[],
            brightness=off,
            closed_loop=False,
            message=(
                "Short circuit! A wire joins the battery's + straight to its −, so the current "
                "takes that shortcut and never reaches the bulb. Remove that wire so the only "
                "way round is through the bulb."
            ),
        )

    # Modified nodal analysis. Unknowns: voltages of every node except ground, then one current
    # per battery. Ground = the negative terminal of the first battery.
    ground = node(f"{batteries[0].id}:b")
    nodes = sorted({node(t) for p in circuit.parts for t in (f"{p.id}:a", f"{p.id}:b")} - {ground})
    index = {n: i for i, n in enumerate(nodes)}
    n_nodes, n_src = len(nodes), len(batteries)
    size = n_nodes + n_src
    m = [[0.0] * size for _ in range(size)]
    rhs = [0.0] * size
    g = 1.0 / BULB_OHMS
    for i in range(n_nodes):
        m[i][i] += G_MIN
    for b in bulbs:
        na, nb = node(f"{b.id}:a"), node(f"{b.id}:b")
        if na == nb:
            continue
        for x, y in ((na, nb), (nb, na)):
            if x in index:
                m[index[x]][index[x]] += g
                if y in index:
                    m[index[x]][index[y]] -= g
    for k, bat in enumerate(batteries):
        row = n_nodes + k
        pos, neg = node(f"{bat.id}:a"), node(f"{bat.id}:b")
        if pos in index:
            m[index[pos]][row] += 1.0
            m[row][index[pos]] += 1.0
        if neg in index:
            m[index[neg]][row] -= 1.0
            m[row][index[neg]] -= 1.0
        rhs[row] = BATTERY_VOLTS
    solution = _solve(m, rhs) if size else []
    if solution is None:
        return Evaluation(
            has_battery=True,
            short_circuit=True,
            lit=[],
            brightness=off,
            closed_loop=False,
            message=(
                "The batteries are connected against each other, so they cancel out. Turn one "
                "around so both + ends point the same way."
            ),
        )
    volts = {n: solution[i] for n, i in index.items()}
    volts[ground] = 0.0
    brightness: dict[str, float] = {}
    for b in bulbs:
        va, vb = volts.get(node(f"{b.id}:a"), 0.0), volts.get(node(f"{b.id}:b"), 0.0)
        current = abs(va - vb) / BULB_OHMS
        brightness[b.id] = round(min(1.0, current / (BATTERY_VOLTS / BULB_OHMS)), 3)
    lit = [b.id for b in bulbs if brightness[b.id] > LIT_THRESHOLD]
    if not lit:
        open_switch = any(p.type == "switch" and not p.closed for p in circuit.parts)
        msg = (
            "The switch is open: close it to complete the loop."
            if open_switch and bulbs
            else "No complete loop: current must go from + through a bulb back to −."
            if bulbs
            else "Add a bulb and connect it in the loop."
        )
        return Evaluation(
            has_battery=True,
            short_circuit=False,
            lit=[],
            brightness=brightness,
            closed_loop=False,
            message=msg,
        )
    dim = any(brightness[b] < 0.9 for b in lit)
    msg = f"{len(lit)} bulb{'s' if len(lit) != 1 else ''} lit."
    if dim:
        msg += " Some are dim: bulbs in series share the battery's voltage."
    return Evaluation(
        has_battery=True,
        short_circuit=False,
        lit=lit,
        brightness=brightness,
        closed_loop=True,
        message=msg,
    )
