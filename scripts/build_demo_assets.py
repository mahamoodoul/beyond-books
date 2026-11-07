"""Build the demo GLB assets in packages/demo-assets (design §7.1-C, §7.4).

Pure numpy, no Blender, no network. Each asset is written as:

  packages/demo-assets/glb/<asset_id>.glb            binary glTF 2.0, one named node per component
  packages/demo-assets/metadata/<asset_id>.json      asset-registry record (license, hash, paths)

The node names in each GLB are the `mesh_name` values the scene fixtures reference, so the
renderer's scene resolver can map component_id -> mesh without guessing.

These are SCHEMATIC teaching placeholders built from primitives. They are not anatomically or
botanically accurate and must not be published to students as reviewed content (design §7.5).

Usage:  python scripts/build_demo_assets.py
"""

from __future__ import annotations

import hashlib
import json
import struct
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "packages" / "demo-assets"
GENERATOR = "edu3d scripts/build_demo_assets.py"

# --------------------------------------------------------------------------- geometry


@dataclass
class Geometry:
    positions: np.ndarray  # (n, 3) float32
    indices: np.ndarray  # (m, 3) uint32

    def merged(self, other: Geometry) -> Geometry:
        off = len(self.positions)
        return Geometry(
            np.vstack([self.positions, other.positions]),
            np.vstack([self.indices, other.indices + off]),
        )

    def transformed(self, matrix: np.ndarray) -> Geometry:
        p = np.c_[self.positions, np.ones(len(self.positions))] @ matrix.T
        return Geometry(p[:, :3], self.indices.copy())


def _grid_indices(rows: int, cols: int, wrap_cols: bool) -> np.ndarray:
    """Triangle indices for a (rows+1) x cols vertex grid."""
    tris = []
    ncols = cols if wrap_cols else cols - 1
    for r in range(rows):
        for c in range(ncols):
            c2 = (c + 1) % cols
            a, b = r * cols + c, r * cols + c2
            d, e = (r + 1) * cols + c, (r + 1) * cols + c2
            tris += [(a, d, b), (b, d, e)]
    return np.array(tris, dtype=np.uint32)


def ellipsoid(center, radii, rot=None, seg=32, rings=20, squash=None) -> Geometry:
    """UV ellipsoid. `squash(theta_y)` optionally tapers the shape (e.g. ventricle apex)."""
    theta = np.linspace(0, np.pi, rings + 1)  # pole to pole
    phi = np.linspace(0, 2 * np.pi, seg, endpoint=False)
    t, p = np.meshgrid(theta, phi, indexing="ij")
    y = np.cos(t)
    s = np.sin(t)
    if squash is not None:
        s = s * squash(y)
    pts = np.stack([s * np.cos(p), y, s * np.sin(p)], -1).reshape(-1, 3) * np.asarray(radii)
    if rot is not None:
        pts = pts @ np.asarray(rot).T
    return Geometry(pts + np.asarray(center), _grid_indices(rings, seg, True))


