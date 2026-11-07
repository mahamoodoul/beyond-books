"""Generates a SCHEMATIC heart GLB from simple ellipsoids — original work for development and
demos only. It is NOT anatomically accurate and must be replaced by a medically reviewed,
licensed model before any classroom use (design §7.5)."""

import json
import math
import struct

# name, centre (x, y, z), radii (x, y, z), RGBA colour
PARTS = [
    ("right_atrium", (-0.55, 0.65, 0.0), (0.42, 0.38, 0.40), (0.36, 0.50, 0.85, 1.0)),
    ("left_atrium", (0.55, 0.70, -0.05), (0.42, 0.36, 0.40), (0.85, 0.35, 0.35, 1.0)),
    ("right_ventricle", (-0.40, -0.25, 0.10), (0.55, 0.75, 0.50), (0.27, 0.40, 0.78, 1.0)),
    ("left_ventricle", (0.40, -0.35, 0.0), (0.60, 0.85, 0.55), (0.78, 0.22, 0.25, 1.0)),
    ("aorta", (0.15, 1.25, 0.0), (0.16, 0.45, 0.16), (0.90, 0.45, 0.40, 1.0)),
]


def _ellipsoid(
    c: tuple[float, ...], r: tuple[float, ...], seg: int = 24, rings: int = 16
) -> tuple[list[float], list[float], list[int]]:
    pos: list[float] = []
    nrm: list[float] = []
    idx: list[int] = []
    for i in range(rings + 1):
        th = math.pi * i / rings
        for j in range(seg + 1):
            ph = 2 * math.pi * j / seg
            ux, uy, uz = math.sin(th) * math.cos(ph), math.cos(th), math.sin(th) * math.sin(ph)
            pos += [c[0] + r[0] * ux, c[1] + r[1] * uy, c[2] + r[2] * uz]
            nx, ny, nz = ux / r[0], uy / r[1], uz / r[2]
            n = math.sqrt(nx * nx + ny * ny + nz * nz) or 1.0
            nrm += [nx / n, ny / n, nz / n]
    for i in range(rings):
        for j in range(seg):
            a = i * (seg + 1) + j
            b = a + seg + 1
            idx += [a, a + 1, b, b, a + 1, b + 1]
    return pos, nrm, idx


def build_glb(
    parts: list[
        tuple[
            str,
            tuple[float, float, float],
            tuple[float, float, float],
            tuple[float, float, float, float],
        ]
    ],
    scene_name: str = "model",
) -> bytes:
    """Build a GLB of named ellipsoids (one node + mesh per part)."""
    gltf: dict[str, object] = {
        "asset": {"version": "2.0", "generator": "edu3d demo_heart (schematic, CC0)"},
        "scene": 0,
        "scenes": [{"name": scene_name, "nodes": list(range(len(parts)))}],
        "nodes": [],
        "meshes": [],
        "materials": [],
        "accessors": [],
        "bufferViews": [],
        "buffers": [],
    }
    nodes, meshes, mats, accs, views = (
        gltf[k] for k in ("nodes", "meshes", "materials", "accessors", "bufferViews")
    )
    assert isinstance(nodes, list) and isinstance(meshes, list) and isinstance(mats, list)
    assert isinstance(accs, list) and isinstance(views, list)
    blob = bytearray()

    def view(data: bytes, target: int) -> int:
        while len(blob) % 4:
            blob.append(0)
        views.append(
            {"buffer": 0, "byteOffset": len(blob), "byteLength": len(data), "target": target}
        )
        blob.extend(data)
        return len(views) - 1

    for i, (name, c, r, rgba) in enumerate(parts):
        pos, nrm, idx = _ellipsoid(c, r)
        xs, ys, zs = pos[0::3], pos[1::3], pos[2::3]
        pv = view(struct.pack(f"<{len(pos)}f", *pos), 34962)
        nv = view(struct.pack(f"<{len(nrm)}f", *nrm), 34962)
        iv = view(struct.pack(f"<{len(idx)}H", *idx), 34963)
        accs.append(
            {
                "bufferView": pv,
                "componentType": 5126,
                "count": len(pos) // 3,
                "type": "VEC3",
                "min": [min(xs), min(ys), min(zs)],
                "max": [max(xs), max(ys), max(zs)],
            }
        )
        accs.append(
            {"bufferView": nv, "componentType": 5126, "count": len(nrm) // 3, "type": "VEC3"}
        )
        accs.append({"bufferView": iv, "componentType": 5123, "count": len(idx), "type": "SCALAR"})
        mats.append(
            {
                "name": f"{name}_mat",
                "pbrMetallicRoughness": {
                    "baseColorFactor": list(rgba),
                    "metallicFactor": 0.0,
                    "roughnessFactor": 0.6,
                },
            }
        )
        meshes.append(
            {
                "name": name,
                "primitives": [
                    {
                        "attributes": {"POSITION": 3 * i, "NORMAL": 3 * i + 1},
                        "indices": 3 * i + 2,
                        "material": i,
                    }
                ],
            }
        )
        nodes.append({"name": name, "mesh": i})

    while len(blob) % 4:
        blob.append(0)
    gltf["buffers"] = [{"byteLength": len(blob)}]
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


def build_heart_glb() -> bytes:
    return build_glb(PARTS, "heart_schematic")
