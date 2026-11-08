import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { buttonAt, layoutButtons } from "./vrPanel";
import {
  applyStick,
  clampScale,
  fitScale,
  grabOne,
  grabTwo,
  levelForward,
  panelSpot,
  placeInFront,
  VR_LAYOUT,
  type HandPose,
  type StagePose,
} from "./vrStage";

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const hand = (x: number, y: number, z: number): HandPose => ({ position: v(x, y, z), quaternion: new THREE.Quaternion() });
const stage = (x = 0, y = 0, z = 0, scale = 1): StagePose => ({ position: v(x, y, z), quaternion: new THREE.Quaternion(), scale });
const near = (a: THREE.Vector3, b: THREE.Vector3) => expect(a.distanceTo(b)).toBeLessThan(1e-6);

describe("placing the model", () => {
  it("fits any model to the same real-world size", () => {
    expect(fitScale(0.01) * 0.01).toBeCloseTo(VR_LAYOUT.modelRadius);
    expect(fitScale(250) * 250).toBeCloseTo(VR_LAYOUT.modelRadius);
  });

  it("stands in front of the head, facing it, a little below eye level", () => {
    const p = placeInFront(v(0, 1.6, 0), v(0, 0, -1), 2);
    near(p.position, v(0, 1.6 - VR_LAYOUT.modelDrop, -VR_LAYOUT.modelDistance));
    near(v(0, 0, 1).applyQuaternion(p.quaternion), v(0, 0, 1));
  });

  it("turns the model's front toward a learner who faces another way", () => {
    const p = placeInFront(v(0, 1.6, 0), v(1, 0, 0), 2);
    near(v(0, 0, 1).applyQuaternion(p.quaternion), v(-1, 0, 0));
  });

  it("shows a model from the view its own file asks for", () => {
    const p = placeInFront(v(0, 1.6, 0), v(0, 0, -1), 2, [1, 0, 0]);
    near(v(1, 0, 0).applyQuaternion(p.quaternion), v(0, 0, 1));
  });

  it("still has a direction when looking straight down", () => {
    near(levelForward(v(0, -1, 0)), v(0, 0, -1));
  });

  it("puts the panel to the learner's left, clear of the model", () => {
    const spot = panelSpot(v(0, 1.6, 0), v(0, 0, -1));
    expect(spot.x).toBeLessThan(-0.8);
    expect(spot.z).toBeLessThan(0);
  });
});

describe("holding the model", () => {
  it("follows one hand rigidly", () => {
    near(grabOne(stage(0, 1, -1), hand(0, 1, 0), hand(0.5, 1.2, 0)).position, v(0.5, 1.2, -1));
  });

  it("swings around the hand when the wrist turns", () => {
    const turned = { position: v(0, 1, 0), quaternion: new THREE.Quaternion().setFromAxisAngle(v(0, 1, 0), Math.PI / 2) };
    near(grabOne(stage(0, 1, -1), hand(0, 1, 0), turned).position, v(-1, 1, 0));
  });

  it("zooms by the change in hand spacing and keeps the point between the hands", () => {
    const out = grabTwo(stage(0, 1, -1), [hand(-0.1, 1, -1), hand(0.1, 1, -1)], [hand(-0.2, 1, -1), hand(0.2, 1, -1)], 1);
    expect(out.scale).toBeCloseTo(2);
    near(out.position, v(0, 1, -1));
  });

  it("spins only about the vertical, so it can't tip over", () => {
    const out = grabTwo(stage(0, 1, -1), [hand(-0.2, 1, -1), hand(0.2, 1, -1)], [hand(0, 1.1, -1.2), hand(0, 0.9, -0.8)], 1);
    near(v(0, 1, 0).applyQuaternion(out.quaternion), v(0, 1, 0));
  });

  it("does not blow up if both hands start in the same place", () => {
    const out = grabTwo(stage(), [hand(0, 1, 0), hand(0, 1, 0)], [hand(-1, 1, 0), hand(1, 1, 0)], 1);
    expect(out.scale).toBe(1);
  });

  it("limits zoom in both directions", () => {
    expect(clampScale(1000, 1)).toBe(VR_LAYOUT.maxZoom);
    expect(clampScale(0.0001, 1)).toBe(VR_LAYOUT.minZoom);
  });
});

describe("thumbstick", () => {
  it("ignores a resting stick's drift", () => {
    const p = stage();
    applyStick(p, 0.1, -0.1, 0.1, 1);
    expect(p.scale).toBe(1);
    expect(p.quaternion.angleTo(new THREE.Quaternion())).toBe(0);
  });

  it("zooms in when pushed forward", () => {
    const p = stage();
    applyStick(p, 0, -1, 0.1, 1);
    expect(p.scale).toBeGreaterThan(1);
  });
});

describe("panel buttons", () => {
  it("lays out two rows and never overlaps", () => {
    const rects = layoutButtons(10);
    expect(new Set(rects.map((r) => r.y)).size).toBe(2);
    expect(rects[1]!.x).toBeGreaterThan(rects[0]!.x + rects[0]!.w);
  });

  it("finds the button under the ray, with v pointing up", () => {
    const rects = layoutButtons(10);
    const r = rects[7]!;
    expect(buttonAt(rects, (r.x + r.w / 2) / 1280, 1 - (r.y + r.h / 2) / 800)).toBe(7);
  });

  it("finds nothing over the text area", () => {
    expect(buttonAt(layoutButtons(10), 0.5, 0.9)).toBe(-1);
  });
});
