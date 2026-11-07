import { describe, expect, it } from "vitest";

import { chunk } from "./chunk";

describe("chunk", () => {
  it("keeps short text whole and drops empty text", () => {
    expect(chunk("  The heart   pumps blood. ")).toEqual(["The heart pumps blood."]);
    expect(chunk("   ")).toEqual([]);
  });
  it("cuts long text at sentence ends under the limit", () => {
    const text = Array.from({ length: 40 }, (_, i) => `Sentence number ${i + 1} is here.`).join(" ");
    const parts = chunk(text, 200);
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) {
      expect(p.length).toBeLessThanOrEqual(200);
      expect(p.endsWith(".")).toBe(true);
    }
    expect(parts.join(" ")).toBe(text);
  });
  it("falls back to a word boundary when there is no sentence end", () => {
    const parts = chunk("word ".repeat(100).trim(), 120);
    expect(parts.every((p) => p.length <= 120 && !p.startsWith(" "))).toBe(true);
  });
});
