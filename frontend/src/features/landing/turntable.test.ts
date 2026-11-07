import { describe, expect, it } from "vitest";

import { atomScene, cubeScene, globeScene, moleculeScene, planetScene, renderScene, rotY } from "./turntable";

describe("turntable renderer", () => {
  it("turns points around the vertical axis", () => {
    const [x, y, z] = rotY([100, 20, 0], Math.PI / 2);
    expect(x).toBeCloseTo(0);
    expect(y).toBe(20);
    expect(z).toBeCloseTo(-100);
  });

  it("renders every subject to SVG and changes as it turns", () => {
    for (const scene of [atomScene, moleculeScene, globeScene, planetScene, cubeScene]) {
      const a = renderScene(scene, 0, 0);
      const b = renderScene(scene, 0, 1.2);
      expect(a.length).toBeGreaterThan(100);
      expect(a).not.toMatch(/NaN/);
      expect(a).not.toBe(b);
    }
  });

  it("hides the far side of the globe", () => {
    const front = renderScene(globeScene, 0, 0).match(/<circle/g)?.length ?? 0;
    const back = renderScene(globeScene, 0, Math.PI).match(/<circle/g)?.length ?? 0;
    expect(front).not.toBe(back); // different land is visible from the other side
  });
});
