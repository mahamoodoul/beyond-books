import { describe, expect, it } from "vitest";

import { contrastRatio, requiredContrast } from "./a11yAudit";

describe("contrastRatio", () => {
  it("is 21:1 for black on white and 1:1 for equal colours", () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5);
    expect(contrastRatio([97, 84, 200], [97, 84, 200])).toBe(1);
  });

  it("does not depend on the order of the colours", () => {
    expect(contrastRatio([36, 35, 58], [247, 247, 250])).toBeCloseTo(contrastRatio([247, 247, 250], [36, 35, 58]), 10);
  });

  it("flags the slate-400 meta text that failed on white", () => {
    // #94a3b8 on #fff was the page-range text: below 4.5:1
    expect(contrastRatio([148, 163, 184], [255, 255, 255])).toBeLessThan(4.5);
  });
});

describe("requiredContrast", () => {
  it("asks 4.5:1 for body text and 3:1 for large or large bold text", () => {
    expect(requiredContrast(15, 400)).toBe(4.5);
    expect(requiredContrast(24, 400)).toBe(3);
    expect(requiredContrast(19, 700)).toBe(3);
    expect(requiredContrast(19, 600)).toBe(4.5);
  });
});
