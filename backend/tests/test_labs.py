"""Labs: the engines (circuit, molecules, buoyancy), the teacher flow, the student session and
the activity view."""

from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.modules.labs.circuit import Circuit, evaluate
from app.modules.labs.engines import get_engine
from tests.helpers import create_course

Login = Callable[..., TestClient]


# ---------------------------------------------------------- circuit physics
def part(id_: str, type_: str, closed: bool = True) -> dict[str, Any]:
    return {"id": id_, "type": type_, "x": 0, "y": 0, "closed": closed}


def wire(id_: str, a: str, b: str) -> dict[str, Any]:
    return {"id": id_, "a": a, "b": b}


SIMPLE_LOOP = {
    "parts": [part("bat", "battery"), part("l1", "bulb")],
    "wires": [wire("w1", "bat:a", "l1:a"), wire("w2", "l1:b", "bat:b")],
}


def ev(data: dict[str, Any]) -> Any:
    return evaluate(Circuit.model_validate(data))


def test_single_bulb_lights_at_full_brightness() -> None:
    r = ev(SIMPLE_LOOP)
    assert r.lit == ["l1"] and r.brightness["l1"] == 1.0 and r.closed_loop
    assert not r.short_circuit and "1 bulb lit" in r.message


def test_no_battery_or_open_loop_or_open_switch() -> None:
    assert ev({"parts": [part("l1", "bulb")], "wires": []}).message.startswith("Add a battery")
    open_loop = {"parts": SIMPLE_LOOP["parts"], "wires": [wire("w1", "bat:a", "l1:a")]}
    r = ev(open_loop)
    assert r.lit == [] and not r.short_circuit and "No complete loop" in r.message
    with_switch = {
        "parts": [part("bat", "battery"), part("l1", "bulb"), part("s", "switch", closed=False)],
        "wires": [
            wire("w1", "bat:a", "s:a"),
            wire("w2", "s:b", "l1:a"),
            wire("w3", "l1:b", "bat:b"),
        ],
    }
    assert "switch is open" in ev(with_switch).message
    with_switch["parts"][2]["closed"] = True
    assert ev(with_switch).lit == ["l1"]


def test_unconnected_parts_are_not_a_short_circuit() -> None:
    r = ev({"parts": [part("bat", "battery"), part("l1", "bulb"), part("l2", "bulb")], "wires": []})
    assert not r.short_circuit and r.lit == [] and "No complete loop" in r.message
    r = ev({"parts": SIMPLE_LOOP["parts"] + [part("spare", "bulb")], "wires": SIMPLE_LOOP["wires"]})
    assert r.lit == ["l1"] and r.brightness == {"l1": 1.0, "spare": 0.0}


def test_short_circuit_bypassing_the_bulb() -> None:
    data = {
        "parts": SIMPLE_LOOP["parts"],
        "wires": SIMPLE_LOOP["wires"] + [wire("w3", "bat:a", "bat:b")],
    }
    r = ev(data)
    assert r.short_circuit and r.lit == [] and "Short circuit" in r.message


def test_series_bulbs_are_dim_and_parallel_bulbs_are_bright() -> None:
    series = {
        "parts": [part("bat", "battery"), part("l1", "bulb"), part("l2", "bulb")],
        "wires": [
            wire("w1", "bat:a", "l1:a"),
            wire("w2", "l1:b", "l2:a"),
            wire("w3", "l2:b", "bat:b"),
        ],
    }
    r = ev(series)
    assert sorted(r.lit) == ["l1", "l2"] and r.brightness == {"l1": 0.5, "l2": 0.5}
    assert "dim" in r.message
    parallel = {
        "parts": [part("bat", "battery"), part("l1", "bulb"), part("l2", "bulb")],
        "wires": [
            wire("w1", "bat:a", "l1:a"),
            wire("w2", "l1:b", "bat:b"),
            wire("w3", "bat:a", "l2:a"),
            wire("w4", "l2:b", "bat:b"),
        ],
    }
    r = ev(parallel)
    assert r.brightness == {"l1": 1.0, "l2": 1.0} and "dim" not in r.message


