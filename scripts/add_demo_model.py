#!/usr/bin/env python3
"""Put a GLB from this computer directly into the code, as a built-in Studio scene.

    python scripts/add_demo_model.py ~/Desktop/ATP_Synthase/atp_synthase.glb \
        --asset-id atp_synthase_v1 --scene-id scene_atp_synthase_01 --title "ATP Synthase" \
        --description "..." --subject biology --annotations "^(A|X|Key|Inset) " \
        --view=0,0.156,0.988 --view-fov 19.2

Writes packages/demo-assets/glb/<asset>.glb (Git LFS), its source/ and metadata/ records and
packages/three-d-contracts/fixtures/<scene>.json. The app bundles those, so the model appears under
Demo scenes in the 3D Studio with no upload and no database row. The GLB's geometry and clips are
copied as they are: only node names are cleaned for the scene contract, and a start camera added.
--annotations keeps matching nodes (text, leader lines) visible but out of the parts list.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from split_glb_clips import add_camera, read_glb, tidy_names, write_glb

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "packages" / "demo-assets"
FIXTURES = ROOT / "packages" / "three-d-contracts" / "fixtures"
MAX_COMPONENTS = 200  # SceneSpec.components


def readable(name: str) -> str:
    """The Blender name as a label: its copy suffix (.001) becomes a plain number."""
    return re.sub(r"\.0*(\d+)$", r" \1", name).strip()


def identifier(label: str, taken: set[str]) -> str:
    base = re.sub(r"[^a-z0-9]+", "_", label.lower()).strip("_")[:56] or "part"
    if not base[0].isalpha():
        base = f"part_{base}"
    found, n = base, 2
    while found in taken:
        found, n = f"{base}_{n}", n + 1
    taken.add(found)
    return found


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("input", type=Path)
    parser.add_argument("--asset-id", required=True)
    parser.add_argument("--scene-id", required=True)
    parser.add_argument("--title", required=True)
    parser.add_argument("--description", required=True)
    parser.add_argument("--subject", required=True)
    parser.add_argument("--annotations", help="regex on node names: visible, but not parts")
    parser.add_argument("--view", help="x,y,z from the model towards the camera (glTF axes)")
    parser.add_argument("--view-fov", type=float, default=20.0)
    args = parser.parse_args(argv)

    doc, blob = read_glb(args.input)
    labels = {i: readable(n["name"]) for i, n in enumerate(doc["nodes"]) if n.get("name")}
    tidy_names(doc, re.compile(args.annotations) if args.annotations else None)

    components = []
    taken: set[str] = set()
    for i, node in enumerate(doc["nodes"]):
        if not node.get("name"):
            continue
        node["name"] = node["name"].replace(" ", "_")  # what three.js calls it after loading
        if "mesh" in node:
            components.append(
                {
                    "component_id": identifier(labels[i], taken),
                    "mesh_name": node["name"],
                    "label": labels[i],
                    "actions": ["highlight", "toggle_visibility", "focus_camera"],
                }
            )
    if len(components) > MAX_COMPONENTS:
        raise SystemExit(f"{len(components)} parts; list at most {MAX_COMPONENTS} (--annotations)")
    if args.view:
        add_camera(doc, tuple(float(x) for x in args.view.split(",")), args.view_fov)

    write_glb(ASSETS / "glb" / f"{args.asset_id}.glb", doc, bytearray(blob))
    spec = {
        "asset_id": args.asset_id,
        "version": 1,
        "name": args.title,
        "description": args.description,
        "subject": args.subject,
        "units": "metres",
        "components": [{"mesh_name": c["mesh_name"], "label": c["label"]} for c in components],
        "supported_interactions": ["highlight", "toggle_visibility", "focus_camera"],
        "animation_capabilities": [],
        "paths": {},
        "provider": {"source": "blender", "generator": f"Blender scene, {args.input.name}", "job_id": None},
        "license": {
            "spdx": "CC0-1.0",
            "source": "Modelled in Blender for Beyond Books",
            "attribution": None,
            "allowed_use": "development_and_demo_only",
        },
        "review_status": "draft_unreviewed",
        "accuracy_note": "Teaching model; not reviewed by a subject expert.",
    }
    source = ASSETS / "source" / f"{args.asset_id}.asset.json"
    source.write_text(json.dumps(spec, indent=2, ensure_ascii=False) + "\n")
    subprocess.run([sys.executable, str(ROOT / "scripts" / "write_asset_metadata.py"), str(source)], check=True)

    scene = {
        "schema_version": "1.0",
        "scene_id": args.scene_id,
        "title": args.title,
        "learning_objective_ids": [],
        "asset_refs": [{"asset_id": args.asset_id, "version": 1}],
        "camera": {"preset": "front", "min_distance": 0.1, "max_distance": 60},
        "components": components,
        "controls": ["rotate", "zoom", "pan", "select_component"],
        "animation_refs": [],
        "explanations": {},
    }
    (FIXTURES / f"{args.scene_id}.json").write_text(json.dumps(scene, indent=1, ensure_ascii=False) + "\n")
    print(f"{args.asset_id}: {len(components)} parts")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
