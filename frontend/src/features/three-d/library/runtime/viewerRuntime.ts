/**
 * Mutable per-viewer state shared between the React UI and the render loop. The canvas reads it
 * every frame, so UI changes (explode slider, selection) never force a re-render of the scene.
 */
import type * as THREE from "three";

import { EMPTY_FRAME, type AnimationFrame, type AnimationRunner } from "./animation";
import type { OwnView } from "./assetLoader";
import { ComponentRegistry } from "./componentRegistry";
import { explodedBounds, type ComponentBounds } from "./explode";
import type { ModelMotion } from "./modelMotion";
import type { Vec3 } from "./types";

export interface ViewerRuntime {
  registry: ComponentRegistry;
  runner: AnimationRunner | null;
  paths: Record<string, Vec3[]>;
  bounds: ComponentBounds[];
  offsets: Record<string, Vec3>;
  frame: AnimationFrame;
  /** Explode amount the UI asks for, and the eased value currently shown. */
  explodeTarget: number;
  explode: number;
  hidden: Set<string>;
  selected: string | null;
  /** Focus mode target: the other parts are ghosted. */
  isolated: string | null;
  xray: boolean;
  hovered: string | null;
  showLabels: boolean;
  reducedMotion: boolean;
  /** The scene moves by itself (procedural motion), so shadows must redraw every frame. */
  animatedScene: boolean;
  /** The GLB's own Run / Explode motion, when it has any. It then owns the parts' transforms. */
  motion: ModelMotion | null;
  /** The learner pressed Run, so the model's looping motion is playing. */
  running: boolean;
  /** The view the GLB's own camera asks for. */
  ownView: OwnView | null;
  /** The roots of the load this state describes; null while it is being replaced. */
  loadedRoots: readonly THREE.Object3D[] | null;
  /** Request a frame. The canvas renders on demand, so UI changes must call this. */
  invalidate: () => void;
  /** Starts an immersive VR session; null until the model is on stage. Call it from a user gesture. */
  enterVr: (() => Promise<void>) | null;
}

/** What the camera and shadows have to cover at this explode amount. */
export function viewBounds(rt: ViewerRuntime, amount: number): { center: Vec3; radius: number } {
  return rt.motion ? rt.motion.frameAt(amount) : explodedBounds(rt.bounds, rt.offsets, amount);
}

export function createViewerRuntime(paths: Record<string, Vec3[]>): ViewerRuntime {
  return {
    registry: new ComponentRegistry(),
    runner: null,
    paths,
    bounds: [],
    offsets: {},
    frame: EMPTY_FRAME,
    explodeTarget: 0,
    explode: 0,
    hidden: new Set(),
    selected: null,
    isolated: null,
    xray: false,
    hovered: null,
    showLabels: true,
    reducedMotion: false,
    animatedScene: false,
    motion: null,
    running: false,
    ownView: null,
    loadedRoots: null,
    invalidate: () => {},
    enterVr: null,
  };
}
