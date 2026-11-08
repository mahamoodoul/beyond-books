/**
 * The motion a GLB brought with it, played the way Blender's panel drives the same rig:
 *  - a clip named "explode" follows the Explode slider;
 *  - a clip named "run" (or, when no guided animation uses the clips, any other clip) loops,
 *    started and stopped with the Run button.
 *
 * With both, explode is layered on top of the loop (location = base + explode + running motion),
 * so the model can run or stop whether it is assembled or exploded. scripts/split_glb_clips.py
 * makes these clips from the single timeline Blender bakes.
 *
 * Not to be confused with ClipPlayer, which plays clips during a guided animation's play_clip
 * steps, on the timeline's clock.
 */
import * as THREE from "three";

import type { Vec3 } from "./types";

export interface MotionSource {
  root: THREE.Object3D;
  clips: readonly THREE.AnimationClip[];
}

/** What the toolbar should offer for this model. */
export interface MotionSupport {
  explode: boolean;
  /** "run" when the clip says it is a running motion, "play" for any other looping clip. */
  loop: "run" | "play" | null;
}

/** What has to be in view at one stage of the model's motion. */
export interface MotionFrame {
  center: Vec3;
  radius: number;
  /** One world-space box per mesh, covering wherever its motion takes it. */
  boxes: THREE.Box3[];
}

const EXPLODE_CLIP = /^explode$/i;
const RUN_CLIP = /^run$/i;
/** Loop positions checked when measuring, so moving parts stay inside the framing. */
const LOOP_SAMPLES = 8;

/**
 * Whether Run and Explode drive these clips. A scene's guided animations play a GLB's clips
 * themselves (ClipPlayer), so the controls take over only for clips named for them, or when
 * nothing else would ever play the clips.
 */
export function hasOwnMotion(clips: readonly THREE.AnimationClip[], guided: boolean): boolean {
  if (clips.some((c) => EXPLODE_CLIP.test(c.name) || RUN_CLIP.test(c.name))) return true;
  return clips.length > 0 && !guided;
}

export class ModelMotion {
  readonly support: MotionSupport;
  /** How long the Explode button takes: the clip's own length. */
  readonly explodeSeconds: number;
  private readonly roots: THREE.Object3D[] = [];
  private readonly mixers: THREE.AnimationMixer[] = [];
  private readonly explodeActions: THREE.AnimationAction[] = [];
  private readonly loopActions: THREE.AnimationAction[] = [];
  private readonly assembled: MotionFrame;
  private readonly exploded: MotionFrame;

  constructor(sources: readonly MotionSource[]) {
    let loopKind: MotionSupport["loop"] = null;
    for (const { root, clips } of sources) {
      const mixer = new THREE.AnimationMixer(root);
      this.roots.push(root);
      this.mixers.push(mixer);
      const explode = clips.find((c) => EXPLODE_CLIP.test(c.name));
      const others = clips.filter((c) => c !== explode);
      const loop = others.find((c) => RUN_CLIP.test(c.name)) ?? others[0];
      if (loop) {
        loopKind = loopKind === "run" || RUN_CLIP.test(loop.name) ? "run" : "play";
        const action = mixer.clipAction(loop);
        action.setLoop(THREE.LoopRepeat, Infinity);
        action.paused = true;
        action.play();
        this.loopActions.push(action);
      }
      if (explode) {
        if (loop) THREE.AnimationUtils.makeClipAdditive(explode);
        const action = mixer.clipAction(explode, root, explode.blendMode);
        action.paused = true;
        action.play();
        this.explodeActions.push(action);
      }
    }
    this.support = { explode: this.explodeActions.length > 0, loop: loopKind };
    this.explodeSeconds = Math.max(0.05, ...this.explodeActions.map((a) => a.getClip().duration));
    this.assembled = this.measure(0);
    this.exploded = this.support.explode ? this.measure(1) : this.assembled;
    this.pose(0);
  }

  /** Advance the loop by `dt` seconds while running, and hold explode at `amount` (0..1). */
  update(dt: number, running: boolean, amount: number): void {
    for (const action of this.loopActions) action.paused = !running;
    this.setExplode(amount);
    for (const mixer of this.mixers) mixer.update(dt);
  }

