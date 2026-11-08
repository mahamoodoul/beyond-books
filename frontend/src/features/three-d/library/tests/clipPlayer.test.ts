import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { ClipPlayer } from "@/features/three-d/library/runtime/clipPlayer";

function model() {
  const root = new THREE.Group();
  const part = new THREE.Group();
  part.name = "pistons";
  const piston = new THREE.Object3D();
  piston.name = "piston_1";
  part.add(piston);
  root.add(part);
  root.animations = [
    new THREE.AnimationClip("cycle", 2, [
      new THREE.NumberKeyframeTrack("piston_1.position[y]", [0, 1, 2], [0, 1, 0]),
    ]),
  ];
  return { root, piston };
}

describe("ClipPlayer", () => {
  it("poses the model at the timeline's time, looping", () => {
    const { root, piston } = model();
    const p = new ClipPlayer([root]);
    expect(p.names).toEqual(["cycle"]);
    p.apply({ name: "cycle", time: 0.5, loop: true });
    expect(piston.position.y).toBeCloseTo(0.5);
    p.apply({ name: "cycle", time: 3, loop: true }); // 3 s = 1 s into the next loop
    expect(piston.position.y).toBeCloseTo(1);
  });

  it("holds the last pose without loop, and restores the rest pose when stopped", () => {
    const { root, piston } = model();
    const p = new ClipPlayer([root]);
    p.apply({ name: "cycle", time: 1, loop: false });
    expect(piston.position.y).toBeCloseTo(1);
    p.apply(null);
    expect(piston.position.y).toBe(0);
  });

  it("ignores a clip the model doesn't have", () => {
    const { root, piston } = model();
    const p = new ClipPlayer([root]);
    p.apply({ name: "missing", time: 1, loop: true });
    expect(piston.position.y).toBe(0);
  });
});
