"""Export the Human Anatomy Blender scene as a web GLB with its own motion.

    /Applications/Blender.app/Contents/MacOS/Blender --background human_anatomy.blend \
        --python scripts/export_human_anatomy.py -- out.glb

Run it on a copy: it strips the opened file down before exporting (it never saves the .blend).

The scene is driven by one control object: location = origin + offset * explode * explode_cycle,
and shape keys follow breath, ventricles and atria. Drivers don't survive glTF, so the rig is read
here and written into the GLB as two clips the Studio plays (see runtime/modelMotion.ts):

  explode     the fly-apart on Blender's timeline (frames 240-330), node translations
  physiology  one whole 20 s period of heartbeat and breathing (frames 1-481), morph weights

The source has 4.66M triangles, three times the app's budget. Each part is decimated and its shape
keys carried across by the nearest point on the original surface. The procedural materials become
flat PBR colours (the mean of their noise ramp), and the ghost skin a constant alpha.
"""

import json
import re
import sys
from pathlib import Path

import addon_utils
import bpy
import numpy as np
from mathutils.bvhtree import BVHTree

sys.path.insert(0, str(Path(__file__).resolve().parent))
from split_glb_clips import add_camera, add_floats, read_glb, write_glb  # noqa: E402

SUFFIX = " [Exploded]"
EXPLODE_FRAMES = (240, 330)
PERIOD_FRAMES = (1, 481)
RATIO = 0.26  # share of each part's triangles to keep
RATIOS = {"Skin Surface": 0.12, "Cerebrum": 0.34, "Cerebellum": 0.32}
MIN_TRIANGLES = 2000
SKIN_MATERIAL = "Skin Ghost"
SKIN_ALPHA = 0.16
TINY_MOVE = 1e-5  # metres; smaller shape key movement is stored as none
CAMERA_LENS_MM, CAMERA_SENSOR_MM = 82.0, 36.0
DRIVER = re.compile(r"^(-?[\d.]+)\+\((-?[\d.]+)\)\*e\*c$")
SIDES = {" R": " right", " L": " left"}


def slug(name: str) -> str:
    for short, long in SIDES.items():
        if name.endswith(short):
            name = name[: -len(short)] + long
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


def to_gltf(v: list[float]) -> list[float]:
    return [v[0], v[2], -v[1]]


def rig_curves(control: bpy.types.Object) -> dict[str, bpy.types.FCurve]:
    action = control.animation_data.action
    curves = {}
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for curve in bag.fcurves:
                    curves[curve.data_path.strip('["]')] = curve
    return curves


def read_transform(obj: bpy.types.Object) -> tuple[list[float], list[float]]:
    """Origin and full explode offset, from the location drivers."""
    origin, offset = [0.0] * 3, [0.0] * 3
    for driver in obj.animation_data.drivers:
        found = DRIVER.match(driver.driver.expression)
        if driver.data_path != "location" or not found:
            raise SystemExit(f"{obj.name}: unexpected driver {driver.driver.expression}")
        origin[driver.array_index] = float(found[1])
        offset[driver.array_index] = float(found[2])
    return origin, offset


def read_keys(mesh: bpy.types.Mesh) -> tuple[np.ndarray | None, dict[str, np.ndarray], dict[str, str]]:
    """Basis positions, each key's movement from the basis, and the rig value driving each key."""
    shapes = mesh.shape_keys
    if not shapes:
        return None, {}, {}
    count = len(mesh.vertices)

    def read(block: bpy.types.ShapeKey) -> np.ndarray:
        co = np.empty(count * 3, np.float32)
        block.data.foreach_get("co", co)
        return co.reshape(-1, 3)

    basis = read(shapes.key_blocks[0])
    moves = {b.name: read(b) - basis for b in shapes.key_blocks[1:]}
    drives = {}
    for driver in shapes.animation_data.drivers:
        key = driver.data_path.split('"')[1]
        drives[key] = driver.driver.variables[0].targets[0].data_path.strip('["]')
    return basis, moves, drives


def decimated(mesh: bpy.types.Mesh, basis: np.ndarray | None, ratio: float) -> bpy.types.Mesh:
    copy = mesh.copy()
    obj = bpy.data.objects.new("__decimate", copy)
    bpy.context.scene.collection.objects.link(obj)
    if copy.shape_keys:
        obj.shape_key_clear()
    if basis is not None:
        copy.vertices.foreach_set("co", basis.ravel())
    modifier = obj.modifiers.new("Decimate", "DECIMATE")
    modifier.decimate_type = "COLLAPSE"
    modifier.ratio = ratio
    bpy.context.view_layer.update()
    graph = bpy.context.evaluated_depsgraph_get()
    result = bpy.data.meshes.new_from_object(obj.evaluated_get(graph))
    bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.meshes.remove(copy)
    return result


