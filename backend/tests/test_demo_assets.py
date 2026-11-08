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

# GLBs are stored in Git LFS. A checkout without `git lfs pull` holds small pointer files.
LFS_POINTER = b"version https://git-lfs.github.com/spec/"

# asset_id -> (scene fixtures, animation fixtures)
CASES = {
    "human_body_v1": (["scene_body_01.json"], ["animation_body_tour_01.json"]),
    "human_brain_v1": (["scene_brain_01.json"], ["animation_brain_tour_01.json"]),
    "human_heart_v2": (["scene_heart_03.json"], ["animation_heart_tour_01.json"]),
    "human_lungs_v1": (["scene_lungs_01.json"], ["animation_lungs_tour_01.json"]),
    "human_heart_v1": (
        ["scene_heart_01.json", "scene_heart_02.json"],
        ["animation_blood_flow_01.json", "animation_double_circulation_01.json"],
    ),
    "plant_cell_v1": (["scene_plant_cell_01.json"], ["animation_plant_cell_tour_01.json"]),
    "plant_cell_v2": (["scene_plant_cell_02.json"], ["animation_plant_cell_tour_01.json"]),
    "plant_cell_v3": (["scene_plant_cell_03.json"], ["animation_plant_cell_tour_01.json"]),
    "water_molecule_v1": (
        ["scene_water_molecule_01.json"],
        ["animation_water_shape_01.json"],
    ),
    "human_anatomy_systems_v1": (["scene_human_anatomy_01.json"], []),
    "dna_double_helix_v1": (["scene_dna_double_helix_01.json"], []),
    "i4_dohc_engine_exploded_v1": (["scene_i4_engine_01.json"], []),
    "atp_synthase_v1": (["scene_atp_synthase_01.json"], []),
    "cell_membrane_transport_v1": (["scene_cell_membrane_01.json"], []),
    "rutherford_gold_foil_v1": (["scene_rutherford_gold_foil_01.json"], []),
    "neutralization_heat_v1": (["scene_neutralization_heat_01.json"], []),
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
    if raw.startswith(LFS_POINTER):
        pytest.fail(f"{glb.name} is a Git LFS pointer; run `git lfs pull` (CI: checkout lfs: true)")
    assert meta["content_hash"] == "sha256:" + hashlib.sha256(raw).hexdigest()
    assert meta["size_bytes"] == len(raw)

    gltf = gltf_json(glb)
    assert all("uri" not in b for b in gltf["buffers"]), "buffers must be embedded"
    # text and leader lines of a model with its own motion are unnamed: drawn, but not parts
    nodes = {n["name"] for n in gltf["nodes"] if "mesh" in n and n.get("name")}
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
                # Paths may be defined on the scene (contract, ADR 0010) or the asset metadata.
                assert path_id in owner.paths or path_id in meta["paths"]


def test_human_anatomy_keeps_its_blender_motion() -> None:
    gltf = gltf_json(ASSETS / "glb" / "human_anatomy_systems_v1.glb")
    clips = {a["name"]: a for a in gltf["animations"]}
    assert set(clips) == {"explode", "physiology"}
    nodes = gltf["nodes"]

    moved = {nodes[c["target"]["node"]]["name"] for c in clips["explode"]["channels"]}
    assert {"lung_left", "stomach", "cerebrum"} <= moved
    assert not {"heart", "arteries", "veins"} & moved  # the circulation stays in the body
    assert {c["target"]["path"] for c in clips["explode"]["channels"]} == {"translation"}

    # breathing and the heartbeat are morph weights, on exactly the parts that have targets
    beating = {nodes[c["target"]["node"]]["name"] for c in clips["physiology"]["channels"]}
    morphs = {
        n["name"]
        for n in nodes
        if "mesh" in n and gltf["meshes"][n["mesh"]]["primitives"][0].get("targets")
    }
    assert beating == morphs
    assert {"heart", "lung_left", "lung_right", "diaphragm"} <= beating
    assert {c["target"]["path"] for c in clips["physiology"]["channels"]} == {"weights"}


def test_human_anatomy_fits_the_upload_budget() -> None:
    meta = json.loads((ASSETS / "metadata" / "human_anatomy_systems_v1.json").read_text())
    assert meta["triangle_count"] <= 1_500_000  # three_d.glb.MAX_TRIANGLES
    assert meta["size_bytes"] <= 30 * 1024 * 1024  # settings.asset_max_bytes
