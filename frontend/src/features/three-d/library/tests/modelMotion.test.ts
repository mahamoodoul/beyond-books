import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  fitFrame,
  hasOwnMotion,
  ModelMotion,
  type MotionFrame,
} from "@/features/three-d/library/runtime/modelMotion";

/** One part, like the engine rig: runs up and down on Y, explodes sideways on X. */
function piston() {
  const root = new THREE.Group();
  const part = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  part.name = "piston";
  root.add(part);
  const label = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  label.name = "label";
  label.scale.setScalar(0);
  label.position.set(100, 0, 0); // hidden until exploded, so it must not stretch the assembled framing
  root.add(label);
  const run = new THREE.AnimationClip("run", 2, [
    new THREE.VectorKeyframeTrack("piston.position", [0, 1, 2], [0, 0, 0, 0, 1, 0, 0, 0, 0]),
  ]);
  const explode = new THREE.AnimationClip("explode", 1, [
    new THREE.VectorKeyframeTrack("piston.position", [0, 1], [0, 0, 0, 4, 0, 0]),
    new THREE.VectorKeyframeTrack("label.scale", [0, 1], [0, 0, 0, 1, 1, 1]),
  ]);
  return { root, part, label, run, explode };
}

describe("hasOwnMotion", () => {
  const clips = (...names: string[]) => names.map((name) => new THREE.AnimationClip(name, 1, []));

  it("claims clips named for the controls", () => {
    expect(hasOwnMotion(clips("run", "explode"), false)).toBe(true);
    expect(hasOwnMotion(clips("Explode"), true)).toBe(true);
  });

  it("leaves other clips to the guided animations that play them", () => {
    expect(hasOwnMotion(clips("four_stroke_cycle"), true)).toBe(false);
    expect(hasOwnMotion(clips("replication_fork", "prune"), true)).toBe(false);
  });

  it("offers any clip when nothing else would ever play it", () => {
    expect(hasOwnMotion(clips("Scene"), false)).toBe(true);
  });

  it("has nothing to do without clips", () => {
    expect(hasOwnMotion([], false)).toBe(false);
    expect(hasOwnMotion([], true)).toBe(false);
  });
});

describe("ModelMotion", () => {
  it("offers what the clips can do", () => {
    const { root, run, explode } = piston();
    expect(new ModelMotion([{ root, clips: [run, explode] }]).support).toEqual({ explode: true, loop: "run" });
    const other = piston();
    expect(new ModelMotion([{ root: other.root, clips: [other.explode] }]).support).toEqual({ explode: true, loop: null });
    const baked = piston();
    baked.run.name = "Scene";
    expect(new ModelMotion([{ root: baked.root, clips: [baked.run] }]).support).toEqual({ explode: false, loop: "play" });
  });

  it("starts assembled and still", () => {
    const { root, part, run, explode } = piston();
    const player = new ModelMotion([{ root, clips: [run, explode] }]);
    player.update(0.5, false, 0);
    expect(part.position.toArray()).toEqual([0, 0, 0]);
  });

  it("runs while assembled, and stops where it is", () => {
    const { root, part, run, explode } = piston();
    const player = new ModelMotion([{ root, clips: [run, explode] }]);
    player.update(0.5, true, 0);
    expect(part.position.y).toBeCloseTo(0.5);
    expect(part.position.x).toBeCloseTo(0);
    player.update(5, false, 0);
    expect(part.position.y).toBeCloseTo(0.5);
  });

  it("runs while exploded: the two motions add up, as in the Blender rig", () => {
    const { root, part, run, explode } = piston();
    const player = new ModelMotion([{ root, clips: [run, explode] }]);
    player.update(0, false, 1);
    expect(part.position.toArray()).toEqual([4, 0, 0]);
    player.update(1, true, 1);
    expect(part.position.x).toBeCloseTo(4);
    expect(part.position.y).toBeCloseTo(1);
    player.update(0, false, 1);
    expect(part.position.y).toBeCloseTo(1); // stopped while exploded
    player.update(0, false, 0.5);
    expect(part.position.x).toBeCloseTo(2); // the slider moves it without restarting the loop
    expect(part.position.y).toBeCloseTo(1);
    player.update(0, false, 0);
    expect(part.position.x).toBeCloseTo(0); // back together, still at the same point in the cycle
    expect(part.position.y).toBeCloseTo(1);
  });

  it("loops the running motion seamlessly", () => {
    const { root, part, run, explode } = piston();
    const player = new ModelMotion([{ root, clips: [run, explode] }]);
    player.update(2.5, true, 0);
    expect(part.position.y).toBeCloseTo(0.5);
  });

  it("scrubs an explode-only model through its clip, including parts that fade in", () => {
    const { root, part, label, explode } = piston();
    const player = new ModelMotion([{ root, clips: [explode] }]);
    player.update(0, false, 0.25);
    expect(part.position.x).toBeCloseTo(1);
    expect(label.scale.x).toBeCloseTo(0.25);
    expect(player.explodeSeconds).toBe(1);
  });

  it("frames what is visible at each stage", () => {
    const { root, run, explode } = piston();
    const player = new ModelMotion([{ root, clips: [run, explode] }]);
    const front = new THREE.Vector3(0, 0, 1);
    const assembled = fitFrame(player.frameAt(0), front, 40, 1);
    const exploded = fitFrame(player.frameAt(1), front, 40, 1);
    expect(assembled.center.x).toBeCloseTo(0); // the hidden label doesn't count
    expect(assembled.center.y).toBeGreaterThan(0.2); // the running stroke does
    expect(exploded.center.x).toBeGreaterThan(40); // the label has appeared and the piston moved
    expect(exploded.distance).toBeGreaterThan(assembled.distance);
  });

  it("does not disturb the pose while measuring", () => {
    const { root, part, run, explode } = piston();
    new ModelMotion([{ root, clips: [run, explode] }]);
    expect(part.position.toArray()).toEqual([0, 0, 0]);
  });
});

