"""scripts/split_glb_clips.py separates a baked Blender timeline into the Studio's clips."""

import importlib.util
import json
import struct
import sys
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "split_glb_clips.py"
spec = importlib.util.spec_from_file_location("split_glb_clips", SCRIPT)
assert spec and spec.loader
tool = importlib.util.module_from_spec(spec)
sys.modules["split_glb_clips"] = tool
spec.loader.exec_module(tool)

CYCLE = [0.0, 1.0, 0.0, -1.0, 0.0]  # running motion on Y over 4 keys (one whole cycle)
EXPLODE = [0.0, 0.0, 0.0, 0.0, 0.0, 2.0, 4.0, 4.0, 4.0, 4.0, 4.0]  # offset on X: keys 4..6
KEYS = len(EXPLODE)


def build_glb(path: Path, wobble: float = 0.0) -> None:
    """A piston that runs and explodes, a label that only appears when exploded, one mesh."""
    blob = bytearray()
    views: list[dict] = []
    accessors: list[dict] = []

    def add(kind: str, values: list[tuple[float, ...]]) -> int:
        flat = [x for v in values for x in v]
        views.append({"buffer": 0, "byteOffset": len(blob), "byteLength": 4 * len(flat)})
        blob.extend(struct.pack(f"<{len(flat)}f", *flat))
        accessors.append(
            {
                "bufferView": len(views) - 1,
                "componentType": 5126,
                "count": len(values),
                "type": kind,
            }
        )
        return len(accessors) - 1

    position = add("VEC3", [(0.0, 0.0, 0.0), (1.0, 0.0, 0.0), (0.0, 1.0, 0.0)])
    times = add("SCALAR", [(i / 2,) for i in range(KEYS)])
    moved = []
    for i in range(KEYS):
        # the rig: base + explode + running motion; `wobble` breaks it once exploded
        y = CYCLE[i % 4] + (wobble * CYCLE[i % 4] if EXPLODE[i] == 4.0 else 0.0)
        moved.append((EXPLODE[i], y, 0.0))
    piston = add("VEC3", moved)
    label = add("VEC3", [(0.0,) * 3 if e < 4.0 else (1.0,) * 3 for e in EXPLODE])
    doc = {
        "asset": {"version": "2.0"},
        "scene": 0,
        "scenes": [{"nodes": [0, 1]}],
        "nodes": [
            {"name": "Camshaft (Intake).1", "mesh": 0},
            {"name": "Label · PISTONS ×4", "mesh": 0, "scale": [1, 1, 1]},
        ],
        "meshes": [
            {"name": "Camshaft (Intake).1", "primitives": [{"attributes": {"POSITION": position}}]}
        ],
        "animations": [
            {
                "name": "Scene",
                "samplers": [
                    {"input": times, "output": piston, "interpolation": "LINEAR"},
                    {"input": times, "output": label, "interpolation": "LINEAR"},
                ],
                "channels": [
                    {"sampler": 0, "target": {"node": 0, "path": "translation"}},
                    {"sampler": 1, "target": {"node": 1, "path": "scale"}},
                ],
            }
        ],
        "accessors": accessors,
        "bufferViews": views,
        "buffers": [{"byteLength": len(blob)}],
    }
    tool.write_glb(path, doc, blob)


def convert(tmp_path: Path, *extra: str, wobble: float = 0.0) -> tuple[dict, bytes]:
    source, output = tmp_path / "in.glb", tmp_path / "out.glb"
    build_glb(source, wobble)
    tool.main([str(source), str(output), "--explode", "2:3", *extra])
    return tool.read_glb(output)


def clip(doc: dict, blob: bytes, name: str) -> dict[tuple[int, str], list[tuple[float, ...]]]:
    animation = next(a for a in doc["animations"] if a["name"] == name)
    return {
        (c["target"]["node"], c["target"]["path"]): tool.read_floats(
            doc, blob, animation["samplers"][c["sampler"]]["output"]
        )
        for c in animation["channels"]
    }


