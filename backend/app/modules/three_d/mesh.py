"""Primitive geometry + a general GLB writer (no third-party dependencies).

Used to turn a validated, declarative model description (from an LLM or a template) into a
binary glTF 2.0 file that the normal asset pipeline validates, stores and three.js renders.
Each part becomes one node + mesh named after the part, so scene components can target it.
"""

import json
import math
import struct
from dataclasses import dataclass

Vec3 = tuple[float, float, float]


@dataclass(frozen=True)
class Geometry:
    positions: list[float]
    normals: list[float]
    indices: list[int]


@dataclass(frozen=True)
class MeshPart:
    name: str
    geometry: Geometry
    rgba: tuple[float, float, float, float]
    translation: Vec3 = (0.0, 0.0, 0.0)
    rotation_deg: Vec3 = (0.0, 0.0, 0.0)  # XYZ Euler, degrees (three.js default order)
    roughness: float = 0.6
    metallic: float = 0.0


def _merge(parts: list[Geometry]) -> Geometry:
    pos: list[float] = []
    nrm: list[float] = []
    idx: list[int] = []
    for g in parts:
        base = len(pos) // 3
        pos += g.positions
        nrm += g.normals
        idx += [i + base for i in g.indices]
    return Geometry(pos, nrm, idx)


def box(w: float, h: float, d: float) -> Geometry:
    x, y, z = w / 2, h / 2, d / 2
    faces = [  # normal, 4 corners (counter-clockwise seen from outside)
        ((1, 0, 0), [(x, -y, z), (x, -y, -z), (x, y, -z), (x, y, z)]),
        ((-1, 0, 0), [(-x, -y, -z), (-x, -y, z), (-x, y, z), (-x, y, -z)]),
        ((0, 1, 0), [(-x, y, z), (x, y, z), (x, y, -z), (-x, y, -z)]),
        ((0, -1, 0), [(-x, -y, -z), (x, -y, -z), (x, -y, z), (-x, -y, z)]),
        ((0, 0, 1), [(-x, -y, z), (x, -y, z), (x, y, z), (-x, y, z)]),
        ((0, 0, -1), [(x, -y, -z), (-x, -y, -z), (-x, y, -z), (x, y, -z)]),
    ]
    pos: list[float] = []
    nrm: list[float] = []
    idx: list[int] = []
    for n, corners in faces:
        b = len(pos) // 3
        for c in corners:
            pos += list(c)
            nrm += list(n)
        idx += [b, b + 1, b + 2, b, b + 2, b + 3]
    return Geometry(pos, nrm, idx)


def ellipsoid(rx: float, ry: float, rz: float, seg: int = 32, rings: int = 20) -> Geometry:
    pos: list[float] = []
    nrm: list[float] = []
    idx: list[int] = []
    for i in range(rings + 1):
        th = math.pi * i / rings
        for j in range(seg + 1):
            ph = 2 * math.pi * j / seg
            ux, uy, uz = math.sin(th) * math.cos(ph), math.cos(th), math.sin(th) * math.sin(ph)
            pos += [rx * ux, ry * uy, rz * uz]
            nx, ny, nz = ux / rx, uy / ry, uz / rz
            n = math.sqrt(nx * nx + ny * ny + nz * nz) or 1.0
            nrm += [nx / n, ny / n, nz / n]
    for i in range(rings):
        for j in range(seg):
            a = i * (seg + 1) + j
            b = a + seg + 1
            idx += [a, b, a + 1, b, b + 1, a + 1]
    return Geometry(pos, nrm, idx)


def _lathe(profile: list[tuple[float, float]], seg: int = 32) -> Geometry:
    """Revolve (radius, y) points (bottom → top) around the Y axis."""
    pos: list[float] = []
    nrm: list[float] = []
    idx: list[int] = []
    n = len(profile)
    for i, (r, y) in enumerate(profile):
        r0, y0 = profile[max(0, i - 1)]
        r1, y1 = profile[min(n - 1, i + 1)]
        dr, dy = r1 - r0, y1 - y0
        ln = math.hypot(dr, dy) or 1.0
        pr, py = dy / ln, -dr / ln  # outward normal in the profile plane
        for j in range(seg + 1):
            ph = 2 * math.pi * j / seg
            c, s = math.cos(ph), math.sin(ph)
            pos += [r * c, y, r * s]
            nrm += [pr * c, py, pr * s]
    for i in range(n - 1):
        for j in range(seg):
            a = i * (seg + 1) + j
            b = a + seg + 1
            idx += [a, b, a + 1, b, b + 1, a + 1]
    return Geometry(pos, nrm, idx)


def _disc(r: float, y: float, up: bool, seg: int = 32) -> Geometry:
    pos = [0.0, y, 0.0]
    ny = 1.0 if up else -1.0
    nrm = [0.0, ny, 0.0]
    idx: list[int] = []
    for j in range(seg + 1):
        ph = 2 * math.pi * j / seg
        pos += [r * math.cos(ph), y, r * math.sin(ph)]
        nrm += [0.0, ny, 0.0]
    for j in range(1, seg + 1):
        idx += [0, j + 1, j] if up else [0, j, j + 1]
    return Geometry(pos, nrm, idx)


def cylinder(r_top: float, r_bottom: float, h: float) -> Geometry:
    y = h / 2
    parts = [_lathe([(r_bottom, -y), (r_top, y)])]
    if r_bottom > 0:
        parts.append(_disc(r_bottom, -y, up=False))
    if r_top > 0:
        parts.append(_disc(r_top, y, up=True))
    return _merge(parts)


