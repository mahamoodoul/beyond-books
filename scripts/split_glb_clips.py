"""Split the one timeline Blender bakes into a GLB into the clips the 3D Studio plays.

    python scripts/split_glb_clips.py engine.glb engine_studio.glb \
        --run 0.0417:2.0417 --run-duration 1.333 \
        --explode 2.0417:4.0 --explode-duration 1.6 \
        --annotations "^(Label|Sub|Leader|Dot) " \
        --view=-0.569,0.319,0.758 --view-fov 20

Blender's glTF export bakes everything on the timeline into a single animation. The viewer wants:

  run      loops; the Run button starts and stops it (optional)
  explode  follows the Explode slider, layered on top of `run`

A rig written as location = base + explode(e) + motion(c) can be separated exactly, so this needs
no re-export: `--run` names a whole number of cycles played while assembled, `--explode` names the
move from assembled to exploded, and the running motion is subtracted out of the latter. The script
refuses a model whose motion is not additive, because the Studio would show it wrongly.

It also makes the model easier to use in the Studio:
  --annotations  nodes matching this regex (text, leader lines) stay visible but are not parts
  --view/-fov    adds a camera so the Studio opens from the view the model was laid out for
Other part names become safe for scene specs: only A-Z a-z 0-9 _ . - pass the contract's mesh_name
rule, and anything else is silently left out of the parts list.

Dependency-free (no numpy), so it runs anywhere. See docs/3d-asset-workflow.md.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import struct
import sys
from dataclasses import dataclass
from pathlib import Path

MOVING = 1e-5  # a channel changing less than this over a window counts as still
FLOAT32 = 5126
SIZES = {"SCALAR": 1, "VEC3": 3, "VEC4": 4}
DEFAULTS = {
    "translation": (0.0, 0.0, 0.0),
    "rotation": (0.0, 0.0, 0.0, 1.0),
    "scale": (1.0, 1.0, 1.0),
}

Value = tuple[float, ...]


@dataclass
class Channel:
    node: int
    path: str
    values: list[Value]


def read_glb(path: Path) -> tuple[dict, bytes]:
    data = path.read_bytes()
    magic, version, length = struct.unpack_from("<4sII", data, 0)
    if (magic, version, length) != (b"glTF", 2, len(data)):
        raise SystemExit(f"{path}: not a glTF 2.0 binary")
    json_len, json_type = struct.unpack_from("<I4s", data, 12)
    if json_type != b"JSON":
        raise SystemExit(f"{path}: first chunk is not JSON")
    doc = json.loads(data[20 : 20 + json_len])
    bin_start = 20 + json_len
    if bin_start >= len(data):
        return doc, b""
    bin_len = struct.unpack_from("<I", data, bin_start)[0]
    return doc, data[bin_start + 8 : bin_start + 8 + bin_len]


def read_floats(doc: dict, blob: bytes, index: int) -> list[Value]:
    accessor = doc["accessors"][index]
    if accessor.get("componentType") != FLOAT32 or "sparse" in accessor:
        raise SystemExit("animation data must be plain float32 (export without compression)")
    view = doc["bufferViews"][accessor["bufferView"]]
    size = SIZES[accessor["type"]]
    offset = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    flat = struct.unpack_from(f"<{accessor['count'] * size}f", blob, offset)
    return [flat[i : i + size] for i in range(0, len(flat), size)]


def read_timeline(doc: dict, blob: bytes) -> tuple[list[float], list[Channel]]:
    animations = doc.get("animations") or []
    if len(animations) != 1:
        raise SystemExit(f"expected one baked animation, found {len(animations)}")
    animation = animations[0]
    times: list[float] = []
    channels: list[Channel] = []
    for channel in animation["channels"]:
        sampler = animation["samplers"][channel["sampler"]]
        if sampler.get("interpolation", "LINEAR") == "CUBICSPLINE":
            raise SystemExit("bake the animation with linear interpolation")
        keys = [t[0] for t in read_floats(doc, blob, sampler["input"])]
        if not times:
            times = keys
        elif len(keys) != len(times):
            raise SystemExit("every channel must be sampled on every frame (always sample)")
        channels.append(
            Channel(
                channel["target"]["node"],
                channel["target"]["path"],
                read_floats(doc, blob, sampler["output"]),
            )
        )
    return times, channels


def distance(a: Value, b: Value, path: str) -> float:
    direct = math.dist(a, b)
    # q and -q are the same rotation
    return min(direct, math.dist(a, [-x for x in b])) if path == "rotation" else direct


def varies(values: list[Value], path: str) -> bool:
    return any(distance(v, values[0], path) > MOVING for v in values)


def key_at(times: list[float], seconds: float) -> int:
    return min(range(len(times)), key=lambda i: abs(times[i] - seconds))


def window(spec: str, times: list[float]) -> tuple[int, int]:
    start, end = (key_at(times, float(x)) for x in spec.split(":"))
    if end <= start:
        raise SystemExit(f"empty window {spec}")
    return start, end


def split(
    times: list[float],
    channels: list[Channel],
    run: tuple[int, int] | None,
    explode: tuple[int, int],
    tolerance: float,
) -> tuple[dict[tuple[int, str], Value], list[Channel], list[Channel], float]:
    """Returns rest pose, run channels, explode channels and the worst additivity residual."""
    x0, x1 = explode
    rest: dict[tuple[int, str], Value] = {}
    run_out: list[Channel] = []
    explode_out: list[Channel] = []
    worst = 0.0
    for channel in channels:
        values, path = channel.values, channel.path
        key = (channel.node, path)
        cycle: list[Value] | None = None
        if run:
            cycle = values[run[0] : run[1] + 1]
            if not varies(cycle, path):
                cycle = None
        rest[key] = cycle[0] if cycle else values[x0]
        if cycle is None:
            piece = values[x0 : x1 + 1]
            if varies(piece, path):
                explode_out.append(Channel(channel.node, path, piece))
            continue

        assert run is not None
        period = run[1] - run[0]
        if distance(cycle[-1], cycle[0], path) > tolerance:
            raise SystemExit(
                f"--run is not a whole cycle: node {channel.node} {path} does not close"
            )
        run_out.append(Channel(channel.node, path, [*cycle[:-1], cycle[0]]))

        # where the running motion alone would be at each key of the timeline
        at_key = [cycle[(i - run[0]) % period] for i in range(len(times))]
        if path != "translation":
            # the rig only adds the explode to location: rotation and scale must follow the cycle
            for value, expected in zip(values, at_key, strict=True):
                worst = max(worst, distance(value, expected, path))
            continue
        offset = [
            tuple(a - b for a, b in zip(value, expected, strict=True))
            for value, expected in zip(values, at_key, strict=True)
        ]
        # once exploded the offset must hold still while the parts keep running
        for i in range(x1, min(x1 + period + 1, len(times))):
            worst = max(worst, math.dist(offset[i], offset[x1]))
        piece = [
            tuple(a + b for a, b in zip(cycle[0], offset[i], strict=True))
            for i in range(x0, x1 + 1)
        ]
        if varies(piece, path):
            explode_out.append(Channel(channel.node, path, piece))
    if worst > tolerance:
        raise SystemExit(
            f"motion is not additive (off by {worst:.4f}); the Studio would show it wrongly"
        )
    return rest, run_out, explode_out, worst


def safe_name(name: str) -> str:
    """A part name the scene contract accepts, readable once glTF sanitizing has run."""
    name = re.sub(r"['′’]", "", name).replace(".", " ")
    return " ".join(re.sub(r"[^A-Za-z0-9_\- ]+", " ", name).split())


def tidy_names(doc: dict, annotations: re.Pattern[str] | None) -> tuple[int, int]:
    seen: set[str] = set()
    parts = hidden = 0
    for node in doc["nodes"]:
        name = node.pop("name", None)
        if not name:
            continue
        if annotations and annotations.search(name):
            hidden += 1
            continue
        clean = base = safe_name(name) or "Part"
        suffix = 2
        while clean in seen:
            clean = f"{base} {suffix}"
            suffix += 1
        seen.add(clean)
        node["name"] = clean
        parts += 1
    # three.js de-duplicates names, so a mesh called like a node could rename the node
    for mesh in doc.get("meshes", []):
        mesh.pop("name", None)
    return parts, hidden


def add_camera(doc: dict, direction: Value, fov_degrees: float) -> None:
    """A camera along `direction` from the model; only its orientation and field of view matter."""
    length = math.hypot(*direction) or 1.0
    bz = [c / length for c in direction]
    up = (0.0, 0.0, 1.0) if abs(bz[1]) > 0.99 else (0.0, 1.0, 0.0)
    bx = [
        up[1] * bz[2] - up[2] * bz[1],
        up[2] * bz[0] - up[0] * bz[2],
        up[0] * bz[1] - up[1] * bz[0],
    ]
    n = math.hypot(*bx)
    bx = [c / n for c in bx]
    by = [
        bz[1] * bx[2] - bz[2] * bx[1],
        bz[2] * bx[0] - bz[0] * bx[2],
        bz[0] * bx[1] - bz[1] * bx[0],
    ]
    # rotation matrix with columns bx, by, bz -> quaternion (largest-component branch)
    m00, m10, m20 = bx
    m01, m11, m21 = by
    m02, m12, m22 = bz
    trace = m00 + m11 + m22
    if trace > 0:
        s = 2 * math.sqrt(1 + trace)
        q = [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, s / 4]
    elif m00 >= m11 and m00 >= m22:
        s = 2 * math.sqrt(1 + m00 - m11 - m22)
        q = [s / 4, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s]
    elif m11 >= m22:
        s = 2 * math.sqrt(1 + m11 - m00 - m22)
        q = [(m01 + m10) / s, s / 4, (m12 + m21) / s, (m02 - m20) / s]
    else:
        s = 2 * math.sqrt(1 + m22 - m00 - m11)
        q = [(m02 + m20) / s, (m12 + m21) / s, s / 4, (m10 - m01) / s]
    doc.setdefault("cameras", []).append(
        {"type": "perspective", "perspective": {"yfov": math.radians(fov_degrees), "znear": 0.05}}
    )
    # unnamed, so it is not listed as a part
    doc["nodes"].append(
        {"camera": len(doc["cameras"]) - 1, "translation": [c * 5 for c in bz], "rotation": q}
    )
    doc["scenes"][doc.get("scene", 0)]["nodes"].append(len(doc["nodes"]) - 1)


def compact(doc: dict, blob: bytes) -> bytearray:
    """Keep only what meshes and images use, dropping the baked animation's data."""
    used: set[int] = set()
    for mesh in doc.get("meshes", []):
        for primitive in mesh.get("primitives", []):
            used.update(primitive.get("attributes", {}).values())
            if "indices" in primitive:
                used.add(primitive["indices"])
            for target in primitive.get("targets", []):
                used.update(target.values())
    for skin in doc.get("skins", []):
        if "inverseBindMatrices" in skin:
            used.add(skin["inverseBindMatrices"])
    accessors = doc.get("accessors", [])
    if any("sparse" in accessors[i] for i in used):
        raise SystemExit("sparse accessors are not supported")

    out = bytearray()
    views: list[dict] = []
    view_map: dict[int, int] = {}

    def keep_view(index: int) -> int:
        if index not in view_map:
            view = dict(doc["bufferViews"][index])
            start = view.get("byteOffset", 0)
            out.extend(b"\0" * (-len(out) % 4))
            view["byteOffset"] = len(out)
            view["buffer"] = 0
            out.extend(blob[start : start + view["byteLength"]])
            views.append(view)
            view_map[index] = len(views) - 1
        return view_map[index]

    accessor_map: dict[int, int] = {}
    kept: list[dict] = []
    for index in sorted(used):
        accessor = dict(accessors[index])
        if "bufferView" in accessor:
            accessor["bufferView"] = keep_view(accessor["bufferView"])
        kept.append(accessor)
        accessor_map[index] = len(kept) - 1
    for image in doc.get("images", []):
        if "bufferView" in image:
            image["bufferView"] = keep_view(image["bufferView"])
    for mesh in doc.get("meshes", []):
        for primitive in mesh.get("primitives", []):
            primitive["attributes"] = {
                k: accessor_map[v] for k, v in primitive.get("attributes", {}).items()
            }
            if "indices" in primitive:
                primitive["indices"] = accessor_map[primitive["indices"]]
            if "targets" in primitive:
                primitive["targets"] = [
                    {k: accessor_map[v] for k, v in target.items()}
                    for target in primitive["targets"]
                ]
    for skin in doc.get("skins", []):
        if "inverseBindMatrices" in skin:
            skin["inverseBindMatrices"] = accessor_map[skin["inverseBindMatrices"]]
    doc["accessors"] = kept
    doc["bufferViews"] = views
    return out


