import { describe, expect, it } from "vitest";

import { validSelection } from "./ExplainSelection";

describe("validSelection", () => {
  it("accepts 1 to 3 words and trims punctuation and spaces", () => {
    expect(validSelection("  red blood cells. ")).toBe("red blood cells");
    expect(validSelection("“cell”")).toBe("cell");
    expect(validSelection("mitochondria")).toBe("mitochondria");
  });
  it("rejects empty, longer selections and very long text", () => {
    expect(validSelection("   ")).toBeNull();
    expect(validSelection("carry oxygen around the body")).toBeNull();
    expect(validSelection("x".repeat(61))).toBeNull();
  });
});
