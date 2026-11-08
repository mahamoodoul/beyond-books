import { describe, expect, it } from "vitest";

import type { Circuit, Part } from "./circuit";
import { initHistory, push, redo, undo } from "./history";

const part = (id: string, type: Part["type"], x = 0, closed = true): Part => ({ id, type, x, y: 0, closed });
const c = (...parts: Part[]): Circuit => ({ parts, wires: [] });

describe("circuit history", () => {
  it("undoes and redoes structural steps", () => {
    let h = initHistory(c());
    h = push(h, c(part("bat", "battery")));
    h = push(h, c(part("bat", "battery"), part("l1", "bulb")));
    expect(h.past).toHaveLength(2);
    h = undo(h);
    expect(h.present.parts.map((p) => p.id)).toEqual(["bat"]);
    h = undo(h);
    expect(h.present.parts).toEqual([]);
    expect(undo(h)).toBe(h); // nothing left to undo
    h = redo(h);
    expect(h.present.parts.map((p) => p.id)).toEqual(["bat"]);
  });

  it("collapses a drag into one step", () => {
    let h = initHistory(c(part("bat", "battery", 100)));
    h = push(h, c(part("bat", "battery", 120)));
    h = push(h, c(part("bat", "battery", 140)));
    h = push(h, c(part("bat", "battery", 160)));
    expect(h.past).toHaveLength(1);
    h = undo(h);
    expect(h.present.parts[0]!.x).toBe(100);
  });

  it("a new step after undo clears the redo stack, and flipping a switch is a step", () => {
    let h = initHistory(c(part("s", "switch", 0, true)));
    h = push(h, c(part("s", "switch", 0, false)));
    expect(h.past).toHaveLength(1);
    h = undo(h);
    expect(h.future).toHaveLength(1);
    h = push(h, c(part("s", "switch", 0, true), part("l1", "bulb")));
    expect(h.future).toHaveLength(0);
  });
});