function frame(...boxes: [number[], number[]][]): Pick<MotionFrame, "boxes"> {
  return {
    boxes: boxes.map(([min, max]) => new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max))),
  };
}

describe("fitFrame", () => {
  const front = new THREE.Vector3(0, 0, 1);
  const tan = Math.tan(THREE.MathUtils.degToRad(20));

  it("is limited by whichever side of a flat layout fills the view first", () => {
    const wide = frame([[-2, -0.5, 0], [2, 0.5, 0]]);
    const tall = frame([[-0.5, -2, 0], [0.5, 2, 0]]);
    expect(fitFrame(wide, front, 40, 1).distance).toBeCloseTo((2 / tan) * 1.06);
    expect(fitFrame(tall, front, 40, 1).distance).toBeCloseTo((2 / tan) * 1.06);
    expect(fitFrame(wide, front, 40, 2).distance).toBeCloseTo((1 / tan) * 1.06);
  });

  it("leaves room for the model's depth", () => {
    const deep = frame([[-1, -1, -1], [1, 1, 1]]);
    const flat = frame([[-1, -1, 0], [1, 1, 0]]);
    expect(fitFrame(deep, front, 40, 1).distance).toBeGreaterThan(fitFrame(flat, front, 40, 1).distance);
  });

  it("aims at the middle of what is on screen", () => {
    const { center } = fitFrame(frame([[1, 2, 3], [3, 4, 5]]), front, 40, 1);
    expect(center.toArray().map((v) => Math.round(v * 1e6) / 1e6)).toEqual([2, 3, 4]);
  });

  it("fits a layout facing an angled camera tightly, part by part", () => {
    // small labels on a plane facing the camera: their overall axis-aligned box is much bigger
    const towards = new THREE.Vector3(1, 0, 1).normalize();
    const along = new THREE.Vector3(1, 0, -1).normalize();
    const label = (t: number) => {
      const c = along.clone().multiplyScalar(t).toArray();
      return [c.map((v) => v - 0.05), c.map((v) => v + 0.05)] as [number[], number[]];
    };
    const parts = fitFrame(frame(label(-3), label(3)), towards, 40, 1).distance;
    const whole = fitFrame(frame([[-2.2, -0.05, -2.2], [2.2, 0.05, 2.2]]), towards, 40, 1).distance;
    expect(parts).toBeLessThan(whole * 0.9);
  });

  it("copes with nothing visible", () => {
    expect(fitFrame({ boxes: [] }, front, 40, 1).distance).toBe(1);
  });
});
