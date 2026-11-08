import { describe, expect, it } from "vitest";

import { DEFAULT_STATE, evaluateTectonics, type TectonicsState } from "./tectonics";

const goal = { tasks: ["subduction", "mountains", "compare", "layers", "waves"] };
const ev = (patch: Partial<TectonicsState>, done: string[] = []) => evaluateTectonics({ ...DEFAULT_STATE, ...patch }, goal, done);

// Same cases as backend/tests/test_labs_science.py::test_tectonics_engine_*
describe("tectonics engine", () => {
  it("moves plates like the server", () => {
    const sub = ev({ boundary: "subduction", myr: 6 });
    expect([sub.result.trench_km, sub.result.arc_km, sub.result.slab_km]).toEqual([4.5, 1.8, 240]);
    expect(sub.achieved).toEqual(["subduction"]);
    expect(sub.message).toBe("6 million years at 5 cm a year: 300 km of ocean floor has slid under the continent. The denser ocean plate sinks into the mantle, leaving a 4.5 km deep trench; rock melting above it feeds volcanoes up to 1.8 km high. Earthquakes strike from the surface down to 240 km.");
    expect(ev({ boundary: "collision", myr: 10 }).result.mountain_km).toBe(4.5);
    const peaks = ev({ boundary: "collision", myr: 12, seen_boundaries: ["subduction"] });
    expect(peaks.result.mountain_km).toBe(5.4);
    expect(peaks.achieved).toEqual(["mountains"]);
    expect(ev({ boundary: "transform", myr: 5, seen_boundaries: ["subduction", "collision"] }).achieved).toContain("compare");
  });

  it("inspects layers and sends waves", () => {
    expect(ev({ view: "layers", layer: "inner_core", inspected: ["crust", "mantle", "outer_core"] }).achieved).toContain("layers");
    const pFar = ev({ view: "waves", wave: "P", station: 120 });
    expect(pFar.result.p_arrives).toBe(false);
    const sFar = ev({ view: "waves", wave: "S", station: 120, seen_waves: ["P"] });
    expect(sFar.result.s_arrives).toBe(false);
    expect(sFar.result.station_km).toBe(13343);
    expect(sFar.achieved).toEqual(["waves"]);
    expect(sFar.message).toBe("S waves shake the rock side to side; they are slower and only travel through solids. A seismometer 120° (13343 km) round the Earth records none: the liquid outer core stops S waves.");
  });
});
