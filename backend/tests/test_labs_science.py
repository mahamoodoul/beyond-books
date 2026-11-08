"""Science lab engines: breathing (respiration), orbits (astronomy) and plate tectonics.
The frontend ports (frontend/src/features/labs/engines/*.test.ts) assert the same cases."""

from __future__ import annotations

from collections.abc import Callable

import pytest
from fastapi.testclient import TestClient

from app.modules.labs.engines import get_engine

Login = Callable[..., TestClient]


# ----------------------------------------------------------- respiration
def test_respiration_engine_ventilation_saturation_and_tasks() -> None:
    e = get_engine("respiration")
    goal = e.default_goal()
    assert goal["tasks"] == ["inhale", "exhale", "rate", "exercise", "trace"]
    rest = e.validate_state({"phase": "in"}, e.default_palette())
    r = e.evaluate(rest, goal, [])
    assert r.result["minute_ventilation_l"] == 6.0
    assert r.result["alveolar_ventilation_l"] == 4.2
    assert r.result["o2_uptake_l"] == 0.25 and r.result["saturation"] == 98.0
    assert r.result["co2"] == "normal" and r.achieved == ["inhale"]
    assert "diaphragm contracts" in r.message and "stays at 98 %" in r.message

    # running at resting breathing: not enough oxygen
    run = {**rest, "phase": "out", "activity": "run", "seen": ["in"]}
    r2 = e.evaluate(run, goal, ["inhale"])
    assert r2.result["saturation"] == 70.0 and r2.result["co2"] == "rising"
    assert set(r2.achieved) == {"inhale", "exhale"} and "exercise" not in r2.achieved

    # breathing fast and deep while running: enough
    fast = {**run, "rate": 30, "depth_l": 1.3, "view": "alveolus", "traced": True}
    r3 = e.evaluate(fast, goal, ["inhale", "exhale"])
    assert r3.result["o2_uptake_l"] == 2.07 and r3.result["saturation"] == 98.0
    assert set(r3.achieved) >= {"rate", "exercise", "trace"} and r3.goal_met

    # hyperventilating at rest
    r4 = e.evaluate({**rest, "rate": 40, "depth_l": 1.5}, goal, [])
    assert r4.result["co2"] == "low" and "dizzy" in r4.message


def test_respiration_engine_rejects_bad_input() -> None:
    e = get_engine("respiration")
    with pytest.raises(ValueError):
        e.validate_state({"rate": 80}, e.default_palette())
    assert e.validate_state({"activity": "run"}, {"activities": ["walk"]})["activity"] == "walk"
    with pytest.raises(ValueError):
        e.validate_goal({"tasks": ["fly"]})


# ---------------------------------------------------------------- orbits
def test_orbits_engine_periods_eclipses_and_seasons() -> None:
    e = get_engine("orbits")
    goal = e.default_goal()
    assert goal["tasks"] == ["solar_eclipse", "lunar_eclipse", "periods", "seasons", "no_tilt"]

    year = e.evaluate(e.validate_state({"days": 365}, {}), goal, [])
    orbits = {p["name"]: p["orbits"] for p in year.result["planets"]}
    assert orbits == {"Mercury": 4, "Venus": 1, "Earth": 1, "Mars": 0}
    assert year.achieved == ["periods"] and "Mercury went round 4 times" in year.message

    solar = e.evaluate(e.validate_state({"view": "moon", "moon_angle": 357}, {}), goal, [])
    assert solar.result["eclipse"] == "solar" and solar.result["moon_phase"] == "new moon"
    assert solar.achieved == ["solar_eclipse"] and "Solar eclipse!" in solar.message
    lunar = e.evaluate(e.validate_state({"view": "moon", "moon_angle": 184}, {}), goal, [])
    assert lunar.result["eclipse"] == "lunar" and lunar.result["illuminated"] == 1.0
    quarter = e.evaluate(e.validate_state({"view": "moon", "moon_angle": 90}, {}), goal, [])
    assert quarter.result["eclipse"] is None and quarter.result["moon_phase"] == "first quarter"
    assert "(50 % lit)" in quarter.message

    june = {"view": "seasons", "days": 91, "latitude": 60}
    r = e.evaluate(e.validate_state(june, {}), goal, [])
    assert r.result["season"] == "summer" and r.result["declination"] == 23.4
    assert r.result["day_hours"] == 18.5 and r.result["noon_sun"] == 53.4
    assert "seasons" not in r.achieved  # winter not visited yet
    dec = {**june, "days": 274, "seen_seasons": ["summer"]}
    r2 = e.evaluate(e.validate_state(dec, {}), goal, [])
    assert r2.result["season"] == "winter" and r2.result["day_hours"] == 5.5
    assert "seasons" in r2.achieved

    flat = e.evaluate(e.validate_state({**june, "tilt": 0}, {}), goal, [])
    assert flat.result["day_hours"] == 12.0 and "no_tilt" in flat.achieved
    assert "no seasons" in flat.message
    # the teacher can lock the tilt
    assert e.validate_state({"tilt": 0}, {"allow_tilt": False})["tilt"] == 23.4