def carry_keys(result: bpy.types.Mesh, obj: bpy.types.Object, source, basis, moves) -> None:
    """Each kept vertex moves like the nearest point on the original surface."""
    source.calc_loop_triangles()
    triangles = np.empty(len(source.loop_triangles) * 3, np.int32)
    source.loop_triangles.foreach_get("vertices", triangles)
    triangles = triangles.reshape(-1, 3)
    tree = BVHTree.FromPolygons(basis.tolist(), triangles.tolist(), all_triangles=True)

    co = np.empty(len(result.vertices) * 3, np.float32)
    result.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    hits = [tree.find_nearest(v) for v in co.tolist()]
    points = np.array([h[0] for h in hits], np.float64)
    corners = triangles[np.array([h[2] for h in hits])]

    a, b, c = (basis[corners[:, i]].astype(np.float64) for i in range(3))
    v0, v1, v2 = b - a, c - a, points - a
    d00, d01, d11 = (v0 * v0).sum(1), (v0 * v1).sum(1), (v1 * v1).sum(1)
    d20, d21 = (v2 * v0).sum(1), (v2 * v1).sum(1)
    denominator = np.where(np.abs(d00 * d11 - d01 * d01) < 1e-20, 1.0, d00 * d11 - d01 * d01)
    w1 = (d11 * d20 - d01 * d21) / denominator
    w2 = (d00 * d21 - d01 * d20) / denominator
    weights = np.clip(np.stack([1 - w1 - w2, w1, w2], 1), 0, 1)
    weights /= weights.sum(1, keepdims=True)

    obj.shape_key_add(name="Basis", from_mix=False)
    for name, move in moves.items():
        moved = (move[corners] * weights[:, :, None]).sum(1)
        moved[np.linalg.norm(moved, axis=1) < TINY_MOVE] = 0
        block = obj.shape_key_add(name=name, from_mix=False)
        block.data.foreach_set("co", (co + moved).astype(np.float32).ravel())


def flatten_material(material: bpy.types.Material) -> None:
    """Keep what glTF can carry: a constant colour, roughness and alpha."""
    tree = material.node_tree
    shader = next(n for n in tree.nodes if n.type == "BSDF_PRINCIPLED")
    output = next(n for n in tree.nodes if n.type == "OUTPUT_MATERIAL")
    colour = list(shader.inputs["Base Color"].default_value)
    if shader.inputs["Base Color"].is_linked:
        ramp = shader.inputs["Base Color"].links[0].from_node
        if ramp.type != "VALTORGB":
            raise SystemExit(f"{material.name}: Base Color comes from {ramp.type}")
        colour = list(np.mean([e.color for e in ramp.color_ramp.elements], axis=0))
    for node in list(tree.nodes):
        if node not in (shader, output):
            tree.nodes.remove(node)
    tree.links.new(shader.outputs[0], output.inputs["Surface"])
    shader.inputs["Base Color"].default_value = (*colour[:3], 1.0)
    shader.inputs["Metallic"].default_value = 0.0
    material.use_backface_culling = True


def build_parts() -> tuple[list[dict], dict]:
    control = bpy.data.objects["CONTROL Physiology"]
    curves = rig_curves(control)
    start, end = EXPLODE_FRAMES
    amounts = [curves["explode_cycle"].evaluate(f) for f in range(start, end + 1)]
    if abs(amounts[0]) > 1e-6 or abs(amounts[-1] - 1) > 1e-6:
        raise SystemExit(f"explode_cycle does not run 0 to 1 over {EXPLODE_FRAMES}")
    first, last = PERIOD_FRAMES
    frames = range(first, last + 1)
    period = {k: [max(0.0, min(1.0, curves[k].evaluate(f))) for f in frames] for k in ("breath", "ventricles", "atria")}
    for name, values in period.items():
        if abs(values[0] - values[-1]) > 1e-4:
            raise SystemExit(f"{name} does not close over {PERIOD_FRAMES}")

    for material in bpy.data.materials:
        flatten_material(material)

    systems = {
        o.name: c.name.replace(" (Exploded)", "")
        for c in bpy.data.collections
        if c.name.endswith(" (Exploded)")
        for o in c.objects
    }
    sources = [o for o in bpy.data.objects if o.type == "MESH" and o.name.endswith(SUFFIX)]
    parts = []
    built = []
    for source in sorted(sources, key=lambda o: o.name):
        name = source.name[: -len(SUFFIX)]
        origin, offset = read_transform(source)
        mesh = source.data
        basis, moves, drives = read_keys(mesh)
        triangles = sum(len(p.vertices) - 2 for p in mesh.polygons)
        ratio = max(RATIOS.get(name, RATIO), min(1.0, MIN_TRIANGLES / triangles))
        result = decimated(mesh, basis, ratio)
        built.append((slug(name), result, origin, mesh, basis, moves))
        parts.append(
            {
                "name": name,
                "slug": slug(name),
                "system": systems.get(source.name, "Body"),
                "origin": to_gltf(origin),
                "offset": to_gltf(offset),
                "targets": [drives[k] for k in moves],
                "source_triangles": triangles,
            }
        )
        print(f"{name}: {triangles} -> {sum(len(p.vertices) - 2 for p in result.polygons)}", flush=True)

    kept = [b[1] for b in built]
    keep_sources = [b[3] for b in built]
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for key_slug, result, origin, source_mesh, basis, moves in built:
        result.name = key_slug
        obj = bpy.data.objects.new(key_slug, result)
        bpy.context.scene.collection.objects.link(obj)
        obj.location = origin
        if moves:
            carry_keys(result, obj, source_mesh, basis, moves)
    del kept, keep_sources
    return parts, {"amounts": amounts, "period": period, "fps": bpy.context.scene.render.fps}