def test_circuit_validation_rejects_dangling_and_duplicate_ids() -> None:
    with pytest.raises(ValueError):
        Circuit.model_validate({"parts": [part("a", "bulb")], "wires": [wire("w", "a:a", "zz:b")]})
    with pytest.raises(ValueError):
        Circuit.model_validate({"parts": [part("a", "bulb"), part("a", "bulb")], "wires": []})


# ------------------------------------------------------------ molecules
def atom(id_: str, el: str) -> dict[str, Any]:
    return {"id": id_, "element": el, "x": 0, "y": 0}


def bond(id_: str, a: str, b: str, order: int = 1) -> dict[str, Any]:
    return {"id": id_, "a": a, "b": b, "order": order}


WATER = {
    "atoms": [atom("o", "O"), atom("h1", "H"), atom("h2", "H")],
    "bonds": [bond("b1", "o", "h1"), bond("b2", "o", "h2")],
}
CO2 = {
    "atoms": [atom("c", "C"), atom("o1", "O"), atom("o2", "O")],
    "bonds": [bond("b1", "c", "o1", 2), bond("b2", "c", "o2", 2)],
}


def test_molecule_engine_recognises_water_and_shapes() -> None:
    m = get_engine("molecules")
    goal = {"targets": ["H2O", "CO2"]}
    r = m.evaluate(WATER, goal, [])
    assert r.result["formula"] == "H2O" and r.result["name"] == "water"
    assert r.result["shape"] == "bent" and r.achieved == ["H2O"] and not r.goal_met
    r2 = m.evaluate(CO2, goal, ["H2O"])
    assert r2.result["shape"] == "linear" and r2.goal_met and "Every target" in r2.message
    # incomplete: one hydrogen missing
    half = {"atoms": [atom("o", "O"), atom("h1", "H")], "bonds": [bond("b1", "o", "h1")]}
    r3 = m.evaluate(half, goal, [])
    assert (
        not r3.result["complete"] and r3.result["missing"] == {"o": 1} and "more bond" in r3.message
    )
    # over-bonded hydrogen
    bad = {"atoms": [atom("h", "H"), atom("o", "O")], "bonds": [bond("b1", "h", "o", 2)]}
    assert "too many bonds" in m.evaluate(bad, goal, []).message
    # two separate fragments are not one molecule
    frag = {
        "atoms": [atom("h1", "H"), atom("h2", "H"), atom("h3", "H"), atom("h4", "H")],
        "bonds": [bond("b1", "h1", "h2"), bond("b2", "h3", "h4")],
    }
    assert "one molecule" in m.evaluate(frag, goal, []).message


def test_molecule_engine_validates_config_and_palette() -> None:
    m = get_engine("molecules")
    with pytest.raises(ValueError):
        m.validate_goal({"targets": ["XYZ"]})
    assert m.validate_goal({"targets": ["CH4"]}) == {"targets": ["CH4"]}
    from app.core.errors import ConflictError

    with pytest.raises(ConflictError):
        m.validate_state(
            {
                "atoms": [atom("c1", "C"), atom("c2", "C"), atom("c3", "C"), atom("c4", "C")],
                "bonds": [],
            },
            {"C": 3},
        )


# ------------------------------------------------------------- buoyancy
def test_buoyancy_engine_floats_sinks_and_measures_pressure() -> None:
    b = get_engine("buoyancy")
    goal = {"tasks": ["float", "sink", "salt", "pressure"]}
    wood = {"material": "wood", "volume_l": 1, "liquid": "fresh water", "probe_depth_m": 0.5}
    r = b.evaluate(wood, goal, [])
    assert r.result["floats"] and r.result["submerged_fraction"] == 0.6
    assert r.result["buoyant_force_n"] == r.result["weight_n"] == 5.89
    assert r.result["pressure_kpa"] == 4.91 and r.achieved == ["float"]
    steel = {"material": "steel", "volume_l": 1, "liquid": "fresh water", "probe_depth_m": 1.5}
    r2 = b.evaluate(steel, goal, ["float"])
    assert not r2.result["floats"] and r2.result["submerged_fraction"] == 1.0
    assert r2.result["pressure_kpa"] == 14.72 and set(r2.achieved) == {"sink", "pressure"}
    salt = {
        "material": "ice",
        "volume_l": 1,
        "liquid": "salt water",
        "probe_depth_m": 0,
        "tried_liquids": ["fresh water"],
    }
    r3 = b.evaluate(salt, goal, ["float", "sink", "pressure"])
    assert "salt" in r3.achieved and r3.goal_met and "Every task" in r3.message


