/**
 * Biology engine (breathing and gas exchange), a port of backend/.../engines/respiration.py.
 * Keep in sync: same numbers, same rounding, same messages.
 */
export const DEAD_SPACE_L = 0.15;
export const O2_EXTRACTED = 0.06;
export const ACTIVITIES: Record<string, number> = { rest: 0.2, walk: 0.8, run: 2.0 };
export const TASKS: Record<string, string> = {
  inhale: "Breathe in and watch the diaphragm and lungs",
  exhale: "Breathe out and compare",
  rate: "Raise the breathing rate to 25 breaths a minute or more",
  exercise: "Keep blood oxygen at 95 % or more while running",
  trace: "Zoom into an alveolus and trace oxygen into the blood",
};

export interface RespirationState {
  phase: "in" | "out";
  rate: number;
  depth_l: number;
  activity: string;
  view: "lungs" | "alveolus";
  traced: boolean;
  seen: ("in" | "out")[];
}
export interface RespirationGoal { tasks: string[] }
export interface RespirationResult {
  minute_ventilation_l: number;
  alveolar_ventilation_l: number;
  o2_uptake_l: number;
  o2_need_l: number;
  saturation: number;
  co2: "normal" | "rising" | "low";
  breath_seconds: number;
  phase: "in" | "out";
  achieved: string[];
  tasks: string[];
}

export const DEFAULT_STATE: RespirationState = { phase: "out", rate: 12, depth_l: 0.5, activity: "rest", view: "lungs", traced: false, seen: [] };

const rnd = (v: number, nd: number) => Math.floor(v * 10 ** nd + 0.5) / 10 ** nd;
const fix1 = (v: number) => (Math.round(v * 10) / 10).toFixed(1); // python f"{v:.1f}" for our 0.1-step values

export function compute(s: RespirationState): Omit<RespirationResult, "achieved" | "tasks"> {
  const minute = s.rate * s.depth_l;
  const alveolar = s.rate * Math.max(0, s.depth_l - DEAD_SPACE_L);
  const uptake = alveolar * O2_EXTRACTED;
  const need = ACTIVITIES[s.activity] ?? ACTIVITIES.rest!;
  const ratio = uptake / need;
  const sat = ratio >= 1 ? 98 : Math.max(70, 98 - (1 - ratio) * 40);
  const co2 = ratio < 1 ? "rising" : ratio > 3 ? "low" : "normal";
  return {
    minute_ventilation_l: rnd(minute, 1), alveolar_ventilation_l: rnd(alveolar, 1), o2_uptake_l: rnd(uptake, 2), o2_need_l: need,
    saturation: rnd(sat, 1), co2, breath_seconds: rnd(60 / s.rate, 2), phase: s.phase,
  };
}

function achievedNow(s: RespirationState, r: ReturnType<typeof compute>): string[] {
  const seen = new Set([...s.seen, s.phase]);
  const now: string[] = [];
  if (seen.has("in")) now.push("inhale");
  if (seen.has("out")) now.push("exhale");
  if (s.rate >= 25) now.push("rate");
  if (s.activity === "run" && r.saturation >= 95) now.push("exercise");
  if (s.view === "alveolus" && s.traced) now.push("trace");
  return now;
}


export function respirationMessage(s: RespirationState, r: ReturnType<typeof compute>): string {
  let msg = s.phase === "in"
    ? "Breathing in: the diaphragm contracts and flattens, the ribs lift, the chest gets bigger and air is pulled into the lungs."
    : "Breathing out: the diaphragm relaxes and domes up, the chest gets smaller and air is pushed out.";
  msg += ` ${s.rate} breaths × ${fix1(s.depth_l)} L = ${String(r.minute_ventilation_l)} L of air a minute; the body takes ${String(r.o2_uptake_l)} L of oxygen from it and needs ${String(r.o2_need_l)} L while you ${s.activity}.`;
  if (r.co2 === "rising") msg += ` Not enough: blood oxygen drops to ${String(r.saturation)} % and CO₂ builds up.`;
  else if (r.co2 === "low") msg += " Far more than needed: CO₂ is blown off too fast, which can make you dizzy.";
  else msg += ` Enough: blood oxygen stays at ${String(r.saturation)} %.`;
  return msg;
}

export function evaluateRespiration(s: RespirationState, goal: RespirationGoal, achieved: string[]): { result: RespirationResult; message: string; goal_met: boolean; achieved: string[] } {
  const r = compute(s);
  const now = achievedNow(s, r).filter((t) => goal.tasks.includes(t));
  const done = [...new Set([...achieved, ...now])].sort();
  const met = goal.tasks.every((t) => done.includes(t));
  const message = respirationMessage(s, r) + (met ? " Every task done!" : "");
  return { result: { ...r, achieved: done, tasks: goal.tasks }, message, goal_met: met, achieved: now };
}
