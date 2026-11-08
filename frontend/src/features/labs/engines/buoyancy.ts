/**
 * Physics engine (pressure and buoyancy), a port of backend/.../engines/buoyancy.py. Keep in sync.
 */
export const G = 9.81;
export const MATERIALS: Record<string, number> = { wood: 600, ice: 917, plastic: 950, wax: 900, rubber: 1100, glass: 2500, aluminium: 2700, steel: 7850 };
export const LIQUIDS: Record<string, number> = { "fresh water": 1000, "salt water": 1025, oil: 920, honey: 1420 };
export const TASKS: Record<string, string> = {
  float: "Make an object float",
  sink: "Make an object sink",
  half: "Find an object that floats about half submerged",
  salt: "Compare fresh and salt water with the same object",
  pressure: "Read a pressure of at least 10 kPa above the surface",
};
export const TANK_DEPTH_M = 2;

export interface BuoyancyState {
  material: string;
  object_density: number;
  volume_l: number;
  liquid: string;
  liquid_density: number;
  probe_depth_m: number;
  tried_liquids: string[];
}
export interface BuoyancyGoal { tasks: string[] }
export interface BuoyancyResult {
  object_density: number;
  liquid_density: number;
  mass_kg: number;
  weight_n: number;
  floats: boolean;
  submerged_fraction: number;
  buoyant_force_n: number;
  net_force_n: number;
  probe_depth_m: number;
  pressure_kpa: number;
  tank_depth_m: number;
  achieved: string[];
  tasks: string[];
}

export const DEFAULT_STATE: BuoyancyState = { material: "wood", object_density: 600, volume_l: 1, liquid: "fresh water", liquid_density: 1000, probe_depth_m: 0.5, tried_liquids: [] };

// half-up rounding, identical to the backend's math.floor(v * 10**nd + 0.5) / 10**nd
const r2 = (v: number) => Math.floor(v * 100 + 0.5) / 100;
const r3 = (v: number) => Math.floor(v * 1000 + 0.5) / 1000;

export function densities(s: BuoyancyState): { rhoO: number; rhoL: number } {
  return { rhoO: s.material === "custom" ? s.object_density : MATERIALS[s.material]!, rhoL: s.liquid === "custom" ? s.liquid_density : LIQUIDS[s.liquid]! };
}

export function compute(s: BuoyancyState): Omit<BuoyancyResult, "achieved" | "tasks"> {
  const { rhoO, rhoL } = densities(s);
  const volume = s.volume_l / 1000;
  const mass = rhoO * volume;
  const weight = mass * G;
  const floats = rhoO < rhoL;
  const sub = Math.min(1, rhoO / rhoL);
  const buoyant = rhoL * G * volume * sub;
  return {
    object_density: rhoO, liquid_density: rhoL, mass_kg: r3(mass), weight_n: r2(weight), floats, submerged_fraction: r3(sub),
    buoyant_force_n: r2(buoyant), net_force_n: r2(buoyant - weight), probe_depth_m: s.probe_depth_m,
    pressure_kpa: r2((rhoL * G * s.probe_depth_m) / 1000), tank_depth_m: TANK_DEPTH_M,
  };
}

export function evaluateBuoyancy(s: BuoyancyState, goal: BuoyancyGoal, achieved: string[]): { result: BuoyancyResult; message: string; goal_met: boolean; achieved: string[] } {
  const r = compute(s);
  let now: string[] = [r.floats ? "float" : "sink"];
  if (r.floats && r.submerged_fraction >= 0.4 && r.submerged_fraction <= 0.6) now.push("half");
  const tried = new Set([...s.tried_liquids, s.liquid]);
  if (tried.has("fresh water") && tried.has("salt water")) now.push("salt");
  if (r.pressure_kpa >= 10) now.push("pressure");
  now = now.filter((t) => goal.tasks.includes(t));
  const done = [...new Set([...achieved, ...now])].sort();
  const met = goal.tasks.every((t) => done.includes(t));
  const pct = Math.round(r.submerged_fraction * 100);
  let message = r.floats
    ? `It floats with ${pct}% under the surface: its density (${r.object_density.toFixed(0)} kg/m³) is lower than the liquid's (${r.liquid_density.toFixed(0)} kg/m³). Buoyant force ${r.buoyant_force_n} N balances its weight ${r.weight_n} N.`
    : `It sinks: its density (${r.object_density.toFixed(0)} kg/m³) is higher than the liquid's (${r.liquid_density.toFixed(0)} kg/m³). Buoyant force ${r.buoyant_force_n} N is less than its weight ${r.weight_n} N.`;
  message += ` Pressure at ${s.probe_depth_m.toFixed(2)} m: ${r.pressure_kpa} kPa.`;
  if (met) message += " Every task done!";
  return { result: { ...r, achieved: done, tasks: goal.tasks }, message, goal_met: met, achieved: now };
}