def add_floats(
    doc: dict, out: bytearray, values: list[Value], kind: str, bounds: bool = False
) -> int:
    out.extend(b"\0" * (-len(out) % 4))
    flat = [x for v in values for x in v]
    doc["bufferViews"].append({"buffer": 0, "byteOffset": len(out), "byteLength": 4 * len(flat)})
    out.extend(struct.pack(f"<{len(flat)}f", *flat))
    accessor: dict = {
        "bufferView": len(doc["bufferViews"]) - 1,
        "componentType": FLOAT32,
        "count": len(values),
        "type": kind,
    }
    if bounds:
        accessor["min"] = [min(flat)]
        accessor["max"] = [max(flat)]
    doc["accessors"].append(accessor)
    return len(doc["accessors"]) - 1


def add_clip(doc: dict, out: bytearray, name: str, channels: list[Channel], seconds: float) -> None:
    if not channels:
        return
    keys = len(channels[0].values)
    times = add_floats(doc, out, [(i * seconds / (keys - 1),) for i in range(keys)], "SCALAR", True)
    samplers = []
    targets = []
    for i, channel in enumerate(channels):
        kind = "VEC4" if channel.path == "rotation" else "VEC3"
        samplers.append(
            {
                "input": times,
                "output": add_floats(doc, out, channel.values, kind),
                "interpolation": "LINEAR",
            }
        )
        targets.append({"sampler": i, "target": {"node": channel.node, "path": channel.path}})
    doc["animations"].append({"name": name, "samplers": samplers, "channels": targets})