def capsule(r: float, length: float, steps: int = 8) -> Geometry:
    y = length / 2
    prof = [
        (r * math.sin(math.pi / 2 * k / steps), -y - r * math.cos(math.pi / 2 * k / steps))
        for k in range(steps + 1)
    ]
    prof += [
        (r * math.cos(math.pi / 2 * k / steps), y + r * math.sin(math.pi / 2 * k / steps))
        for k in range(steps + 1)
    ]
    return _lathe(prof)


def torus(radius: float, tube: float, seg: int = 40, tube_seg: int = 16) -> Geometry:
    pos: list[float] = []
    nrm: list[float] = []
    idx: list[int] = []
    for i in range(seg + 1):
        u = 2 * math.pi * i / seg
        for j in range(tube_seg + 1):
            v = 2 * math.pi * j / tube_seg
            cx, cz = radius * math.cos(u), radius * math.sin(u)
            nx, ny, nz = math.cos(v) * math.cos(u), math.sin(v), math.cos(v) * math.sin(u)
            pos += [cx + tube * nx, tube * ny, cz + tube * nz]
            nrm += [nx, ny, nz]
    for i in range(seg):
        for j in range(tube_seg):
            a = i * (tube_seg + 1) + j
            b = a + tube_seg + 1
            idx += [a, a + 1, b, b, a + 1, b + 1]
    return Geometry(pos, nrm, idx)


def _quat_from_euler_deg(rx: float, ry: float, rz: float) -> list[float]:
    """XYZ intrinsic order, matching three.js Euler 'XYZ'. Returns [x, y, z, w]."""
    x, y, z = (math.radians(a) / 2 for a in (rx, ry, rz))
    c1, c2, c3 = math.cos(x), math.cos(y), math.cos(z)
    s1, s2, s3 = math.sin(x), math.sin(y), math.sin(z)
    return [
        s1 * c2 * c3 + c1 * s2 * s3,
        c1 * s2 * c3 - s1 * c2 * s3,
        c1 * c2 * s3 + s1 * s2 * c3,
        c1 * c2 * c3 - s1 * s2 * s3,
    ]


def write_glb(parts: list[MeshPart], scene_name: str = "model", generator: str = "edu3d") -> bytes:
    nodes: list[dict[str, object]] = []
    meshes: list[dict[str, object]] = []
    mats: list[dict[str, object]] = []
    accs: list[dict[str, object]] = []
    views: list[dict[str, object]] = []
    blob = bytearray()

    def view(data: bytes, target: int) -> int:
        while len(blob) % 4:
            blob.append(0)
        views.append(
            {"buffer": 0, "byteOffset": len(blob), "byteLength": len(data), "target": target}
        )
        blob.extend(data)
        return len(views) - 1

    for i, p in enumerate(parts):
        g = p.geometry
        nverts = len(g.positions) // 3
        xs, ys, zs = g.positions[0::3], g.positions[1::3], g.positions[2::3]
        pv = view(struct.pack(f"<{len(g.positions)}f", *g.positions), 34962)
        nv = view(struct.pack(f"<{len(g.normals)}f", *g.normals), 34962)
        big = nverts > 65535
        iv = view(struct.pack(f"<{len(g.indices)}{'I' if big else 'H'}", *g.indices), 34963)
        a0 = len(accs)
        accs.append(
            {
                "bufferView": pv,
                "componentType": 5126,
                "count": nverts,
                "type": "VEC3",
                "min": [min(xs), min(ys), min(zs)],
                "max": [max(xs), max(ys), max(zs)],
            }
        )
        accs.append({"bufferView": nv, "componentType": 5126, "count": nverts, "type": "VEC3"})
        accs.append(
            {
                "bufferView": iv,
                "componentType": 5125 if big else 5123,
                "count": len(g.indices),
                "type": "SCALAR",
            }
        )
        mats.append(
            {
                "name": f"{p.name}_mat",
                "pbrMetallicRoughness": {
                    "baseColorFactor": list(p.rgba),
                    "metallicFactor": p.metallic,
                    "roughnessFactor": p.roughness,
                },
                **({"alphaMode": "BLEND"} if p.rgba[3] < 1 else {}),
            }
        )
        meshes.append(
            {
                "name": p.name,
                "primitives": [
                    {
                        "attributes": {"POSITION": a0, "NORMAL": a0 + 1},
                        "indices": a0 + 2,
                        "material": i,
                    }
                ],
            }
        )
        node: dict[str, object] = {"name": p.name, "mesh": i}
        if any(p.translation):
            node["translation"] = list(p.translation)
        if any(p.rotation_deg):
            node["rotation"] = _quat_from_euler_deg(*p.rotation_deg)
        nodes.append(node)

    while len(blob) % 4:
        blob.append(0)
    gltf = {
        "asset": {"version": "2.0", "generator": generator},
        "scene": 0,
        "scenes": [{"name": scene_name, "nodes": list(range(len(parts)))}],
        "nodes": nodes,
        "meshes": meshes,
        "materials": mats,
        "accessors": accs,
        "bufferViews": views,
        "buffers": [{"byteLength": len(blob)}],
    }
    js = json.dumps(gltf, separators=(",", ":")).encode()
    js += b" " * ((4 - len(js) % 4) % 4)
    total = 12 + 8 + len(js) + 8 + len(blob)
    return (
        struct.pack("<4sII", b"glTF", 2, total)
        + struct.pack("<II", len(js), 0x4E4F534A)
        + js
        + struct.pack("<II", len(blob), 0x004E4942)
        + bytes(blob)
    )
