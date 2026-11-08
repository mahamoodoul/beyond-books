/**
 * Runtime types for the 3D viewer. Contract types (SceneSpec, AnimationSpec) are generated from
 * packages/three-d-contracts; everything here is renderer-side.
 */
import type { AnimationSpec } from "@/features/three-d/schemas/generated/animation";
import type {
  AssetRef,
  ComponentAction,
  SceneComponent,
  SceneSpec,
} from "@/features/three-d/schemas/generated/scene";

export type { AnimationSpec, AssetRef, ComponentAction, SceneComponent, SceneSpec };
export type AnimationStep = AnimationSpec["steps"][number];

export type Vec3 = [number, number, number];

/** Asset-registry record (design §7.4), as written by scripts/build_demo_assets.py. */
export interface AssetComponentMeta {
  mesh_name: string;
  label: string;
  /** Optional authored exploded-view offset, in asset space. Computed when absent. */
  explode_offset?: Vec3;
  /** Optional label anchor relative to the component's centre. Top of bounds when absent. */
  label_anchor?: Vec3;
}

export interface AssetMetadata {
  asset_id: string;
  version: number;
  name: string;
  description?: string;
  object_key: string;
  units?: string;
  bounds?: { min: Vec3; max: Vec3 };
  components: AssetComponentMeta[];
  supported_interactions?: string[];
  animation_capabilities?: string[];
  paths?: Record<string, Vec3[]>;
  review_status?: string;
  accuracy_note?: string;
}

export interface ResolvedAsset {
  ref: AssetRef;
  meta: AssetMetadata;
  /** URL from the trusted registry, never from scene JSON. */
  url: string;
  /** 2D picture of the model, rendered by the server: poster while the 3D loads. */
  previewUrl?: string | null;
}

/** Looks up approved assets by ID + version. Swap the fixture registry for an API one later. */
export interface AssetRegistry {
  resolve(ref: AssetRef): ResolvedAsset | null;
}

export interface ResolvedComponent {
  componentId: string;
  meshName: string;
  label: string;
  actions: ReadonlySet<ComponentAction>;
  explanationRef: string | null;
  /** Asset that should contain the mesh, or null for procedural components. */
  assetId: string | null;
  meta: AssetComponentMeta | null;
}

export interface ResolvedScene {
  spec: SceneSpec;
  assets: ResolvedAsset[];
  components: ResolvedComponent[];
  paths: Record<string, Vec3[]>;
  /** Problems that block rendering (unknown asset, unknown generator, ...). */
  errors: string[];
  /** Non-fatal problems (component not listed in asset metadata, ...). */
  warnings: string[];
}

/** Events for learning analytics (design §7.3 "Learning Events"). */
export type ViewerEvent =
  | { type: "component_selected"; componentId: string }
  | { type: "animation_started"; animationId: string }
  | { type: "animation_step"; animationId: string; step: number }
  | { type: "animation_completed"; animationId: string }
  | { type: "explode_changed"; amount: number };