# ------------------------------------------------------------------- API
def _course_with_chapter(t: TestClient) -> tuple[str, str]:
    cid = create_course(t)
    ch = t.post(f"/api/v1/courses/{cid}/chapters", json={"title": "Electricity"}).json()["id"]
    t.patch(f"/api/v1/chapters/{ch}", json={"status": "published"})
    t.patch(f"/api/v1/courses/{cid}", json={"status": "published"})
    return str(cid), str(ch)


def test_lab_kinds_are_listed_with_defaults(login: Login) -> None:
    t = login("t@example.com")
    ks = t.get("/api/v1/labs/kinds").json()
    assert [k["kind"] for k in ks][:3] == ["circuit", "molecules", "buoyancy"]
    mol = next(k for k in ks if k["kind"] == "molecules")
    assert mol["default_goal"]["targets"] == ["H2O", "CO2", "CH4"]
    assert any(o["formula"] == "NH3" for o in mol["options"]["targets"])


def test_teacher_creates_publishes_and_student_builds_until_the_goal(login: Login) -> None:
    t = login("t@example.com")
    s = login("s@example.com", "student")
    cid, ch = _course_with_chapter(t)
    t.post(f"/api/v1/courses/{cid}/enrollments", json={"student_email": "s@example.com"})

    r = t.post(
        f"/api/v1/courses/{cid}/labs",
        json={
            "title": "Light the bulb",
            "chapter_id": ch,
            "instructions": "Connect the battery to the bulb with wires.",
            "goal": {"min_lit": 1, "require_switch": True},
            "palette": {"battery": 1, "bulb": 2, "switch": 1},
        },
    )
    assert r.status_code == 201, r.text
    lab = r.json()
    assert (
        lab["status"] == "draft"
        and lab["kind"] == "circuit"
        and lab["chapter_title"] == "Electricity"
    )

    # Drafts are invisible to students, also in the chapter list.
    assert s.get(f"/api/v1/labs/{lab['id']}").status_code == 404
    assert s.get(f"/api/v1/chapters/{ch}/labs").json() == []
    assert s.get("/api/v1/labs").json() == []
    assert [x["id"] for x in t.get("/api/v1/labs").json()] == [lab["id"]]

    assert (
        t.patch(f"/api/v1/labs/{lab['id']}", json={"status": "published"}).json()["status"]
        == "published"
    )
    assert s.get(f"/api/v1/chapters/{ch}/labs").json()[0]["session_status"] is None
    mine = s.get(f"/api/v1/labs/{lab['id']}").json()
    assert mine["can_manage"] is False and mine["session"] is None

    # First try: loop without the switch -> bulb lit, but the goal needs a switch.
    r = s.put(f"/api/v1/labs/{lab['id']}/session", json={"state": SIMPLE_LOOP})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["result"]["lit"] == ["l1"] and body["goal_met"] is False
    assert body["session"]["status"] == "in_progress" and body["session"]["interactions"] == 1

    # Second try: with a closed switch -> goal met, session completed.
    done = {
        "parts": [part("bat", "battery"), part("l1", "bulb"), part("s", "switch")],
        "wires": [
            wire("w1", "bat:a", "s:a"),
            wire("w2", "s:b", "l1:a"),
            wire("w3", "l1:b", "bat:b"),
        ],
    }
    body = s.put(f"/api/v1/labs/{lab['id']}/session", json={"state": done}).json()
    assert body["goal_met"] is True and body["session"]["status"] == "completed"
    assert body["session"]["interactions"] == 2 and body["session"]["completed_at"]

    # The student's own view carries the saved state; the chapter list shows completion.
    mine = s.get(f"/api/v1/labs/{lab['id']}").json()
    assert mine["session"]["state"]["parts"][2]["type"] == "switch"
    assert s.get(f"/api/v1/chapters/{ch}/labs").json()[0]["session_status"] == "completed"

    # The teacher sees the activity and the counters on the lab.
    rows = t.get(f"/api/v1/labs/{lab['id']}/sessions").json()
    assert len(rows) == 1 and rows[0]["display_name"] == "s" and rows[0]["goal_met"]
    assert (
        rows[0]["interactions"] == 2 and "3 parts" in rows[0]["summary"] and rows[0]["flag"] is None
    )
    out = t.get(f"/api/v1/labs/{lab['id']}").json()
    assert out["students_started"] == 1 and out["students_completed"] == 1

    # Teachers can try the builder; nothing is stored for them.
    body = t.put(f"/api/v1/labs/{lab['id']}/session", json={"state": SIMPLE_LOOP}).json()
    assert body["session"] is None and body["result"]["lit"] == ["l1"]
    assert len(t.get(f"/api/v1/labs/{lab['id']}/sessions").json()) == 1

    # Palette limits and invalid states are refused.
    too_many = {"parts": [part("b1", "battery"), part("b2", "battery")], "wires": []}
    assert s.put(f"/api/v1/labs/{lab['id']}/session", json={"state": too_many}).status_code == 409
    assert (
        s.put(
            f"/api/v1/labs/{lab['id']}/session",
            json={"state": {"parts": [{"id": "x", "type": "laser"}]}},
        ).status_code
        == 409
    )

    # Edit, unpublish, delete.
    r = t.patch(f"/api/v1/labs/{lab['id']}", json={"title": "Light it up", "clear_chapter": True})
    assert r.json()["title"] == "Light it up" and r.json()["chapter_id"] is None
    t.patch(f"/api/v1/labs/{lab['id']}", json={"status": "draft"})
    assert s.get(f"/api/v1/labs/{lab['id']}").status_code == 404
    assert t.delete(f"/api/v1/labs/{lab['id']}").status_code == 204
    assert t.get(f"/api/v1/labs/{lab['id']}").status_code == 404


