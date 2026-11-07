/**
 * Mutable per-viewer state shared between the React UI and the render loop. The canvas reads it
 * every frame, so UI changes (explode slider, selection) never force a re-render of the scene.
 */
import { EMPTY_FRAME, type AnimationFrame, type AnimationRunner } from "./animation";
import { ComponentRegistry } from "./componentRegistry";
import type { ComponentBounds } from "./explode";
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
  /** Request a frame. The canvas renders on demand, so UI changes must call this. */
  invalidate: () => void;
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
    invalidate: () => {},
  };
}
