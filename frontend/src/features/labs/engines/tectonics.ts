/**
 * Earth-science engine (plate tectonics, Earth's layers, seismic waves), a port of
 * backend/.../engines/tectonics.py. Keep in sync: same numbers, same rounding, same messages.
 */
export const KM_PER_MYR = 50;
export const MAX_MYR = 20;
export const BOUNDARIES: Record<string, string> = {
  subduction: "Ocean plate meets continent (convergent)",
  collision: "Continent meets continent (convergent)",
  divergent: "Plates move apart (divergent)",
  transform: "Plates slide past each other (transform)",
};
export interface Layer { name: string; from_km: number; to_km: number; state: string; temp_c: number }
export const LAYERS: Record<string, Layer> = {
  crust: { name: "Crust", from_km: 0, to_km: 35, state: "solid rock", temp_c: 400 },
  mantle: { name: "Mantle", from_km: 35, to_km: 2890, state: "solid rock that flows very slowly", temp_c: 3700 },
  outer_core: { name: "Outer core", from_km: 2890, to_km: 5150, state: "liquid iron and nickel", temp_c: 5000 },
  inner_core: { name: "Inner core", from_km: 5150, to_km: 6371, state: "solid iron and nickel", temp_c: 5400 },
};
export const P_SHADOW: [number, number] = [104, 140];
export const S_LIMIT = 104;
export const TASKS: Record<string, string> = {
  subduction: "Create a subduction zone",
  mountains: "Push two continents together into mountains at least 5 km high",
  compare: "Run three different boundary types and compare them",
  layers: "Inspect all four layers of the Earth",
  waves: "Send both P and S waves and find where they arrive",
};

export interface TectonicsState {
  view: "plates" | "layers" | "waves";
  boundary: string;
  myr: number;
  seen_boundaries: string[];
  layer: string | null;
  inspected: string[];
  wave: "P" | "S";
  station: number;
  seen_waves: ("P" | "S")[];
}
export interface TectonicsGoal { tasks: string[] }
export interface TectonicsResult {
  distance_km: number;
  boundary: string;
  volcanoes: boolean;
  mountain_km: number;
  arc_km: number;
  trench_km: number;
  slab_km: number;
  quake_depth: string;
  new_crust_km: number;
  offset_km: number;
  p_arrives: boolean;
  s_arrives: boolean;
  station_km: number;
  achieved: string[];
  tasks: string[];
}

export const DEFAULT_STATE: TectonicsState = { view: "plates", boundary: "subduction", myr: 0, seen_boundaries: [], layer: null, inspected: [], wave: "P", station: 60, seen_waves: [] };

const rnd = (v: number, nd: number) => Math.floor(v * 10 ** nd + 0.5) / 10 ** nd;

export function compute(s: TectonicsState): Omit<TectonicsResult, "achieved" | "tasks"> {
  const km = s.myr * KM_PER_MYR;
  const b = s.boundary;
  return {
    distance_km: km, boundary: b,
    volcanoes: (b === "subduction" || b === "divergent") && s.myr > 0,
    mountain_km: b === "collision" ? rnd(Math.min(8.8, 0.45 * s.myr), 1) : 0,
    arc_km: b === "subduction" ? rnd(Math.min(4, 0.3 * s.myr), 1) : 0,
    trench_km: b === "subduction" ? rnd(Math.min(8, 1.5 + 0.5 * s.myr), 1) : 0,
    slab_km: b === "subduction" ? Math.min(660, s.myr * 40) : 0,
    quake_depth: b === "subduction" && s.myr >= 3 ? "shallow to deep" : "shallow",
    new_crust_km: b === "divergent" ? km : 0,
    offset_km: b === "transform" ? km : 0,
    p_arrives: s.station < P_SHADOW[0] || s.station > P_SHADOW[1],
    s_arrives: s.station < S_LIMIT,
    station_km: rnd((s.station / 360) * 2 * Math.PI * 6371, 0),
  };
}

function achievedNow(s: TectonicsState, r: ReturnType<typeof compute>): string[] {
  const now: string[] = [];
  if (s.boundary === "subduction" && s.myr >= 5) now.push("subduction");
  if (s.boundary === "collision" && r.mountain_km >= 5) now.push("mountains");
  const seen = new Set([...s.seen_boundaries, ...(s.myr >= 5 ? [s.boundary] : [])]);
  if (seen.size >= 3) now.push("compare");
  const insp = new Set([...s.inspected, ...(s.layer ? [s.layer] : [])]);
  if (Object.keys(LAYERS).every((k) => insp.has(k))) now.push("layers");
  const waves = new Set([...s.seen_waves, ...(s.view === "waves" ? [s.wave] : [])]);
  if (waves.has("P") && waves.has("S")) now.push("waves");
  return now;
}

export function tectonicsMessage(s: TectonicsState, r: ReturnType<typeof compute>): string {
  if (s.view === "layers") {
    if (s.layer === null) return "Click a layer of the Earth to inspect it.";
    const x = LAYERS[s.layer]!;
    return `${x.name}: from ${x.from_km} to ${x.to_km} km deep, ${x.state}, about ${x.temp_c} °C.`;
  }
  if (s.view === "waves") {
    const kind = s.wave === "P"
      ? "P waves push and pull the rock; they are the fastest and travel through solids and liquids"
      : "S waves shake the rock side to side; they are slower and only travel through solids";
    const arrive = s.wave === "P" ? r.p_arrives : r.s_arrives;
    const where = `A seismometer ${s.station}° (${r.station_km} km) round the Earth`;
    if (arrive) return `${kind}. ${where} records them.`;
    if (s.wave === "S") return `${kind}. ${where} records none: the liquid outer core stops S waves.`;
    return `${kind}. ${where} is in the P-wave shadow zone: the core bends the waves away from it.`;
  }
  if (s.myr === 0) return "Drag the Time slider or press Run to move the plates.";
  const lead = `${s.myr} million years at 5 cm a year: `;
  if (s.boundary === "subduction") return `${lead}${r.distance_km} km of ocean floor has slid under the continent. The denser ocean plate sinks into the mantle, leaving a ${r.trench_km} km deep trench; rock melting above it feeds volcanoes up to ${r.arc_km} km high. Earthquakes strike from the surface down to ${r.slab_km} km.`;
  if (s.boundary === "collision") return `${lead}neither continent can sink, so the crust crumples and thickens into mountains ${r.mountain_km} km high, like the Himalayas. Earthquakes are shallow, and there are no volcanoes.`;
  if (s.boundary === "divergent") return `${lead}the plates moved ${r.distance_km} km apart. Magma rises into the gap and cools into new ocean floor, building a mid-ocean ridge with volcanoes and shallow earthquakes.`;
  return `${lead}the plates slid ${r.distance_km} km past each other along the fault. No crust is made or destroyed and there are no volcanoes, but the plates stick and slip in shallow earthquakes, like on the San Andreas Fault.`;
}

export function evaluateTectonics(s: TectonicsState, goal: TectonicsGoal, achieved: string[]): { result: TectonicsResult; message: string; goal_met: boolean; achieved: string[] } {
  const r = compute(s);
  const now = achievedNow(s, r).filter((t) => goal.tasks.includes(t));
  const done = [...new Set([...achieved, ...now])].sort();
  const met = goal.tasks.every((t) => done.includes(t));
  return { result: { ...r, achieved: done, tasks: goal.tasks }, message: tectonicsMessage(s, r) + (met ? " Every task done!" : ""), goal_met: met, achieved: now };
}
