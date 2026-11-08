import { describe, expect, it } from "vitest";

import { buildRespirationSteps } from "../guide";
import { DEFAULT_STATE, evaluateRespiration } from "./respiration";

const goal = { tasks: ["inhale", "exhale", "rate", "exercise", "trace"] };

// Same cases as backend/tests/test_labs_science.py::test_respiration_engine_*
describe("respiration engine", () => {
  it("computes ventilation, oxygen and tasks like the server", () => {
    const rest = { ...DEFAULT_STATE, phase: "in" as const };
    const r = evaluateRespiration(rest, goal, []);
    expect(r.result.minute_ventilation_l).toBe(6);
    expect(r.result.alveolar_ventilation_l).toBe(4.2);
    expect(r.result.o2_uptake_l).toBe(0.25);
    expect(r.result.saturation).toBe(98);
    expect(r.achieved).toEqual(["inhale"]);
    expect(r.message).toContain("diaphragm contracts");
    expect(r.message).toContain("6 L of air a minute; the body takes 0.25 L of oxygen from it and needs 0.2 L while you rest. Enough: blood oxygen stays at 98 %.");

    const run = { ...rest, phase: "out" as const, activity: "run", seen: ["in" as const] };
    const r2 = evaluateRespiration(run, goal, ["inhale"]);
    expect(r2.result.saturation).toBe(70);
    expect(r2.result.co2).toBe("rising");
    expect(new Set(r2.achieved)).toEqual(new Set(["inhale", "exhale"]));

    const fast = { ...run, rate: 30, depth_l: 1.3, view: "alveolus" as const, traced: true };
    const r3 = evaluateRespiration(fast, goal, ["inhale", "exhale"]);
    expect(r3.result.o2_uptake_l).toBe(2.07);
    expect(r3.goal_met).toBe(true);

    const r4 = evaluateRespiration({ ...rest, rate: 40, depth_l: 1.5 }, goal, []);
    expect(r4.result.co2).toBe("low");
  });

  it("guides step by step", () => {
    const r = evaluateRespiration({ ...DEFAULT_STATE, phase: "in" }, goal, []);
    const steps = buildRespirationSteps(goal, r.result);
    expect(steps.map((s) => s.state)).toEqual(["done", "current", "todo", "todo", "todo"]);
  });
});
