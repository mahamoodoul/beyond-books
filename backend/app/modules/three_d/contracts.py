"""Versioned 3D scene and animation contracts (design §7.2, §7.6).

These Pydantic models are the CANONICAL definition. JSON Schema for other consumers
(frontend runtime, AI prompts) is generated into packages/three-d-contracts/schemas
by scripts/export_contracts.py — never hand-edit the generated files.

Safety rules enforced here:
- `extra="forbid"` everywhere: unknown fields (URLs, scripts, code) are rejected.
- Actions are enumerated; nothing in a scene or animation is executable.
- Identifiers are constrained slugs; assets are referenced by ID + version, never by URL.
- Durations, distances and counts are bounded.
"""

from enum import StrEnum
from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

SCENE_SCHEMA_VERSION: Literal["1.0"] = "1.0"
ANIMATION_SCHEMA_VERSION: Literal["1.0"] = "1.0"

Identifier = Annotated[str, Field(pattern=r"^[a-z][a-z0-9_]{0,63}$")]
ShortText = Annotated[str, Field(min_length=1, max_length=200)]
LongText = Annotated[str, Field(min_length=1, max_length=2000)]

MAX_STEP_DURATION_MS = 30_000


class _Contract(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


# --------------------------------------------------------------------------- scene


class CameraPreset(StrEnum):
    FRONT = "front"
    SIDE = "side"
    TOP = "top"
    THREE_QUARTER = "three_quarter"


class SceneControl(StrEnum):
    ROTATE = "rotate"
    ZOOM = "zoom"
    PAN = "pan"
    SELECT_COMPONENT = "select_component"


class ComponentAction(StrEnum):
    HIGHLIGHT = "highlight"
    SHOW_EXPLANATION = "show_explanation"
    TOGGLE_VISIBILITY = "toggle_visibility"
    FOCUS_CAMERA = "focus_camera"


class AssetRef(_Contract):
    asset_id: Identifier
    version: int = Field(ge=1)


class ProceduralSource(_Contract):
    """A trusted, prebuilt procedural generator in the renderer (design §7.1-A).

    `generator` must exist in the renderer's allowlisted registry; params are flat scalars only.
    """

    generator: Identifier
    params: dict[Identifier, float | int | bool | ShortText] = Field(
        default_factory=dict, max_length=32
    )


class Camera(_Contract):
    preset: CameraPreset = CameraPreset.THREE_QUARTER
    min_distance: float = Field(default=1, gt=0, le=1000)
    max_distance: float = Field(default=20, gt=0, le=1000)

    @model_validator(mode="after")
    def _check_range(self) -> Self:
        if self.min_distance >= self.max_distance:
            raise ValueError("min_distance must be less than max_distance")
        return self


class SceneComponent(_Contract):
    component_id: Identifier
    mesh_name: Annotated[str, Field(pattern=r"^[A-Za-z0-9_.\-]{1,128}$")]
    label: ShortText
    actions: list[ComponentAction] = Field(default_factory=list, max_length=len(ComponentAction))
    explanation_ref: Identifier | None = None


class SceneSpec(_Contract):
    schema_version: Literal["1.0"] = SCENE_SCHEMA_VERSION
    scene_id: Identifier
    title: ShortText
    learning_objective_ids: list[Identifier] = Field(default_factory=list, max_length=50)
    asset_refs: list[AssetRef] = Field(default_factory=list, max_length=20)
    procedural: list[ProceduralSource] = Field(default_factory=list, max_length=20)
    camera: Camera = Field(default_factory=Camera)
    components: list[SceneComponent] = Field(default_factory=list, max_length=200)
    controls: list[SceneControl] = Field(
        default_factory=lambda: [SceneControl.ROTATE, SceneControl.ZOOM]
    )
    animation_refs: list[Identifier] = Field(default_factory=list, max_length=50)

    @model_validator(mode="after")
    def _check_integrity(self) -> Self:
        if not self.asset_refs and not self.procedural:
            raise ValueError("a scene needs at least one asset_ref or procedural source")
        ids = [c.component_id for c in self.components]
        dupes = sorted({i for i in ids if ids.count(i) > 1})
        if dupes:
            raise ValueError(f"duplicate component_id values: {dupes}")
        assets = [(a.asset_id, a.version) for a in self.asset_refs]
        if len(assets) != len(set(assets)):
            raise ValueError("duplicate asset_refs")
        if len(self.animation_refs) != len(set(self.animation_refs)):
            raise ValueError("duplicate animation_refs")
        return self

    def component_ids(self) -> set[str]:
        return {c.component_id for c in self.components}


# ----------------------------------------------------------------------- animation


class _StepBase(_Contract):
    step: int = Field(ge=1)
    duration_ms: int = Field(ge=0, le=MAX_STEP_DURATION_MS)
    explanation: LongText | None = None


class HighlightStep(_StepBase):
    action: Literal["highlight_component"]
    target_component: Identifier


class SetVisibilityStep(_StepBase):
    action: Literal["set_visibility"]
    target_component: Identifier
    visible: bool


class SetOpacityStep(_StepBase):
    action: Literal["set_opacity"]
    target_component: Identifier
    opacity: float = Field(ge=0, le=1)


class MoveAlongPathStep(_StepBase):
    action: Literal["move_along_path"]
    target_component: Identifier
    path_id: Identifier


class RotateComponentStep(_StepBase):
    action: Literal["rotate_component"]
    target_component: Identifier
    axis: Literal["x", "y", "z"]
    degrees: float = Field(ge=-720, le=720)


class FlowParticlesStep(_StepBase):
    action: Literal["show_flow_particles"]
    target_component: Identifier
    path_id: Identifier


class CameraFocusStep(_StepBase):
    action: Literal["camera_focus"]
    target_component: Identifier


class AnnotationStep(_StepBase):
    action: Literal["show_annotation"]
    target_component: Identifier | None = None
    explanation: LongText


class WaitStep(_StepBase):
    action: Literal["wait"]


AnimationStep = Annotated[
    HighlightStep
    | SetVisibilityStep
    | SetOpacityStep
    | MoveAlongPathStep
    | RotateComponentStep
    | FlowParticlesStep
    | CameraFocusStep
    | AnnotationStep
    | WaitStep,
    Field(discriminator="action"),
]

ALLOWED_ANIMATION_ACTIONS = frozenset(
    {
        "highlight_component",
        "set_visibility",
        "set_opacity",
        "move_along_path",
        "rotate_component",
        "show_flow_particles",
        "camera_focus",
        "show_annotation",
        "wait",
    }
)


class AnimationSpec(_Contract):
    schema_version: Literal["1.0"] = ANIMATION_SCHEMA_VERSION
    animation_id: Identifier
    title: ShortText
    steps: list[AnimationStep] = Field(min_length=1, max_length=200)

    @model_validator(mode="after")
    def _check_sequence(self) -> Self:
        numbers = [s.step for s in self.steps]
        if numbers != list(range(1, len(numbers) + 1)):
            raise ValueError("steps must be numbered consecutively from 1")
        return self

    def target_components(self) -> set[str]:
        return {t for s in self.steps if (t := getattr(s, "target_component", None)) is not None}


# ------------------------------------------------------------------ cross-checks


def validate_animation_for_scene(animation: AnimationSpec, scene: SceneSpec) -> list[str]:
    """Return problems that make `animation` unsafe to run in `scene` (empty list = OK)."""
    problems: list[str] = []
    if animation.animation_id not in scene.animation_refs:
        problems.append(f"scene does not reference animation '{animation.animation_id}'")
    unknown = sorted(animation.target_components() - scene.component_ids())
    if unknown:
        problems.append(f"unknown target components: {unknown}")
    return problems