def test_molecule_lab_tracks_targets_across_saves(login: Login) -> None:
    t = login("t@example.com")
    s = login("s@example.com", "student")
    cid, ch = _course_with_chapter(t)
    t.post(f"/api/v1/courses/{cid}/enrollments", json={"student_email": "s@example.com"})
    lab = t.post(
        f"/api/v1/courses/{cid}/labs",
        json={"title": "Molecules", "kind": "molecules", "goal": {"targets": ["H2O", "CO2"]}},
    ).json()
    assert lab["kind"] == "molecules" and lab["palette"]["H"] == 8
    t.patch(f"/api/v1/labs/{lab['id']}", json={"status": "published"})

    a = s.put(f"/api/v1/labs/{lab['id']}/session", json={"state": WATER}).json()
    assert a["achieved"] == ["H2O"] and a["result"]["name"] == "water" and not a["goal_met"]
    b = s.put(f"/api/v1/labs/{lab['id']}/session", json={"state": CO2}).json()
    assert (
        b["achieved"] == ["CO2", "H2O"] and b["goal_met"] and b["session"]["status"] == "completed"
    )
    rows = t.get(f"/api/v1/labs/{lab['id']}/sessions").json()
    assert rows[0]["achieved"] == 2 and rows[0]["total"] == 2 and "CO2" in rows[0]["summary"]
    # unknown kind and bad goal are 409, not 500
    assert (
        t.post(f"/api/v1/courses/{cid}/labs", json={"title": "x", "kind": "rockets"}).status_code
        == 409
    )
    assert (
        t.post(
            f"/api/v1/courses/{cid}/labs",
            json={"title": "x", "kind": "molecules", "goal": {"targets": ["XYZ"]}},
        ).status_code
        == 409
    )