  /** What the camera has to frame at this explode amount. */
  frameAt(amount: number): MotionFrame {
    return amount >= 0.5 ? this.exploded : this.assembled;
  }

  dispose(): void {
    this.mixers.forEach((mixer, i) => {
      mixer.stopAllAction();
      mixer.uncacheRoot(this.roots[i]!);
    });
  }

  private setExplode(amount: number): void {
    const a = THREE.MathUtils.clamp(amount, 0, 1);
    for (const action of this.explodeActions) action.time = a * action.getClip().duration;
  }

  private pose(amount: number): void {
    this.setExplode(amount);
    for (const mixer of this.mixers) mixer.update(0);
  }

  private measure(amount: number): MotionFrame {
    const boxes = new Map<THREE.Mesh, THREE.Box3>();
    const samples = this.loopActions.length > 0 ? LOOP_SAMPLES : 1;
    for (let s = 0; s < samples; s++) {
      for (const action of this.loopActions) action.time = (s / samples) * action.getClip().duration;
      this.pose(amount);
      for (const root of this.roots) addVisibleBounds(root, boxes);
    }
    for (const action of this.loopActions) action.time = 0;
    const all = new THREE.Box3();
    for (const box of boxes.values()) all.union(box);
    if (all.isEmpty()) return { center: [0, 0, 0], radius: 1, boxes: [] };
    return {
      center: all.getCenter(new THREE.Vector3()).toArray() as Vec3,
      radius: all.getSize(new THREE.Vector3()).length() / 2 || 1,
      boxes: [...boxes.values()],
    };
  }
}

/** Grow each mesh's box to its current place, skipping parts scaled to nothing (hidden labels). */
function addVisibleBounds(root: THREE.Object3D, boxes: Map<THREE.Mesh, THREE.Box3>): void {
  const part = new THREE.Box3();
  root.updateWorldMatrix(true, true);
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || mesh.matrixWorld.getMaxScaleOnAxis() < 1e-6) return;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    part.copy(mesh.geometry.boundingBox!).applyMatrix4(mesh.matrixWorld);
    const box = boxes.get(mesh);
    if (box) box.union(part);
    else boxes.set(mesh, part.clone());
  });
}

/**
 * Where to aim and how far back to stand so a frame fills the view along `direction`. Measured
 * part by part along the view's own axes: one box around a whole labelled layout angled towards
 * the camera would be far bigger than what is on screen, and leave the model small in the middle.
 */
export function fitFrame(
  frame: Pick<MotionFrame, "boxes">,
  direction: THREE.Vector3,
  fovDegrees: number,
  aspect: number,
): { center: THREE.Vector3; distance: number } {
  const up = Math.abs(direction.y) > 0.99 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
  const right = up.clone().cross(direction).normalize();
  const top = direction.clone().cross(right).normalize();
  const axes = [right, top, direction];
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const mid = new THREE.Vector3();
  const half = new THREE.Vector3();
  for (const box of frame.boxes) {
    box.getCenter(mid);
    box.getSize(half).multiplyScalar(0.5);
    axes.forEach((axis, i) => {
      const at = mid.dot(axis);
      const reach = Math.abs(axis.x) * half.x + Math.abs(axis.y) * half.y + Math.abs(axis.z) * half.z;
      min[i] = Math.min(min[i]!, at - reach);
      max[i] = Math.max(max[i]!, at + reach);
    });
  }
  if (frame.boxes.length === 0) return { center: new THREE.Vector3(), distance: 1 };
  const center = new THREE.Vector3();
  axes.forEach((axis, i) => center.addScaledVector(axis, (min[i]! + max[i]!) / 2));
  const tan = Math.tan(THREE.MathUtils.degToRad(fovDegrees / 2));
  const fit = Math.max((max[1]! - min[1]!) / 2 / tan, (max[0]! - min[0]!) / 2 / (tan * aspect));
  return { center, distance: (fit + (max[2]! - min[2]!) / 2) * 1.06 };
}