def write_glb(path: Path, doc: dict, out: bytearray) -> int:
    out.extend(b"\0" * (-len(out) % 4))
    doc["buffers"] = [{"byteLength": len(out)}]
    text = json.dumps(doc, separators=(",", ":"), ensure_ascii=False).encode()
    text += b" " * (-len(text) % 4)
    total = 12 + 8 + len(text) + 8 + len(out)
    with path.open("wb") as f:
        f.write(struct.pack("<4sII", b"glTF", 2, total))
        f.write(struct.pack("<I4s", len(text), b"JSON"))
        f.write(text)
        f.write(struct.pack("<I4s", len(out), b"BIN\0"))
        f.write(out)
    return total


def convert(args: argparse.Namespace) -> None:
    doc, blob = read_glb(args.input)
    times, channels = read_timeline(doc, blob)
    run = window(args.run, times) if args.run else None
    explode = window(args.explode, times)
    rest, run_channels, explode_channels, worst = split(
        times, channels, run, explode, args.tolerance
    )

    for (node, path), value in rest.items():
        target = doc["nodes"][node]
        target.pop("matrix", None)
        if distance(value, DEFAULTS[path], path) > 0:
            target[path] = list(value)
        else:
            target.pop(path, None)

    annotations = re.compile(args.annotations) if args.annotations else None
    parts, hidden = tidy_names(doc, annotations)
    if args.view:
        add_camera(doc, tuple(float(x) for x in args.view.split(",")), args.view_fov)

    out = compact(doc, blob)
    doc["animations"] = []
    dt = (times[-1] - times[0]) / (len(times) - 1)
    if run:
        add_clip(doc, out, "run", run_channels, args.run_duration or (run[1] - run[0]) * dt)
    add_clip(
        doc,
        out,
        "explode",
        explode_channels,
        args.explode_duration or (explode[1] - explode[0]) * dt,
    )

    size = write_glb(args.output, doc, out)
    print(f"{args.output.name}: {size / 1e6:.1f} MB (was {len(blob) / 1e6:.1f} MB of data)")
    print(f"  parts {parts}, annotation nodes {hidden}")
    print(f"  run: {len(run_channels)} channels, explode: {len(explode_channels)} channels")
    print(f"  worst additivity residual: {worst:.6f}")


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--run", help="START:END seconds of whole cycles while assembled")
    parser.add_argument("--run-duration", type=float, help="seconds one pass of the run clip takes")
    parser.add_argument(
        "--explode", required=True, help="START:END seconds of the assembled -> exploded move"
    )
    parser.add_argument("--explode-duration", type=float, help="seconds the Explode button takes")
    parser.add_argument(
        "--annotations", help="regex: matching nodes stay visible but are not parts"
    )
    parser.add_argument(
        "--view", help="x,y,z direction from the model towards the camera (glTF axes)"
    )
    parser.add_argument(
        "--view-fov", type=float, default=20.0, help="vertical field of view, degrees"
    )
    parser.add_argument(
        "--tolerance", type=float, default=1e-3, help="largest allowed additivity error"
    )
    args = parser.parse_args(argv)
    if args.input.resolve() == args.output.resolve():
        parser.error("output must be a different file")
    convert(args)


if __name__ == "__main__":
    sys.exit(main())
