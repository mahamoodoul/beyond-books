import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.modules.three_d.contracts import (
    AnimationSpec,
    SceneSpec,
    validate_animation_for_scene,
)

FIXTURES = Path(__file__).resolve().parents[2] / "packages" / "three-d-contracts" / "fixtures"


def load(name: str) -> dict:  # type: ignore[type-arg]
    return json.loads((FIXTURES / name).read_text())


def test_fixtures_are_valid() -> None:
    scene = SceneSpec.model_validate(load("scene_heart_01.json"))
    anim = AnimationSpec.model_validate(load("animation_blood_flow_01.json"))
    SceneSpec.model_validate(load("scene_solar_system_01.json"))
    assert validate_animation_for_scene(anim, scene) == []


def test_scene_rejects_unknown_fields_such_as_urls() -> None:
    data = load("scene_heart_01.json")
    data["asset_refs"][0]["url"] = "https://evil.example/model.glb"
    with pytest.raises(ValidationError):
        SceneSpec.model_validate(data)


def test_scene_rejects_script_like_fields() -> None:
    data = load("scene_heart_01.json")
    data["onLoad"] = "fetch('/steal')"
    with pytest.raises(ValidationError):
        SceneSpec.model_validate(data)


def test_scene_requires_an_asset_or_procedural_source() -> None:
    data = load("scene_heart_01.json")
    data["asset_refs"] = []
    with pytest.raises(ValidationError, match="asset_ref or procedural"):
        SceneSpec.model_validate(data)


def test_scene_rejects_duplicate_components() -> None:
    data = load("scene_heart_01.json")
    data["components"].append(data["components"][0])
    with pytest.raises(ValidationError, match="duplicate component_id"):
        SceneSpec.model_validate(data)


def test_scene_rejects_inverted_camera_range() -> None:
    data = load("scene_heart_01.json")
    data["camera"] = {"preset": "front", "min_distance": 10, "max_distance": 2}
    with pytest.raises(ValidationError):
        SceneSpec.model_validate(data)


def test_scene_rejects_unknown_component_action() -> None:
    data = load("scene_heart_01.json")
    data["components"][0]["actions"] = ["explode"]
    with pytest.raises(ValidationError):
        SceneSpec.model_validate(data)


def test_procedural_params_must_be_flat_scalars() -> None:
    data = load("scene_solar_system_01.json")
    data["procedural"][0]["params"]["nested"] = {"code": "x"}
    with pytest.raises(ValidationError):
        SceneSpec.model_validate(data)


def test_animation_rejects_unknown_action() -> None:
    data = load("animation_blood_flow_01.json")
    data["steps"][0]["action"] = "run_javascript"
    with pytest.raises(ValidationError):
        AnimationSpec.model_validate(data)


def test_animation_rejects_unbounded_duration() -> None:
    data = load("animation_blood_flow_01.json")
    data["steps"][0]["duration_ms"] = 10_000_000
    with pytest.raises(ValidationError):
        AnimationSpec.model_validate(data)


def test_animation_requires_target_for_targeted_actions() -> None:
    data = load("animation_blood_flow_01.json")
    del data["steps"][1]["target_component"]
    with pytest.raises(ValidationError):
        AnimationSpec.model_validate(data)


def test_animation_steps_must_be_consecutive() -> None:
    data = load("animation_blood_flow_01.json")
    data["steps"][2]["step"] = 7
    with pytest.raises(ValidationError, match="consecutively"):
        AnimationSpec.model_validate(data)


def test_animation_targets_must_exist_in_scene() -> None:
    scene = SceneSpec.model_validate(load("scene_heart_01.json"))
    data = load("animation_blood_flow_01.json")
    data["steps"][1]["target_component"] = "aorta"
    anim = AnimationSpec.model_validate(data)
    problems = validate_animation_for_scene(anim, scene)
    assert problems == ["unknown target components: ['aorta']"]


def test_animation_must_be_referenced_by_scene() -> None:
    data = load("scene_heart_01.json")
    data["animation_refs"] = []
    scene = SceneSpec.model_validate(data)
    anim = AnimationSpec.model_validate(load("animation_blood_flow_01.json"))
    assert "does not reference" in validate_animation_for_scene(anim, scene)[0]


def test_explanation_refs_must_resolve() -> None:
    data = load("scene_heart_01.json")
    del data["explanations"]["explanation_left_ventricle"]
    with pytest.raises(ValidationError, match="without an explanation"):
        SceneSpec.model_validate(data)


def test_animation_path_must_exist_in_scene() -> None:
    scene_data = load("scene_heart_01.json")
    del scene_data["paths"]["pulmonary_loop"]
    scene = SceneSpec.model_validate(scene_data)
    anim = AnimationSpec.model_validate(load("animation_blood_flow_01.json"))
    assert any("unknown paths" in p for p in validate_animation_for_scene(anim, scene))


def test_path_needs_two_points() -> None:
    data = load("scene_heart_01.json")
    data["paths"]["pulmonary_loop"] = [[0, 0, 0]]
    with pytest.raises(ValidationError):
        SceneSpec.model_validate(data)