def test_chapter_must_belong_to_the_course_and_students_cannot_create(login: Login) -> None:
    t = login("t@example.com")
    s = login("s@example.com", "student")
    cid, _ = _course_with_chapter(t)
    other, other_ch = _course_with_chapter(t)
    r = t.post(f"/api/v1/courses/{cid}/labs", json={"title": "x", "chapter_id": other_ch})
    assert r.status_code == 409
    assert s.post(f"/api/v1/courses/{other}/labs", json={"title": "x"}).status_code == 403


def test_published_labs_open_regardless_of_course_status_and_standalone_labs(
    login: Login,
) -> None:
    t = login("t@example.com")
    s = login("s@example.com", "student")
    outsider = login("x@example.com", "student")
    # a lab in a DRAFT course: a draft lab is hidden, a published one opens for enrolled students
    draft_course = create_course(t)
    t.post(f"/api/v1/courses/{draft_course}/enrollments", json={"student_email": "s@example.com"})
    lab = t.post(f"/api/v1/courses/{draft_course}/labs", json={"title": "In draft course"}).json()
    assert "it is a draft" in lab["visibility_note"]
    assert s.get(f"/api/v1/labs/{lab['id']}").status_code == 404
    lab = t.patch(f"/api/v1/labs/{lab['id']}", json={"status": "published"}).json()
    assert "course is still a draft" in lab["visibility_note"]
    assert s.get(f"/api/v1/labs/{lab['id']}").status_code == 200
    assert lab["id"] in [x["id"] for x in s.get("/api/v1/labs").json()]
    assert outsider.get(f"/api/v1/labs/{lab['id']}").status_code == 404  # not enrolled
    # a draft chapter does not block either
    ch = t.post(f"/api/v1/courses/{draft_course}/chapters", json={"title": "Draft chapter"}).json()
    lab = t.patch(f"/api/v1/labs/{lab['id']}", json={"chapter_id": ch["id"]}).json()
    assert "draft" in lab["visibility_note"]
    assert s.get(f"/api/v1/labs/{lab['id']}").status_code == 200

    # standalone lab (no course): open to students enrolled in any of the teacher's courses
    alone = t.post("/api/v1/labs", json={"title": "Standalone", "kind": "buoyancy"}).json()
    assert alone["course_id"] is None and alone["course_title"] is None
    assert [x["id"] for x in t.get("/api/v1/labs").json()][0] == alone["id"]
    assert s.get(f"/api/v1/labs/{alone['id']}").status_code == 404  # still a draft
    alone = t.patch(f"/api/v1/labs/{alone['id']}", json={"status": "published"}).json()
    assert alone["visibility_note"].startswith("Standalone lab")
    assert s.get(f"/api/v1/labs/{alone['id']}").status_code == 200
    assert outsider.get(f"/api/v1/labs/{alone['id']}").status_code == 404
    r = s.put(
        f"/api/v1/labs/{alone['id']}/session",
        json={
            "state": {
                "material": "steel",
                "volume_l": 1,
                "liquid": "fresh water",
                "probe_depth_m": 1.5,
            }
        },
    )
    assert r.status_code == 200 and r.json()["result"]["floats"] is False
    # move it into a course, then make it standalone again
    moved = t.patch(f"/api/v1/labs/{alone['id']}", json={"course_id": draft_course}).json()
    assert moved["course_id"] == draft_course
    back = t.patch(f"/api/v1/labs/{alone['id']}", json={"clear_course": True}).json()
    assert back["course_id"] is None and back["chapter_id"] is None
    # a chapter from another course is refused
    other = create_course(t)
    other_ch = t.post(f"/api/v1/courses/{other}/chapters", json={"title": "C"}).json()["id"]
    assert t.patch(f"/api/v1/labs/{lab['id']}", json={"chapter_id": other_ch}).status_code == 409
