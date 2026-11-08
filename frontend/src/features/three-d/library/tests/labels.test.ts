import { describe, expect, it } from "vitest";

import { labelGap, labelSpot } from "@/features/three-d/library/runtime/labels";

const VIEW = { width: 800, height: 600 };
const HALF = { w: 40, h: 10 };
const CENTRE = { x: 400, y: 300 };

describe("labelSpot", () => {
  it("pushes the label away from the model's centre", () => {
    const gap = labelGap(VIEW.width, VIEW.height);
    expect(labelSpot(500, 300, CENTRE, VIEW, HALF)).toEqual({ x: 500 + gap, y: 300 });
    const up = labelSpot(400, 200, CENTRE, VIEW, HALF);
    expect(up.x).toBeCloseTo(400);
    expect(up.y).toBeCloseTo(200 - gap);
  });

  it("goes straight up for an anchor at the centre", () => {
    const at = labelSpot(400, 300, CENTRE, VIEW, HALF);
    expect(at.x).toBeCloseTo(400);
    expect(at.y).toBeLessThan(300);
  });

  it("keeps the label inside the viewer", () => {
    const at = labelSpot(790, 5, CENTRE, VIEW, HALF);
    expect(at.x).toBeLessThanOrEqual(VIEW.width - HALF.w);
    expect(at.y).toBeGreaterThanOrEqual(HALF.h);
  });

  it("scales the gap with the viewer, within limits", () => {
    expect(labelGap(200, 150)).toBe(44);
    expect(labelGap(3000, 2000)).toBe(96);
  });
});
