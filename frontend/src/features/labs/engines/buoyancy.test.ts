import { describe, expect, it } from "vitest";

import { DEFAULT_STATE, evaluateBuoyancy } from "./buoyancy";

const goal = { tasks: ["float", "sink", "salt", "pressure"] };

// Same cases as backend/tests/test_labs.py::test_buoyancy_engine_*
describe("buoyancy engine", () => {
  it("floats wood, sinks steel and reads pressure", () => {
    const r = evaluateBuoyancy({ ...DEFAULT_STATE, material: "wood", probe_depth_m: 0.5 }, goal, []);
    expect(r.result.floats).toBe(true);
    expect(r.result.submerged_fraction).toBe(0.6);
    expect(r.result.buoyant_force_n).toBe(r.result.weight_n);
    expect(r.result.weight_n).toBe(5.89);
    expect(r.result.pressure_kpa).toBe(4.91);
    expect(r.achieved).toEqual(["float"]);
    const r2 = evaluateBuoyancy({ ...DEFAULT_STATE, material: "steel", probe_depth_m: 1.5 }, goal, ["float"]);
    expect(r2.result.floats).toBe(false);
    expect(r2.result.pressure_kpa).toBe(14.72);
    expect(new Set(r2.achieved)).toEqual(new Set(["sink", "pressure"]));
    const r3 = evaluateBuoyancy({ ...DEFAULT_STATE, material: "ice", liquid: "salt water", probe_depth_m: 0, tried_liquids: ["fresh water"] }, goal, ["float", "sink", "pressure"]);
    expect(r3.achieved).toContain("salt");
    expect(r3.goal_met).toBe(true);
  });
});
