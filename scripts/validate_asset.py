"""Validate a GLB asset + its registry metadata + the scenes/animations that use it.

Checks (design §7.2, §7.4, §7.7, §12):
  GLB      valid glTF 2.0 binary, all buffers embedded (no external/data URIs), no
           extensions required, every mesh node named, triangle and size budgets.
  Metadata content hash and size match the file; every listed component exists as a node.
  Scenes   (optional) every component.mesh_name exists in the GLB; scene validates against
           the Pydantic contract.
  Anims    (optional) validate against the contract, targets exist in the scene, path_id values
           exist in the asset metadata.

Usage:
  python scripts/validate_asset.py packages/demo-assets/metadata/human_heart_v1.json \
      --scene packages/three-d-contracts/fixtures/scene_heart_02.json \
      --animation packages/three-d-contracts/fixtures/animation_double_circulation_01.json \
      [--preview packages/demo-assets/previews/human_heart_v1.png] [--show-paths]

Exit code 0 = all checks passed.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

MAX_TRIANGLES = 3_000_000  # per asset; raised from 150k for high-detail Blender assets (needs team sign-off)
MAX_BYTES = 64 * 1024 * 1024  # raised from 15 MB with the triangle budget (uncompressed GLB)
COMPONENT_TYPES = {
    5120: np.int8,
    5121: np.uint8,
    5122: np.int16,
    5123: np.uint16,
    5125: np.uint32,
    5126: np.float32,
}
TYPE_SIZES = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


def read_glb(path: Path) -> tuple[dict, bytes]:
    data = path.read_bytes()
    magic, version, length = struct.unpack_from("<4sII", data, 0)
    if magic != b"glTF" or version != 2 or length != len(data):
        raise ValueError("not a glTF 2.0 binary (bad header)")
    jlen, jtype = struct.unpack_from("<I4s", data, 12)
    if jtype != b"JSON":
        raise ValueError("first chunk is not JSON")
    gltf = json.loads(data[20 : 20 + jlen])
    rest = 20 + jlen
    binary = b""
    if rest < len(data):
        blen, btype = struct.unpack_from("<I4s", data, rest)
        if btype != b"BIN\x00":
            raise ValueError("second chunk is not BIN")
        binary = data[rest + 8 : rest + 8 + blen]
    return gltf, binary


def accessor_array(gltf: dict, binary: bytes, idx: int) -> np.ndarray:
    acc = gltf["accessors"][idx]
    view = gltf["bufferViews"][acc["bufferView"]]
    dtype = COMPONENT_TYPES[acc["componentType"]]
    n = TYPE_SIZES[acc["type"]]
    start = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
    arr = np.frombuffer(binary, dtype=dtype, count=acc["count"] * n, offset=start)
    return arr.reshape(acc["count"], n) if n > 1 else arr


def mesh_parts(gltf: dict, binary: bytes):
    """Yield (node_name, positions, triangles, rgba) for every mesh node.

    Applies node translations only (the convention for registry assets: no rotation/scale baked
    into component nodes).
    """
    for node in gltf.get("nodes", []):
        if "mesh" not in node:
            continue
        offset = np.asarray(node.get("translation", [0, 0, 0]), float)
        for prim in gltf["meshes"][node["mesh"]]["primitives"]:
            pos = accessor_array(gltf, binary, prim["attributes"]["POSITION"]) + offset
            tri = accessor_array(gltf, binary, prim["indices"]).reshape(-1, 3)
            mat = gltf.get("materials", [{}])[prim.get("material", 0)]
            rgba = mat.get("pbrMetallicRoughness", {}).get("baseColorFactor", [0.8] * 3 + [1])
            yield node.get("name"), pos, tri, rgba


def check(
    meta_path: Path,
    scenes: list[Path],
    animations: list[Path],
    preview: Path | None,
    show_paths: bool = False,
):
    errors: list[str] = []
    meta = json.loads(meta_path.read_text())
    glb_path = ROOT / "packages" / meta["object_key"]
    raw = glb_path.read_bytes()
    gltf, binary = read_glb(glb_path)

    # --- GLB hygiene
    for b in gltf.get("buffers", []):
        if "uri" in b:
            errors.append("buffer uses an external/data URI; all data must be embedded")
    for img in gltf.get("images", []):
        if "uri" in img:
            errors.append(f"image uses a URI ({img['uri'][:40]}); embed it in the GLB")
    if gltf.get("extensionsRequired"):
        errors.append(f"requires extensions {gltf['extensionsRequired']} (check renderer support)")
    node_names = {n.get("name") for n in gltf.get("nodes", []) if "mesh" in n}
    if None in node_names:
        errors.append("a mesh node has no name; components cannot be resolved")
    for n in gltf.get("nodes", []):
        if "mesh" in n and ("rotation" in n or "scale" in n or "matrix" in n):
            errors.append(f"{n.get('name')}: apply rotation/scale before export (keep translation)")
    tris = sum(len(t) for _, _, t, _ in mesh_parts(gltf, binary))
    if tris > MAX_TRIANGLES:
        errors.append(f"{tris} triangles exceeds budget {MAX_TRIANGLES}")
    if len(raw) > MAX_BYTES:
        errors.append(f"{len(raw)} bytes exceeds budget {MAX_BYTES}")
    for name, pos, tri, _ in mesh_parts(gltf, binary):
        if not np.isfinite(pos).all():
            errors.append(f"{name}: non-finite vertex positions")
        if tri.size and tri.max() >= len(pos):
            errors.append(f"{name}: index out of range")

    # --- metadata vs file
    digest = "sha256:" + hashlib.sha256(raw).hexdigest()
    if meta["content_hash"] != digest:
        errors.append("content_hash does not match the GLB (rebuild metadata)")
    if meta["size_bytes"] != len(raw):
        errors.append("size_bytes does not match the GLB")
    if meta["triangle_count"] != tris:
        errors.append("triangle_count does not match the GLB")
    listed = {c["mesh_name"] for c in meta["components"]}
    if missing := sorted(listed - node_names):
        errors.append(f"metadata lists components missing from GLB: {missing}")
    if meta["license"].get("spdx") in (None, "", "UNKNOWN"):
        errors.append("license is missing")

    # --- scenes and animations against the canonical contracts
    from app.modules.three_d.contracts import (
        AnimationSpec,
        SceneSpec,
        validate_animation_for_scene,
    )

    parsed_scenes = []
    for sp in scenes:
        scene = SceneSpec.model_validate_json(sp.read_text())
        parsed_scenes.append(scene)
        refs = {(a.asset_id, a.version) for a in scene.asset_refs}
        if (meta["asset_id"], meta["version"]) not in refs:
            errors.append(f"{sp.name}: does not reference {meta['asset_id']} v{meta['version']}")
        for c in scene.components:
            if c.mesh_name not in node_names:
                errors.append(f"{sp.name}: mesh_name '{c.mesh_name}' not found in GLB")
    for ap in animations:
        anim = AnimationSpec.model_validate_json(ap.read_text())
        owners = [s for s in parsed_scenes if anim.animation_id in s.animation_refs]
        if not owners:
            errors.append(f"{ap.name}: no given scene references '{anim.animation_id}'")
        for s in owners:
            errors += [f"{ap.name}: {p}" for p in validate_animation_for_scene(anim, s)]
        for st in anim.steps:
            if (pid := getattr(st, "path_id", None)) and pid not in meta.get("paths", {}):
                errors.append(f"{ap.name}: step {st.step} path_id '{pid}' not in asset metadata")

    if preview:
        render_preview(gltf, binary, preview, meta.get("paths", {}) if show_paths else {})

    status = "OK " if not errors else "FAIL"
    print(
        f"[{status}] {meta['asset_id']} v{meta['version']}: {len(node_names)} meshes, "
        f"{tris} tris, {len(raw) / 1024:.0f} KB, {len(scenes)} scene(s), "
        f"{len(animations)} animation(s)"
    )
    for e in errors:
        print(f"   - {e}")
    return not errors


def render_preview(gltf: dict, binary: bytes, out: Path, paths: dict) -> None:
    """Flat-shaded PNG thumbnail straight from the GLB buffers (proves the file round-trips)."""
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.collections import PolyCollection

    yaw, pitch = np.radians(-28), np.radians(14)
    ry = np.array([[np.cos(yaw), 0, np.sin(yaw)], [0, 1, 0], [-np.sin(yaw), 0, np.cos(yaw)]])
    c, s = np.cos(pitch), np.sin(pitch)
    rx = np.array([[1, 0, 0], [0, c, -s], [0, s, c]])
    view = rx @ ry
    light = np.array([0.4, 0.6, 1.0]) / np.linalg.norm([0.4, 0.6, 1.0])

    polys, colors, depths = [], [], []
    for _, pos, tri, rgba in mesh_parts(gltf, binary):
        p = pos.astype(float) @ view.T
        t = p[tri]
        n = np.cross(t[:, 1] - t[:, 0], t[:, 2] - t[:, 0])
        n /= np.linalg.norm(n, axis=1, keepdims=True) + 1e-12
        alpha = rgba[3]
        keep = n[:, 2] > 0 if alpha >= 1 else np.ones(len(t), bool)  # back-face cull opaque
        shade = 0.35 + 0.65 * np.clip(np.abs(n @ light), 0, 1)
        base = np.array(rgba[:3])
        for tt, sh in zip(t[keep], shade[keep], strict=True):
            polys.append(tt[:, :2])
            colors.append((*np.clip(base * sh, 0, 1), alpha * (0.55 if alpha < 1 else 1)))
            depths.append(tt[:, 2].mean())
    order = np.argsort(depths)
    fig, ax = plt.subplots(figsize=(4, 4), dpi=160)
    ax.add_collection(
        PolyCollection(
            [polys[i] for i in order], facecolors=[colors[i] for i in order], edgecolors="none"
        )
    )
    for pts in paths.values():
        q = np.asarray(pts) @ view.T
        ax.plot(q[:, 0], q[:, 1], color="#f2c94c", lw=1.2, ls="--", zorder=10)
    allp = np.vstack([pp for pp in polys])
    ax.set_xlim(allp[:, 0].min() - 0.1, allp[:, 0].max() + 0.1)
    ax.set_ylim(allp[:, 1].min() - 0.1, allp[:, 1].max() + 0.1)
    ax.set_aspect("equal")
    ax.axis("off")
    fig.patch.set_facecolor("#14161a")
    out.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out, bbox_inches="tight", facecolor=fig.get_facecolor())
    plt.close(fig)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    ap.add_argument("metadata", type=Path)
    ap.add_argument("--scene", type=Path, action="append", default=[])
    ap.add_argument("--animation", type=Path, action="append", default=[])
    ap.add_argument("--preview", type=Path, help="write a PNG thumbnail rendered from the GLB")
    ap.add_argument("--show-paths", action="store_true", help="overlay metadata paths on preview")
    a = ap.parse_args()
    return 0 if check(a.metadata, a.scene, a.animation, a.preview, a.show_paths) else 1


if __name__ == "__main__":
    raise SystemExit(main())
