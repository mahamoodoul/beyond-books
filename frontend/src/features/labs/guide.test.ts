import { describe, expect, it } from "vitest";

import { evaluate, type Circuit, type Part } from "./circuit";
import { buildSteps } from "./guide";

const part = (id: string, type: Part["type"], closed = true): Part => ({ id, type, x: 0, y: 0, closed });
const wire = (id: string, a: string, b: string) => ({ id, a, b });
const goal = { min_lit: 1, require_switch: true };
const steps = (c: Circuit) => buildSteps(goal, c, evaluate(c));
const current = (c: Circuit) => steps(c).find((s) => s.state === "current")?.key;

describe("lab guide", () => {
  it("walks from empty board to a lit bulb with a switch", () => {
    const c: Circuit = { parts: [], wires: [] };
    expect(current(c)).toBe("battery");
    c.parts.push(part("bat", "battery"));
    expect(current(c)).toBe("bulb");
    c.parts.push(part("l1", "bulb"));
    expect(current(c)).toBe("plus");
    c.wires.push(wire("w1", "bat:a", "l1:a"));
    expect(current(c)).toBe("minus");
    c.wires.push(wire("w2", "l1:b", "bat:b"));
    expect(current(c)).toBe("switch");
    expect(steps(c).filter((s) => s.state === "done").map((s) => s.key)).toEqual(["battery", "bulb", "plus", "minus"]);
    // switch wired in series, open
    c.wires.pop();
    c.parts.push(part("s", "switch", false));
    c.wires.push(wire("w2", "l1:b", "s:a"), wire("w3", "s:b", "bat:b"));
    expect(current(c)).toBe("close");
    c.parts[2]!.closed = true;
    expect(current(c)).toBeUndefined(); // every step done
    expect(steps(c).every((s) => s.state === "done")).toBe(true);
  });

  it("puts fixing a short circuit first", () => {
    const c: Circuit = {
      parts: [part("bat", "battery"), part("l1", "bulb")],
      wires: [wire("w1", "bat:a", "l1:a"), wire("w2", "l1:b", "bat:b"), wire("w3", "bat:a", "bat:b")],
    };
    const s = steps(c);
    expect(s.find((x) => x.state === "current")?.key).toBe("short");
    expect(s[0]!.state).toBe("done"); // battery step stays done
  });

  it("adds a parallel-bulbs step when the goal needs several bulbs", () => {
    const c: Circuit = {
      parts: [part("bat", "battery"), part("l1", "bulb")],
      wires: [wire("w1", "bat:a", "l1:a"), wire("w2", "l1:b", "bat:b")],
    };
    const s = buildSteps({ min_lit: 2, require_switch: false }, c, evaluate(c));
    expect(s.map((x) => x.key)).toEqual(["battery", "bulb", "plus", "minus", "more"]);
    expect(s.find((x) => x.state === "current")?.key).toBe("more");
  });
});
