/* AUTO-GENERATED from packages/three-d-contracts — do not edit. Run `npm run contracts:types`. */

/**
 * @maxItems 50
 */
export type AnimationRefs = string[];
export type AssetId = string;
export type Version = number;
/**
 * @maxItems 20
 */
export type AssetRefs = AssetRef[];
export type MaxDistance = number;
export type MinDistance = number;
export type CameraPreset = "front" | "side" | "top" | "three_quarter";
export type ComponentAction =
  "highlight" | "show_explanation" | "toggle_visibility" | "focus_camera";
/**
 * @maxItems 4
 */
export type Actions = ComponentAction[];
export type ComponentId = string;
export type ExplanationRef = string | null;
export type Label = string;
export type MeshName = string;
/**
 * @maxItems 200
 */
export type Components = SceneComponent[];
export type SceneControl = "rotate" | "zoom" | "pan" | "select_component";
export type Controls = SceneControl[];
/**
 * @maxItems 50
 */
export type LearningObjectiveIds = string[];
export type Generator = string;
/**
 * @maxItems 20
 */
export type Procedural = ProceduralSource[];
export type SceneId = string;
export type SchemaVersion = "1.0";
export type Title = string;

export interface SceneSpec {
  animation_refs?: AnimationRefs;
  asset_refs?: AssetRefs;
  camera?: Camera;
  components?: Components;
  controls?: Controls;
  explanations?: Explanations;
  learning_objective_ids?: LearningObjectiveIds;
  paths?: Paths;
  procedural?: Procedural;
  scene_id: SceneId;
  schema_version?: SchemaVersion;
  title: Title;
}
export interface AssetRef {
  asset_id: AssetId;
  version: Version;
}
export interface Camera {
  max_distance?: MaxDistance;
  min_distance?: MinDistance;
  preset?: CameraPreset;
}
export interface SceneComponent {
  actions?: Actions;
  component_id: ComponentId;
  explanation_ref?: ExplanationRef;
  label: Label;
  mesh_name: MeshName;
}
export interface Explanations {
  /**
   * This interface was referenced by `Explanations`'s JSON-Schema definition
   * via the `patternProperty` "^[a-z][a-z0-9_]{0,63}$".
   */
  [k: string]: string;
}
export interface Paths {
  /**
   * This interface was referenced by `Paths`'s JSON-Schema definition
   * via the `patternProperty` "^[a-z][a-z0-9_]{0,63}$".
   */
  [k: string]: [number, number, number, ...number[]][];
}
/**
 * A trusted, prebuilt procedural generator in the renderer (design §7.1-A).
 *
 * `generator` must exist in the renderer's allowlisted registry; params are flat scalars only.
 */
export interface ProceduralSource {
  generator: Generator;
  params?: Params;
}
export interface Params {
  /**
   * This interface was referenced by `Params`'s JSON-Schema definition
   * via the `patternProperty` "^[a-z][a-z0-9_]{0,63}$".
   */
  [k: string]: number | boolean | string;
}
