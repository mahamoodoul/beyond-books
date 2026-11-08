"""Astronomy lab engine: the solar system, the Moon, eclipses and seasons.

State: days since the March equinox (moves every planet), the Moon's angle around Earth
(0 = between Earth and Sun, a new moon), Earth's axial tilt and the latitude the student
watches. Simplified on purpose and labelled as such: circular orbits, real orbital periods,
distances not to scale, and the Moon's orbit drawn flat (in reality it is tilted about 5°,
which is why not every new moon gives an eclipse).
"""

from __future__ import annotations

import math
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.modules.labs.engines import EngineResult, register

YEAR = 365.25
PLANETS: dict[str, float] = {  # orbital period in Earth days
    "Mercury": 87.97,
    "Venus": 224.7,
    "Earth": YEAR,
    "Mars": 686.98,
}
SEASONS = ("spring", "summer", "autumn", "winter")  # northern; each centred on its equinox/solstice
ECLIPSE_WINDOW = 5  # degrees either side of perfect alignment
MAX_DAYS = 1461  # four years
TASKS: dict[str, str] = {
    "solar_eclipse": "Line up a solar eclipse",
    "lunar_eclipse": "Line up a lunar eclipse",
    "periods": "Run time for a full Earth year and compare the planets",
    "seasons": "Visit northern summer and winter",
    "no_tilt": "Set Earth's tilt to 0° and see what happens to the seasons",
}


class State(BaseModel):
    model_config = ConfigDict(extra="forbid")
    view: Literal["system", "moon", "seasons"] = "system"
    days: int = Field(default=0, ge=0, le=MAX_DAYS)
    moon_angle: int = Field(default=90, ge=0, le=359)
    tilt: float = Field(default=23.4, ge=0, le=45)
    latitude: int = Field(default=60, ge=0, le=80)
    seen_seasons: list[Literal["spring", "summer", "autumn", "winter"]] = Field(
        default_factory=list, max_length=4
    )


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
    allow_tilt: bool = True  # students may change Earth's tilt


def _r(v: float, nd: int) -> float:
    """Half-up rounding, identical to the frontend's Math.floor(v * 10**nd + 0.5) / 10**nd."""
    f = 10.0**nd
    return math.floor(v * f + 0.5) / f


def _orbits(days: int, period: float) -> int:
    """Whole orbits completed, counted to the nearest day (day 365 is one Earth year)."""
    return math.floor((days + 0.5) / period)


def _times(n: int) -> str:
    return "once" if n == 1 else f"{n} times"


def phase_name(a: int) -> str:
    if a <= ECLIPSE_WINDOW or a >= 360 - ECLIPSE_WINDOW:
        return "new moon"
    if a < 85:
        return "waxing crescent"
    if a <= 95:
        return "first quarter"
    if a < 175:
        return "waxing gibbous"
    if a <= 185:
        return "full moon"
    if a < 265:
        return "waning gibbous"
    if a <= 275:
        return "last quarter"
    return "waning crescent"


def compute(s: State) -> dict[str, Any]:
    planets = [
        {
            "name": name,
            "period_days": period,
            "angle": _r((360 * s.days / period) % 360, 1),
            "orbits": _orbits(s.days, period),
        }
        for name, period in PLANETS.items()
    ]
    earth_angle = (360 * s.days / YEAR) % 360
    a = s.moon_angle
    if a <= ECLIPSE_WINDOW or a >= 360 - ECLIPSE_WINDOW:
        eclipse = "solar"
    elif abs(a - 180) <= ECLIPSE_WINDOW:
        eclipse = "lunar"
    else:
        eclipse = None
    decl = s.tilt * math.sin(math.radians(earth_angle))
    x = -math.tan(math.radians(s.latitude)) * math.tan(math.radians(decl))
    day_hours = 24 / math.pi * math.acos(max(-1.0, min(1.0, x)))
    noon = max(0.0, 90 - s.latitude + decl)
    return {
        "planets": planets,
        "earth_angle": _r(earth_angle, 1),
        "years": _orbits(s.days, YEAR),
        "moon_phase": phase_name(a),
        "illuminated": _r((1 - math.cos(math.radians(a))) / 2, 2),
        "eclipse": eclipse,
        "season": SEASONS[int(((earth_angle + 45) % 360) // 90)],
        "declination": _r(decl, 1),
        "day_hours": _r(day_hours, 1),
        "noon_sun": _r(noon, 1),
    }


def achieved_now(s: State, r: dict[str, Any]) -> list[str]:
    now = []
    if r["eclipse"] == "solar":
        now.append("solar_eclipse")
    if r["eclipse"] == "lunar":
        now.append("lunar_eclipse")
    if r["years"] >= 1:
        now.append("periods")
    seen = set(s.seen_seasons) | ({r["season"]} if s.tilt >= 10 else set())
    if s.tilt >= 10 and {"summer", "winter"} <= seen:
        now.append("seasons")
    if s.tilt == 0:
        now.append("no_tilt")
    return now


def message(s: State, r: dict[str, Any]) -> str:
    p = {x["name"]: x["orbits"] for x in r["planets"]}
    if s.view == "system" and s.days == 0:
        msg = (
            "Day 0, the March equinox. Press Play or drag the Time slider and watch the "
            "planets go round the Sun."
        )
    elif s.view == "system":
        msg = (
            f"Day {s.days}: Earth has gone round the Sun {_times(p['Earth'])}. In the same "
            f"time Mercury went round {_times(p['Mercury'])}, Venus {_times(p['Venus'])} and "
            f"Mars {_times(p['Mars'])}: the closer to the Sun, the shorter the year."
        )
    elif s.view == "moon":
        msg = f"The Moon is a {r['moon_phase']} ({int(_r(r['illuminated'] * 100, 0))} % lit)."
        if r["eclipse"] == "solar":
            msg += (
                " Solar eclipse! The Moon is exactly between the Sun and Earth, and its "
                "shadow falls on Earth."
            )
        elif r["eclipse"] == "lunar":
            msg += (
                " Lunar eclipse! Earth is exactly between the Sun and the Moon, and Earth's "
                "shadow turns the Moon dark red."
            )
        else:
            msg += " Drag the Moon in line with the Sun and Earth to make an eclipse."
    elif s.tilt == 0:
        msg = (
            "With no tilt there are no seasons: the Sun is equally high all year, and day and "
            "night last 12 h everywhere."
        )
    else:
        msg = (
            f"At {s.latitude}° N it is {r['season']}: the Sun is {r['noon_sun']:g}° high at "
            f"noon and the day lasts {r['day_hours']:g} h. The tilt ({s.tilt:g}°), not the "
            "distance to the Sun, makes the seasons."
        )
    return msg


class OrbitsEngine:
    kind = "orbits"
    title = "Solar system and orbits"
    description = (
        "Run time for the planets, line up eclipses with the Moon, and tilt Earth to see why "
        "we have seasons."
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
        if not Palette.model_validate(palette or {}).allow_tilt:
            s.tilt = 23.4
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
            "planets": [{"name": n, "period_days": p} for n, p in PLANETS.items()],
            "tasks": [{"key": k, "label": v} for k, v in TASKS.items()],
        }

    def goal_count(self, goal: dict[str, Any]) -> int:
        return len(goal.get("tasks") or [])

    def summary(self, result: dict[str, Any], state: dict[str, Any]) -> tuple[str, str | None]:
        text = (
            f"day {state.get('days', 0)}, {result.get('moon_phase', '?')}, "
            f"tilt {state.get('tilt', '?')}°, {len(result.get('achieved') or [])} task(s) done"
        )
        return text, None


register(OrbitsEngine())