def export(path: Path) -> None:
    addon_utils.enable("io_scene_gltf2")
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        use_selection=False,
        export_yup=True,
        export_apply=False,
        export_animations=False,
        export_morph=True,
        export_morph_normal=False,
        export_morph_tangent=False,
        export_try_sparse_sk=False,
        export_skins=False,
        export_cameras=False,
        export_lights=False,
        export_texcoords=False,
        export_normals=True,
        export_tangents=False,
        export_materials="EXPORT",
        export_image_format="NONE",
    )


def add_motion(path: Path, parts: list[dict], rig: dict) -> None:
    doc, blob = read_glb(path)
    out = bytearray(blob)
    index = {n.get("name"): i for i, n in enumerate(doc["nodes"])}
    fps = rig["fps"]
    doc["animations"] = []

    # explode: the node's own translation, base + offset * amount
    amounts = rig["amounts"]
    times = add_floats(doc, out, [(i / fps,) for i in range(len(amounts))], "SCALAR", True)
    samplers, channels = [], []
    for part in parts:
        if not any(part["offset"]):
            continue
        values = [tuple(b + o * s for b, o in zip(part["origin"], part["offset"], strict=True)) for s in amounts]
        samplers.append({"input": times, "output": add_floats(doc, out, values, "VEC3"), "interpolation": "LINEAR"})
        channels.append({"sampler": len(samplers) - 1, "target": {"node": index[part["slug"]], "path": "translation"}})
    doc["animations"].append({"name": "explode", "samplers": samplers, "channels": channels})

    # physiology: morph weights, one accessor per distinct set of driving values
    period = rig["period"]
    keys = len(period["breath"])
    times = add_floats(doc, out, [(i / fps,) for i in range(keys)], "SCALAR", True)
    outputs: dict[tuple[str, ...], int] = {}
    samplers, channels = [], []
    for part in parts:
        targets = tuple(part["targets"])
        if not targets:
            continue
        if targets not in outputs:
            flat = [(period[t][k],) for k in range(keys) for t in targets]
            outputs[targets] = add_floats(doc, out, flat, "SCALAR")
        samplers.append({"input": times, "output": outputs[targets], "interpolation": "LINEAR"})
        channels.append({"sampler": len(samplers) - 1, "target": {"node": index[part["slug"]], "path": "weights"}})
    doc["animations"].append({"name": "physiology", "samplers": samplers, "channels": channels})

    # the Blender camera looks straight at the figure's front, so no rotation is needed
    fov = 2 * np.degrees(np.arctan(CAMERA_SENSOR_MM / 2 / CAMERA_LENS_MM))
    add_camera(doc, (0.0, 0.0, 1.0), float(fov))
    for node in doc["nodes"]:
        if "camera" in node:
            node.pop("rotation", None)
    # three.js de-duplicates names across meshes and nodes: only nodes keep theirs
    for mesh in doc["meshes"]:
        mesh.pop("name", None)
    for material in doc.get("materials", []):
        material.pop("doubleSided", None)
        if material.get("name") == SKIN_MATERIAL:
            material["alphaMode"] = "BLEND"
            colour = material["pbrMetallicRoughness"].get("baseColorFactor", [0.85, 0.66, 0.56, 1])
            material["pbrMetallicRoughness"]["baseColorFactor"] = [*colour[:3], SKIN_ALPHA]
    write_glb(path, doc, out)


def main() -> None:
    out = Path(sys.argv[sys.argv.index("--") + 1]).resolve()
    parts, rig = build_parts()
    export(out)
    add_motion(out, parts, rig)
    out.with_suffix(".parts.json").write_text(json.dumps(parts, indent=1))
    print(f"wrote {out}: {out.stat().st_size / 1e6:.1f} MB", flush=True)


main()