def tube(points, radius, seg=20, samples=64, cap=True) -> Geometry:
    """Tube along a Catmull-Rom curve through `points`."""
    pts = np.asarray(points, float)
    ctrl = np.vstack([pts[0] * 2 - pts[1], pts, pts[-1] * 2 - pts[-2]])
    curve = []
    for i in range(1, len(ctrl) - 2):
        p0, p1, p2, p3 = ctrl[i - 1 : i + 3]
        for u in np.linspace(0, 1, samples // (len(pts) - 1), endpoint=False):
            u2, u3 = u * u, u * u * u
            curve.append(
                0.5
                * (
                    2 * p1
                    + (-p0 + p2) * u
                    + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2
                    + (-p0 + 3 * p1 - 3 * p2 + p3) * u3
                )
            )
    curve.append(pts[-1])
    curve = np.array(curve)
    tang = np.gradient(curve, axis=0)
    tang /= np.linalg.norm(tang, axis=1, keepdims=True)
    # parallel-transport frame to avoid twisting
    ref = np.array([0, 0, 1.0]) if abs(tang[0][2]) < 0.9 else np.array([1.0, 0, 0])
    n = np.cross(tang[0], ref)
    n /= np.linalg.norm(n)
    rings = []
    ang = np.linspace(0, 2 * np.pi, seg, endpoint=False)
    for i, (c, tg) in enumerate(zip(curve, tang, strict=True)):
        if i:
            n = n - tg * np.dot(n, tg)
            n /= np.linalg.norm(n)
        b = np.cross(tg, n)
        rings.append(c + radius * (np.outer(np.cos(ang), n) + np.outer(np.sin(ang), b)))
    pos = np.vstack(rings)
    idx = _grid_indices(len(curve) - 1, seg, True)
    geo = Geometry(pos, idx)
    if cap:
        for end, flip in ((0, True), (len(curve) - 1, False)):
            ci = len(geo.positions)
            ring0 = end * seg
            capt = [(ci, ring0 + (k + 1) % seg, ring0 + k) for k in range(seg)]
            capt = np.array(capt, dtype=np.uint32)
            if not flip:
                capt = capt[:, [0, 2, 1]]
            geo = Geometry(np.vstack([geo.positions, curve[end]]), np.vstack([geo.indices, capt]))
    return geo


def cylinder_between(a, b, radius, seg=20) -> Geometry:
    return tube([a, (np.asarray(a) + np.asarray(b)) / 2, b], radius, seg=seg, samples=4)


def rounded_box(size, radius, center=(0, 0, 0), seg=10) -> Geometry:
    """Superellipsoid approximation of a rounded box — cheap and watertight."""
    hx, hy, hz = np.asarray(size) / 2
    g = ellipsoid((0, 0, 0), (1, 1, 1), seg=seg * 4, rings=seg * 2)
    p = g.positions
    e = 0.18 + 0.6 * radius / min(hx, hy, hz)  # smaller exponent -> boxier
    p = np.sign(p) * np.abs(p) ** e
    return Geometry(p * [hx, hy, hz] + np.asarray(center), g.indices)


def rot_z(deg):
    r = np.radians(deg)
    return np.array([[np.cos(r), -np.sin(r), 0], [np.sin(r), np.cos(r), 0], [0, 0, 1]])


def rot_x(deg):
    r = np.radians(deg)
    return np.array([[1, 0, 0], [0, np.cos(r), -np.sin(r)], [0, np.sin(r), np.cos(r)]])


def vertex_normals(g: Geometry) -> np.ndarray:
    p, f = g.positions, g.indices
    fn = np.cross(p[f[:, 1]] - p[f[:, 0]], p[f[:, 2]] - p[f[:, 0]])
    n = np.zeros_like(p)
    for k in range(3):
        np.add.at(n, f[:, k], fn)
    ln = np.linalg.norm(n, axis=1, keepdims=True)
    ln[ln == 0] = 1
    return n / ln


# --------------------------------------------------------------------------- GLB writer


@dataclass
class Part:
    name: str  # node + mesh name == scene mesh_name
    geometry: Geometry
    color: tuple[float, float, float, float]
    roughness: float = 0.55
    label: str = ""


@dataclass
class Asset:
    asset_id: str
    version: int
    name: str
    description: str
    subject: str
    category: str
    units: str
    parts: list[Part]
    paths: dict[str, list[list[float]]] = field(default_factory=dict)
    interactions: list[str] = field(default_factory=lambda: ["highlight", "show_explanation"])
    accuracy_note: str = ""


def write_glb(asset: Asset, path: Path) -> dict:
    bin_chunks: list[bytes] = []
    buffer_views, accessors, meshes, nodes, materials = [], [], [], [], []
    offset = 0

    def add_view(data: bytes, target: int) -> int:
        nonlocal offset
        pad = (-len(data)) % 4
        bin_chunks.append(data + b"\x00" * pad)
        buffer_views.append(
            {"buffer": 0, "byteOffset": offset, "byteLength": len(data), "target": target}
        )
        offset += len(data) + pad
        return len(buffer_views) - 1

    tri_total = 0
    for part in asset.parts:
        g = part.geometry
        # pivot at the component's centre so rotate_component / camera_focus behave
        pivot = (g.positions.min(0) + g.positions.max(0)) / 2
        pos = (g.positions - pivot).astype(np.float32)
        nrm = vertex_normals(g).astype(np.float32)
        use32 = len(pos) > 65535
        idx = g.indices.astype(np.uint32 if use32 else np.uint16).reshape(-1)
        tri_total += len(g.indices)

        v_pos = add_view(pos.tobytes(), 34962)
        v_nrm = add_view(nrm.tobytes(), 34962)
        v_idx = add_view(idx.tobytes(), 34963)
        a_pos = len(accessors)
        accessors.append(
            {
                "bufferView": v_pos,
                "componentType": 5126,
                "count": len(pos),
                "type": "VEC3",
                "min": pos.min(0).tolist(),
                "max": pos.max(0).tolist(),
            }
        )
        accessors.append(
            {"bufferView": v_nrm, "componentType": 5126, "count": len(nrm), "type": "VEC3"}
        )
        accessors.append(
            {
                "bufferView": v_idx,
                "componentType": 5125 if use32 else 5123,
                "count": len(idx),
                "type": "SCALAR",
            }
        )
        mat = {
            "name": f"{part.name}_mat",
            "pbrMetallicRoughness": {
                "baseColorFactor": list(part.color),
                "metallicFactor": 0.0,
                "roughnessFactor": part.roughness,
            },
        }
        if part.color[3] < 1:
            mat["alphaMode"] = "BLEND"
            mat["doubleSided"] = True
        materials.append(mat)
        meshes.append(
            {
                "name": part.name,
                "primitives": [
                    {
                        "attributes": {"POSITION": a_pos, "NORMAL": a_pos + 1},
                        "indices": a_pos + 2,
                        "material": len(materials) - 1,
                    }
                ],
            }
        )
        nodes.append(
            {
                "name": part.name,
                "mesh": len(meshes) - 1,
                "translation": [round(float(c), 6) for c in pivot],
            }
        )

    root = {"name": asset.asset_id, "children": list(range(len(nodes)))}
    nodes.append(root)
    gltf = {
        "asset": {"version": "2.0", "generator": GENERATOR, "copyright": "Edu3D demo placeholder"},
        "scene": 0,
        "scenes": [{"name": asset.asset_id, "nodes": [len(nodes) - 1]}],
        "nodes": nodes,
        "meshes": meshes,
        "materials": materials,
        "accessors": accessors,
        "bufferViews": buffer_views,
        "buffers": [{"byteLength": offset}],
    }
    js = json.dumps(gltf, separators=(",", ":")).encode()
    js += b" " * ((-len(js)) % 4)
    bin_data = b"".join(bin_chunks)
    total = 12 + 8 + len(js) + 8 + len(bin_data)
    glb = (
        struct.pack("<4sII", b"glTF", 2, total)
        + struct.pack("<I4s", len(js), b"JSON")
        + js
        + struct.pack("<I4s", len(bin_data), b"BIN\x00")
        + bin_data
    )
    path.write_bytes(glb)
    allp = np.vstack([p.geometry.positions for p in asset.parts])
    return {
        "bytes": len(glb),
        "sha256": hashlib.sha256(glb).hexdigest(),
        "triangles": int(tri_total),
        "bounds": {"min": allp.min(0).round(3).tolist(), "max": allp.max(0).round(3).tolist()},
    }


def write_metadata(asset: Asset, stats: dict) -> None:
    meta = {
        "asset_id": asset.asset_id,
        "version": asset.version,
        "name": asset.name,
        "description": asset.description,
        "subject": asset.subject,
        "category": asset.category,
        "format": "glb",
        "object_key": f"demo-assets/glb/{asset.asset_id}.glb",
        "preview_key": f"demo-assets/previews/{asset.asset_id}.png",
        "size_bytes": stats["bytes"],
        "content_hash": f"sha256:{stats['sha256']}",
        "triangle_count": stats["triangles"],
        "units": asset.units,
        "bounds": stats["bounds"],
        "components": [
            {"mesh_name": p.name, "label": p.label or p.name.replace("_", " ").capitalize()}
            for p in asset.parts
        ],
        "supported_interactions": asset.interactions,
        "animation_capabilities": [
            "highlight_component",
            "set_visibility",
            "set_opacity",
            "camera_focus",
            "show_annotation",
            *(["show_flow_particles", "move_along_path"] if asset.paths else []),
        ],
        "paths": {k: [[round(c, 3) for c in pt] for pt in v] for k, v in asset.paths.items()},
        "provider": {"source": "procedural_script", "generator": GENERATOR, "job_id": None},
        "license": {
            "spdx": "CC0-1.0",
            "source": "Generated in-repo by the Edu3D team",
            "attribution": None,
            "allowed_use": "development_and_demo_only",
        },
        "review_status": "draft_unreviewed",
        "accuracy_note": asset.accuracy_note,
    }
    (OUT / "metadata" / f"{asset.asset_id}.json").write_text(json.dumps(meta, indent=2) + "\n")


# --------------------------------------------------------------------------- assets

DEOXY = (0.30, 0.42, 0.78, 1.0)  # textbook convention: blue = oxygen-poor
OXY = (0.80, 0.18, 0.20, 1.0)  # red = oxygen-rich
DEOXY_VESSEL = (0.25, 0.36, 0.72, 1.0)
OXY_VESSEL = (0.74, 0.12, 0.16, 1.0)


def heart() -> Asset:
    """Schematic four-chamber heart, anterior view. Patient's right is -x (viewer's left)."""

    def ventricle_taper(y: np.ndarray) -> np.ndarray:
        return np.clip(0.55 + 0.45 * (y + 1) / 2, 0, 1) ** 0.6

    parts = [
        Part(
            "right_atrium",
            ellipsoid((-0.62, 0.55, 0.10), (0.42, 0.40, 0.40)),
            DEOXY,
            label="Right atrium",
        ),
        Part(
            "left_atrium",
            ellipsoid((0.52, 0.62, -0.25), (0.40, 0.36, 0.38)),
            OXY,
            label="Left atrium",
        ),
        Part(
            "right_ventricle",
            ellipsoid(
                (-0.30, -0.25, 0.28), (0.55, 0.78, 0.42), rot=rot_z(18), squash=ventricle_taper
            ),
            DEOXY,
            label="Right ventricle",
        ),
        Part(
            "left_ventricle",
            ellipsoid(
                (0.32, -0.40, -0.02), (0.55, 0.92, 0.52), rot=rot_z(22), squash=ventricle_taper
            ),
            OXY,
            label="Left ventricle",
        ),
        Part(
            "aorta",
            tube(
                [
                    (0.12, 0.30, 0.02),
                    (0.06, 1.15, 0.05),
                    (0.30, 1.55, -0.15),
                    (0.68, 1.35, -0.45),
                    (0.78, 0.40, -0.58),
                ],
                0.15,
            ),
            OXY_VESSEL,
            0.4,
            label="Aorta",
        ),
        Part(
            "pulmonary_trunk",
            tube(
                [(-0.18, 0.30, 0.40), (-0.05, 0.95, 0.40), (0.30, 1.20, 0.22), (0.85, 1.12, 0.05)],
                0.13,
            ),
            DEOXY_VESSEL,
            0.4,
            label="Pulmonary trunk",
        ),
        Part(
            "superior_vena_cava",
            tube([(-0.72, 1.55, 0.02), (-0.70, 1.20, 0.06), (-0.66, 0.85, 0.10)], 0.12),
            DEOXY_VESSEL,
            0.4,
            label="Superior vena cava",
        ),
        Part(
            "inferior_vena_cava",
            tube([(-0.55, -0.75, -0.12), (-0.62, -0.20, -0.02), (-0.64, 0.22, 0.06)], 0.12),
            DEOXY_VESSEL,
            0.4,
            label="Inferior vena cava",
        ),
        Part(
            "pulmonary_veins",
            tube([(1.25, 0.70, -0.30), (0.95, 0.66, -0.28), (0.78, 0.64, -0.26)], 0.08).merged(
                tube([(1.22, 0.42, -0.40), (0.95, 0.50, -0.34), (0.80, 0.55, -0.30)], 0.08)
            ),
            OXY_VESSEL,
            0.4,
            label="Pulmonary veins",
        ),
    ]
    paths = {
        # body -> right heart -> lungs
        "path_to_lungs": [
            [-0.72, 1.55, 0.02],
            [-0.66, 0.85, 0.10],
            [-0.62, 0.55, 0.10],
            [-0.35, -0.10, 0.30],
            [-0.18, 0.30, 0.40],
            [-0.05, 0.95, 0.40],
            [0.30, 1.20, 0.22],
            [0.85, 1.12, 0.05],
        ],
        # lungs -> left heart -> body
        "path_to_body": [
            [1.25, 0.70, -0.30],
            [0.78, 0.64, -0.26],
            [0.52, 0.62, -0.25],
            [0.35, -0.20, 0.00],
            [0.12, 0.30, 0.02],
            [0.06, 1.15, 0.05],
            [0.30, 1.55, -0.15],
            [0.68, 1.35, -0.45],
            [0.78, 0.40, -0.58],
        ],
    }
    return Asset(
        "human_heart_v1",
        1,
        "Human heart (schematic)",
        "Four-chamber schematic heart with great vessels for the circulatory-system pilot chapter.",
        "biology",
        "anatomy",
        "1 unit ≈ 5 cm",
        parts,
        paths,
        interactions=["highlight", "show_explanation", "toggle_visibility", "focus_camera"],
        accuracy_note="Schematic primitives only. Chamber shapes, vessel positions and valves are "
        "simplified; replace with a medically reviewed, licensed model before publishing.",
    )


def plant_cell() -> Asset:
    rng = np.random.default_rng(7)
    chloro = None
    for i in range(7):
        a = i / 7 * 2 * np.pi + rng.uniform(-0.2, 0.2)
        c = (1.15 * np.cos(a), 0.55 * np.sin(a) * 1.4, rng.uniform(-0.45, 0.45))
        g = ellipsoid(c, (0.22, 0.12, 0.12), rot=rot_z(np.degrees(a) + 90), seg=20, rings=12)
        chloro = g if chloro is None else chloro.merged(g)
    mito = None
    for c, ang in [((-1.0, -0.55, 0.45), 30), ((0.9, -0.6, -0.4), -40), ((-0.2, 0.75, -0.5), 75)]:
        g = ellipsoid(c, (0.20, 0.08, 0.08), rot=rot_z(ang), seg=18, rings=10)
        mito = g if mito is None else mito.merged(g)
    parts = [
        Part(
            "cell_wall",
            rounded_box((3.2, 2.2, 1.6), 0.25),
            (0.45, 0.70, 0.30, 0.35),
            label="Cell wall",
        ),
        Part(
            "cell_membrane",
            rounded_box((3.0, 2.0, 1.4), 0.22),
            (0.85, 0.80, 0.45, 0.30),
            label="Cell membrane",
        ),
        Part(
            "central_vacuole",
            ellipsoid((0.15, 0.05, 0.0), (0.85, 0.55, 0.45)),
            (0.55, 0.75, 0.95, 0.85),
            0.2,
            label="Central vacuole",
        ),
        Part(
            "nucleus",
            ellipsoid((-0.95, 0.25, 0.0), (0.33, 0.30, 0.30)),
            (0.55, 0.35, 0.70, 1.0),
            label="Nucleus",
        ),
        Part("chloroplasts", chloro, (0.20, 0.62, 0.22, 1.0), label="Chloroplasts"),
        Part("mitochondria", mito, (0.92, 0.55, 0.25, 1.0), label="Mitochondria"),
    ]
    return Asset(
        "plant_cell_v1",
        1,
        "Plant cell (schematic)",
        "Simplified plant cell with wall, membrane, vacuole, nucleus, chloroplasts, mitochondria.",
        "biology",
        "cell_biology",
        "arbitrary (not to scale)",
        parts,
        interactions=["highlight", "show_explanation", "toggle_visibility", "focus_camera"],
        accuracy_note="Organelles are not to scale; ER, Golgi and ribosomes are omitted.",
    )


def water() -> Asset:
    bond, angle = 0.9584, np.radians(104.45)  # experimental O-H length (Å) and H-O-H angle
    o = np.array([0.0, 0.0, 0.0])
    h1 = bond * np.array([np.sin(angle / 2), -np.cos(angle / 2), 0])
    h2 = bond * np.array([-np.sin(angle / 2), -np.cos(angle / 2), 0])
    parts = [
        Part("oxygen", ellipsoid(o, (0.30,) * 3), (0.90, 0.13, 0.13, 1.0), 0.35, "Oxygen atom"),
        Part(
            "hydrogen_1", ellipsoid(h1, (0.20,) * 3), (0.95, 0.95, 0.95, 1.0), 0.35, "Hydrogen atom"
        ),
        Part(
            "hydrogen_2", ellipsoid(h2, (0.20,) * 3), (0.95, 0.95, 0.95, 1.0), 0.35, "Hydrogen atom"
        ),
    ]
    grey = (0.75, 0.75, 0.78, 1.0)
    for i, h in enumerate((h1, h2), start=1):
        # bond runs from the oxygen surface to the hydrogen surface
        geo = cylinder_between(o + 0.27 * h / bond, h * (1 - 0.17 / bond), 0.06)
        parts.append(Part(f"bond_{i}", geo, grey, 0.5, "O–H covalent bond"))
    return Asset(
        "water_molecule_v1",
        1,
        "Water molecule (H2O)",
        "Ball-and-stick water molecule with experimental bond length and angle.",
        "chemistry",
        "molecular_model",
        "1 unit = 1 Å",
        parts,
        accuracy_note="Geometry uses experimental gas-phase values (O–H 0.958 Å, 104.45°). "
        "Atom radii are ball-and-stick display sizes, not van der Waals radii.",
    )


def main() -> None:
    for sub in ("glb", "metadata", "previews"):
        (OUT / sub).mkdir(parents=True, exist_ok=True)
    for asset in (heart(), plant_cell(), water()):
        stats = write_glb(asset, OUT / "glb" / f"{asset.asset_id}.glb")
        write_metadata(asset, stats)
        print(f"{asset.asset_id:20s} {stats['triangles']:6d} tris  {stats['bytes'] / 1024:7.1f} KB")


if __name__ == "__main__":
    main()
