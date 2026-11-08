"""Write the asset-registry record for a GLB exported from Blender (design §7.4).

    python scripts/write_asset_metadata.py packages/demo-assets/source/plant_cell_v2.asset.json

The spec file holds the hand-authored fields (name, labels, explode offsets, license, ...).
This script adds what must come from the file itself: object/preview keys, size, content hash,
triangle count and bounds, and writes packages/demo-assets/metadata/<asset_id>.json.

Dependency-free (no numpy), so it runs anywhere. Validate afterwards with
scripts/validate_asset.py, which also renders the preview.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "packages" / "demo-assets"
ORDER = [
    "asset_id",
    "version",
    "name",
    "description",
    "subject",
    "category",
    "format",
    "object_key",
    "preview_key",
    "size_bytes",
    "content_hash",
    "triangle_count",
    "units",
    "bounds",
    "components",
    "supported_interactions",
    "animation_capabilities",
    "paths",
    "provider",
    "license",
    "review_status",
    "accuracy_note",
]


def read_gltf_json(data: bytes) -> dict:
    magic, version, length = struct.unpack_from("<4sII", data, 0)
    if (magic, version, length) != (b"glTF", 2, len(data)):
        raise SystemExit("not a glTF 2.0 binary")
    jlen, jtype = struct.unpack_from("<I4s", data, 12)
    if jtype != b"JSON":
        raise SystemExit("first GLB chunk is not JSON")
    return json.loads(data[20 : 20 + jlen])


def node_offsets(gltf: dict) -> list[list[float]]:
    """Rest translation of every node in world space (parents' translations added): moving parts
    are child meshes under their component's node."""
    nodes = gltf.get("nodes", [])
    parent = {c: i for i, n in enumerate(nodes) for c in n.get("children", [])}
    out = []
    for i in range(len(nodes)):
        t = [0.0, 0.0, 0.0]
        j: int | None = i
        while j is not None:
            for k, v in enumerate(nodes[j].get("translation", [0.0, 0.0, 0.0])):
                t[k] += v
            j = parent.get(j)
        out.append(t)
    return out


def component_nodes(gltf: dict) -> set[str]:
    """Names of nodes that can be components: a mesh node, or a group with meshes below it."""
    nodes = gltf.get("nodes", [])

    def has_mesh(i: int) -> bool:
        return "mesh" in nodes[i] or any(has_mesh(c) for c in nodes[i].get("children", []))

    return {n["name"] for i, n in enumerate(nodes) if n.get("name") and has_mesh(i)}


def stats(gltf: dict) -> tuple[int, list[float], list[float]]:
    """Triangle count and world bounds (node translations only, per the asset convention)."""
    tris = 0
    lo = [float("inf")] * 3
    hi = [float("-inf")] * 3
    offsets = node_offsets(gltf)
    for i, node in enumerate(gltf.get("nodes", [])):
        if "mesh" not in node:
            continue
        t = offsets[i]
        for prim in gltf["meshes"][node["mesh"]]["primitives"]:
            if prim.get("mode", 4) != 4:
                continue
            idx = prim.get("indices")
            pos = gltf["accessors"][prim["attributes"]["POSITION"]]
            tris += (gltf["accessors"][idx]["count"] if idx is not None else pos["count"]) // 3
            for k in range(3):
                lo[k] = min(lo[k], pos["min"][k] + t[k])
                hi[k] = max(hi[k], pos["max"][k] + t[k])
    return tris, [round(v, 3) for v in lo], [round(v, 3) for v in hi]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("spec", type=Path, help="hand-authored <asset_id>.asset.json")
    spec = json.loads(ap.parse_args().spec.read_text())
    asset_id = spec["asset_id"]
    glb = ASSETS / "glb" / f"{asset_id}.glb"
    raw = glb.read_bytes()
    gltf = read_gltf_json(raw)
    tris, lo, hi = stats(gltf)

    nodes = component_nodes(gltf)
    missing = [c["mesh_name"] for c in spec["components"] if c["mesh_name"] not in nodes]
    if missing:
        print(f"components missing from {glb.name}: {missing}", file=sys.stderr)
        return 1

    meta = {
        **spec,
        "format": "glb",
        "object_key": f"demo-assets/glb/{asset_id}.glb",
        "preview_key": f"demo-assets/previews/{asset_id}.png",
        "size_bytes": len(raw),
        "content_hash": "sha256:" + hashlib.sha256(raw).hexdigest(),
        "triangle_count": tris,
        "bounds": {"min": lo, "max": hi},
    }
    ordered = {k: meta[k] for k in ORDER if k in meta} | {
        k: v for k, v in meta.items() if k not in ORDER
    }
    out = ASSETS / "metadata" / f"{asset_id}.json"
    out.write_text(json.dumps(ordered, indent=2, ensure_ascii=False) + "\n")
    print(f"wrote {out.relative_to(ROOT)}: {tris} triangles, {len(raw)} bytes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
