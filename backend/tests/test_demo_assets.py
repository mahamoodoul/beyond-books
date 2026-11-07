"""Demo GLB assets stay consistent with their metadata and the scene/animation fixtures.

Dependency-free (no numpy): reads only the GLB header and JSON chunk. Full geometry checks and
previews live in scripts/validate_asset.py (see docs/3d-asset-workflow.md).
"""

import hashlib
import json
import struct
from pathlib import Path

import pytest

from app.modules.three_d.contracts import AnimationSpec, SceneSpec, validate_animation_for_scene

REPO = Path(__file__).resolve().parents[2]
FIXTURES = REPO / "packages" / "three-d-contracts" / "fixtures"
ASSETS = REPO / "packages" / "demo-assets"

# asset_id -> (scene fixtures, animation fixtures)
CASES = {
    "human_heart_v1": (
        ["scene_heart_01.json", "scene_heart_02.json"],
        ["animation_blood_flow_01.json", "animation_double_circulation_01.json"],
    ),
    "plant_cell_v1": (["scene_plant_cell_01.json"], ["animation_plant_cell_tour_01.json"]),
    "water_molecule_v1": (
        ["scene_water_molecule_01.json"],
        ["animation_water_shape_01.json"],
    ),
}


def gltf_json(path: Path) -> dict:  # type: ignore[type-arg]
    data = path.read_bytes()
    magic, version, length = struct.unpack_from("<4sII", data, 0)
    assert (magic, version, length) == (b"glTF", 2, len(data)), "invalid GLB header"
    jlen, jtype = struct.unpack_from("<I4s", data, 12)
    assert jtype == b"JSON"
    return json.loads(data[20 : 20 + jlen])  # type: ignore[no-any-return]


@pytest.mark.parametrize("asset_id", sorted(CASES))
def test_demo_asset_matches_metadata_and_fixtures(asset_id: str) -> None:
    meta = json.loads((ASSETS / "metadata" / f"{asset_id}.json").read_text())
    glb = ASSETS / "glb" / f"{asset_id}.glb"
    raw = glb.read_bytes()
    assert meta["content_hash"] == "sha256:" + hashlib.sha256(raw).hexdigest()
    assert meta["size_bytes"] == len(raw)

    gltf = gltf_json(glb)
    assert all("uri" not in b for b in gltf["buffers"]), "buffers must be embedded"
    nodes = {n["name"] for n in gltf["nodes"] if "mesh" in n}
    assert {c["mesh_name"] for c in meta["components"]} <= nodes

    scene_files, anim_files = CASES[asset_id]
    scenes = [SceneSpec.model_validate_json((FIXTURES / f).read_text()) for f in scene_files]
    for scene in scenes:
        assert (asset_id, meta["version"]) in {(a.asset_id, a.version) for a in scene.asset_refs}
        assert {c.mesh_name for c in scene.components} <= nodes
    for f in anim_files:
        anim = AnimationSpec.model_validate_json((FIXTURES / f).read_text())
        owner = next(s for s in scenes if anim.animation_id in s.animation_refs)
        assert validate_animation_for_scene(anim, owner) == []
        for step in anim.steps:
            if (path_id := getattr(step, "path_id", None)) is not None:
                assert path_id in meta["paths"]
