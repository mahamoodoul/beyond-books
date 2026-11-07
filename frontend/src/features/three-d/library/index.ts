/**
 * Public API of the 3D library. Import from "@/features/three-d/library", not from internal files.
 *
 *   <SceneViewer scene={sceneSpec} animations={[...]} registry={registry} onEvent={...} />
 */
export { SceneViewer, type SceneViewerProps } from "./components/SceneViewer";
export {
  AnimationRunner,
  deriveFrame,
  validateAnimation,
  SUPPORTED_ACTIONS,
  type AnimationFrame,
  type RunnerSnapshot,
} from "./runtime/animation";
export { computeExplodeOffsets } from "./runtime/explode";
export { proceduralCatalog } from "./runtime/procedural";
export { resolveScene } from "./runtime/sceneResolver";
export type {
  AnimationSpec,
  AssetMetadata,
  AssetRegistry,
  ResolvedAsset,
  ResolvedScene,
  SceneSpec,
  ViewerEvent,
} from "./runtime/types";