# ------------------------------------------------------------- tectonics
def test_tectonics_engine_boundaries_layers_and_waves() -> None:
    e = get_engine("tectonics")
    goal = e.default_goal()
    assert goal["tasks"] == ["subduction", "mountains", "compare", "layers", "waves"]
    ev = lambda st, done=None: e.evaluate(e.validate_state(st, {}), goal, done or [])  # noqa: E731

    sub = ev({"boundary": "subduction", "myr": 6})
    assert sub.result["trench_km"] == 4.5 and sub.result["arc_km"] == 1.8
    assert sub.result["slab_km"] == 240 and sub.result["volcanoes"]
    assert sub.achieved == ["subduction"] and "300 km of ocean floor" in sub.message

    hills = ev({"boundary": "collision", "myr": 10, "seen_boundaries": ["subduction"]})
    assert hills.result["mountain_km"] == 4.5 and "mountains" not in hills.achieved
    peaks = ev({"boundary": "collision", "myr": 12, "seen_boundaries": ["subduction"]})
    assert peaks.result["mountain_km"] == 5.4 and not peaks.result["volcanoes"]
    assert peaks.achieved == ["mountains"]  # only two boundaries so far
    third = ev({"boundary": "transform", "myr": 5, "seen_boundaries": ["subduction", "collision"]})
    assert "compare" in third.achieved and third.result["offset_km"] == 250

    assert ev({"view": "layers"}).message == "Click a layer of the Earth to inspect it."
    core = ev({"view": "layers", "layer": "outer_core", "inspected": ["crust", "mantle"]})
    assert "liquid iron and nickel" in core.message and "layers" not in core.achieved
    all4 = ev(
        {"view": "layers", "layer": "inner_core", "inspected": ["crust", "mantle", "outer_core"]}
    )
    assert "layers" in all4.achieved

    p_far = ev({"view": "waves", "wave": "P", "station": 120})
    assert not p_far.result["p_arrives"] and "shadow zone" in p_far.message
    s_far = ev({"view": "waves", "wave": "S", "station": 120, "seen_waves": ["P"]})
    assert not s_far.result["s_arrives"] and "liquid outer core stops" in s_far.message
    assert s_far.achieved == ["waves"] and s_far.result["station_km"] == 13343
    assert ev({"view": "waves", "wave": "P", "station": 170}).result["p_arrives"]

    # palette narrows the boundaries; a fresh board falls back to an allowed one
    assert e.validate_state({}, {"boundaries": ["divergent"]})["boundary"] == "divergent"
    with pytest.raises(ValueError):
        e.validate_state({"layer": "moon"}, {})


# ------------------------------------------------------------------- API
@pytest.mark.parametrize("kind", ["respiration", "orbits", "tectonics"])
def test_science_lab_round_trip(login: Login, kind: str) -> None:
    t = login("sci-teacher@example.com")
    lab = t.post("/api/v1/labs", json={"title": f"{kind} lab", "kind": kind}).json()
    assert lab["kind"] == kind and lab["goal"] == get_engine(kind).default_goal()
    tried = t.put(f"/api/v1/labs/{lab['id']}/session", json={"state": {}})
    assert tried.status_code == 200 and tried.json()["session"] is None
