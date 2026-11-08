import { describe, expect, it } from "vitest";

import { moonPhasePath } from "../OrbitsLab";
import { DEFAULT_STATE, evaluateOrbits, seasonAt } from "./orbits";

const goal = { tasks: ["solar_eclipse", "lunar_eclipse", "periods", "seasons", "no_tilt"] };
const at = (patch: Partial<typeof DEFAULT_STATE>, achieved: string[] = []) => evaluateOrbits({ ...DEFAULT_STATE, ...patch }, goal, achieved);

// Same cases as backend/tests/test_labs_science.py::test_orbits_engine_*
describe("orbits engine", () => {
  it("counts orbits and lines up eclipses like the server", () => {
    const year = at({ days: 365 });
    expect(Object.fromEntries(year.result.planets.map((p) => [p.name, p.orbits]))).toEqual({ Mercury: 4, Venus: 1, Earth: 1, Mars: 0 });
    expect(year.achieved).toEqual(["periods"]);
    expect(year.message).toBe("Day 365: Earth has gone round the Sun once. In the same time Mercury went round 4 times, Venus once and Mars 0 times: the closer to the Sun, the shorter the year.");
    const solar = at({ view: "moon", moon_angle: 357 });
    expect(solar.result.eclipse).toBe("solar");
    expect(solar.achieved).toEqual(["solar_eclipse"]);
    expect(at({ view: "moon", moon_angle: 184 }).result.eclipse).toBe("lunar");
    const q = at({ view: "moon", moon_angle: 90 });
    expect(q.result.moon_phase).toBe("first quarter");
    expect(q.message).toContain("(50 % lit)");
  });

  it("computes seasons from the tilt", () => {
    const june = at({ view: "seasons", days: 91, latitude: 60 });
    expect(june.result.season).toBe("summer");
    expect(june.result.declination).toBe(23.4);
    expect(june.result.day_hours).toBe(18.5);
    expect(june.result.noon_sun).toBe(53.4);
    expect(june.message).toBe("At 60° N it is summer: the Sun is 53.4° high at noon and the day lasts 18.5 h. The tilt (23.4°), not the distance to the Sun, makes the seasons.");
    const dec = at({ view: "seasons", days: 274, latitude: 60, seen_seasons: ["summer"] });
    expect(dec.result.day_hours).toBe(5.5);
    expect(dec.achieved).toContain("seasons");
    const flat = at({ view: "seasons", days: 91, tilt: 0 });
    expect(flat.result.day_hours).toBe(12);
    expect(flat.achieved).toContain("no_tilt");
    expect(seasonAt(0)).toBe("spring");
    expect(seasonAt(182)).toBe("autumn");
  });

  it("draws moon phases on the correct side", () => {
    expect(moonPhasePath(0, 0, 10, 45)).toContain("A 10 10 0 0 1 0 10"); // waxing: lit on the right
    expect(moonPhasePath(0, 0, 10, 270)).toContain("A 10 10 0 0 0 0 10"); // waning: lit on the left
  });
});