def test_separates_running_from_exploding(tmp_path: Path) -> None:
    doc, blob = convert(tmp_path, "--run", "0:2", "--annotations", "^Label ")
    assert [a["name"] for a in doc["animations"]] == ["run", "explode"]

    run = clip(doc, blob, "run")
    assert [v[1] for v in run[(0, "translation")]] == CYCLE
    assert (1, "scale") not in run  # the label doesn't run

    explode = clip(doc, blob, "explode")
    # the running motion is gone: only the offset is left, starting from the assembled pose
    assert explode[(0, "translation")] == [(0.0, 0.0, 0.0), (2.0, 0.0, 0.0), (4.0, 0.0, 0.0)]
    assert [v[0] for v in explode[(1, "scale")]] == [0.0, 0.0, 1.0]


def test_clip_lengths_can_match_the_blender_panel(tmp_path: Path) -> None:
    doc, blob = convert(
        tmp_path, "--run", "0:2", "--run-duration", "4", "--explode-duration", "1.6"
    )
    lengths = {}
    for animation in doc["animations"]:
        times = tool.read_floats(doc, blob, animation["samplers"][0]["input"])
        lengths[animation["name"]] = times[-1][0]
    assert lengths["run"] == pytest.approx(4)
    assert lengths["explode"] == pytest.approx(1.6)


def test_refuses_motion_that_would_show_wrongly(tmp_path: Path) -> None:
    with pytest.raises(SystemExit, match="not additive"):
        convert(tmp_path, "--run", "0:2", wobble=0.5)


def test_refuses_a_run_window_that_is_not_a_whole_cycle(tmp_path: Path) -> None:
    with pytest.raises(SystemExit, match="whole cycle"):
        convert(tmp_path, "--run", "0:1.5")


def test_without_a_running_motion_only_explode_is_made(tmp_path: Path) -> None:
    doc, blob = convert(tmp_path)
    assert [a["name"] for a in doc["animations"]] == ["explode"]
    # the explode window is copied as it was baked, running motion included
    assert clip(doc, blob, "explode")[(0, "translation")][0] == (0.0, 0.0, 0.0)


def test_names_fit_the_scene_contract(tmp_path: Path) -> None:
    doc, _ = convert(tmp_path, "--run", "0:2", "--annotations", "^Label ")
    assert doc["nodes"][0]["name"] == "Camshaft Intake 1"
    assert "name" not in doc["nodes"][1]  # still drawn and animated, but not a part
    assert "name" not in doc["meshes"][0]  # can't rename the node when three.js de-duplicates


def test_camera_gives_the_studio_its_starting_view(tmp_path: Path) -> None:
    doc, _ = convert(tmp_path, "--view=1,0,0", "--view-fov", "30")
    node = next(n for n in doc["nodes"] if "camera" in n)
    assert "name" not in node  # not a part
    assert doc["nodes"].index(node) in doc["scenes"][0]["nodes"]
    x, y, z, w = node["rotation"]
    # the camera's +Z axis (it looks down -Z) must point along --view
    axis = (2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y))
    assert axis == pytest.approx((1, 0, 0), abs=1e-6)
    assert doc["cameras"][0]["perspective"]["yfov"] == pytest.approx(0.5235988)


def test_baked_animation_data_is_dropped(tmp_path: Path) -> None:
    source, output = tmp_path / "in.glb", tmp_path / "out.glb"
    build_glb(source)
    tool.main([str(source), str(output), "--explode", "2:3"])
    doc, blob = tool.read_glb(output)
    _, before = tool.read_glb(source)
    assert len(blob) < len(before)
    assert json.dumps(doc)  # still a well-formed document
    assert doc["meshes"][0]["primitives"][0]["attributes"]["POSITION"] == 0
    assert tool.read_floats(doc, blob, 0)[1] == (1.0, 0.0, 0.0)


def test_output_must_be_a_new_file(tmp_path: Path) -> None:
    source = tmp_path / "in.glb"
    build_glb(source)
    with pytest.raises(SystemExit):
        tool.main([str(source), str(source), "--explode", "2:3"])
