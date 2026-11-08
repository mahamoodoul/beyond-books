import { describe, expect, it } from "vitest";

import { evaluate, goalMet, type Circuit, type Part } from "./circuit";

const part = (id: string, type: Part["type"], closed = true): Part => ({ id, type, x: 0, y: 0, closed });
const wire = (id: string, a: string, b: string) => ({ id, a, b });

const loop: Circuit = {
  parts: [part("bat", "battery"), part("l1", "bulb")],
  wires: [wire("w1", "bat:a", "l1:a"), wire("w2", "l1:b", "bat:b")],
};

// The same cases as backend/tests/test_labs.py: the two evaluators must agree.
describe("circuit evaluation", () => {
  it("lights a single bulb at full brightness", () => {
    const r = evaluate(loop);
    expect(r.lit).toEqual(["l1"]);
    expect(r.brightness.l1).toBe(1);
    expect(r.short_circuit).toBe(false);
    expect(r.message).toContain("1 bulb lit");
  });

  it("explains a missing battery, an open loop and an open switch", () => {
    expect(evaluate({ parts: [part("l1", "bulb")], wires: [] }).message).toMatch(/^Add a battery/);
    const open = evaluate({ parts: loop.parts, wires: [wire("w1", "bat:a", "l1:a")] });
    expect(open.lit).toEqual([]);
    expect(open.message).toContain("No complete loop");
    const withSwitch: Circuit = {
      parts: [part("bat", "battery"), part("l1", "bulb"), part("s", "switch", false)],
      wires: [wire("w1", "bat:a", "s:a"), wire("w2", "s:b", "l1:a"), wire("w3", "l1:b", "bat:b")],
    };
    expect(evaluate(withSwitch).message).toContain("switch is open");
    withSwitch.parts[2]!.closed = true;
    expect(evaluate(withSwitch).lit).toEqual(["l1"]);
  });

  it("treats unconnected parts as harmless", () => {
    const r = evaluate({ parts: [part("bat", "battery"), part("l1", "bulb"), part("l2", "bulb")], wires: [] });
    expect(r.short_circuit).toBe(false);
    expect(r.lit).toEqual([]);
    expect(r.message).toContain("No complete loop");
    const spare = evaluate({ parts: [...loop.parts, part("spare", "bulb")], wires: loop.wires });
    expect(spare.lit).toEqual(["l1"]);
    expect(spare.brightness).toEqual({ l1: 1, spare: 0 });
  });

  it("detects a short circuit around the bulb", () => {
    const r = evaluate({ parts: loop.parts, wires: [...loop.wires, wire("w3", "bat:a", "bat:b")] });
    expect(r.short_circuit).toBe(true);
    expect(r.lit).toEqual([]);
  });

  it("makes series bulbs dim and parallel bulbs bright", () => {
    const series = evaluate({
      parts: [part("bat", "battery"), part("l1", "bulb"), part("l2", "bulb")],
      wires: [wire("w1", "bat:a", "l1:a"), wire("w2", "l1:b", "l2:a"), wire("w3", "l2:b", "bat:b")],
    });
    expect(series.brightness).toEqual({ l1: 0.5, l2: 0.5 });
    expect(series.message).toContain("dim");
    const parallel = evaluate({
      parts: [part("bat", "battery"), part("l1", "bulb"), part("l2", "bulb")],
      wires: [wire("w1", "bat:a", "l1:a"), wire("w2", "l1:b", "bat:b"), wire("w3", "bat:a", "l2:a"), wire("w4", "l2:b", "bat:b")],
    });
    expect(parallel.brightness).toEqual({ l1: 1, l2: 1 });
  });

  it("checks the goal", () => {
    const r = evaluate(loop);
    expect(goalMet({ min_lit: 1, require_switch: false }, loop, r)).toBe(true);
    expect(goalMet({ min_lit: 1, require_switch: true }, loop, r)).toBe(false);
    expect(goalMet({ min_lit: 2, require_switch: false }, loop, r)).toBe(false);
  });
});
