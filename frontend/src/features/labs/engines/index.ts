/**
 * One evaluator per lab kind, mirroring the backend engines, so the page can give instant
 * feedback before the server confirms. Returns the same shape as the server's SessionResult.
 */
import { evaluate as evaluateCircuit, goalMet as circuitGoalMet, type Circuit } from "../circuit";
import { evaluateBuoyancy, type BuoyancyGoal, type BuoyancyState } from "./buoyancy";
import { evaluateMolecule, type Molecule, type MoleculeGoal } from "./molecules";
import { DEFAULT_STATE as ORBITS_DEFAULT, evaluateOrbits, TASKS as ORBITS_TASKS, type OrbitsState } from "./orbits";
import { DEFAULT_STATE as TECTONICS_DEFAULT, evaluateTectonics, TASKS as TECTONICS_TASKS, type TectonicsState } from "./tectonics";
import { DEFAULT_STATE as RESPIRATION_DEFAULT, evaluateRespiration, TASKS as RESPIRATION_TASKS, type RespirationState } from "./respiration";

export type LabKind = "circuit" | "molecules" | "buoyancy" | "respiration" | "orbits" | "tectonics";

export interface Evaluated {
  result: Record<string, unknown>;
  message: string;
  goal_met: boolean;
  achieved: string[]; // all sub-goals reached so far, this state included
}

export const KIND_LABEL: Record<string, string> = { circuit: "Electric circuit", molecules: "Molecular bonding", buoyancy: "Pressure and buoyancy", respiration: "Breathing and gas exchange", orbits: "Solar system and orbits", tectonics: "Plate tectonics and earthquakes" };
export const KIND_ICON: Record<string, "bolt" | "flask" | "activity" | "leaf" | "sun" | "layers"> = { circuit: "bolt", molecules: "flask", buoyancy: "activity", respiration: "leaf", orbits: "sun", tectonics: "layers" };

/** Task-list kinds: the goal is { tasks: [...] } and these are the task labels. */
const TASK_LABELS: Record<string, Record<string, string>> = { respiration: RESPIRATION_TASKS, orbits: ORBITS_TASKS, tectonics: TECTONICS_TASKS };

export function emptyState(kind: string): Record<string, unknown> {
  if (kind === "molecules") return { atoms: [], bonds: [] };
  if (kind === "respiration") return { ...RESPIRATION_DEFAULT, seen: [] };
  if (kind === "orbits") return { ...ORBITS_DEFAULT, seen_seasons: [] };
  if (kind === "tectonics") return { ...TECTONICS_DEFAULT, seen_boundaries: [], inspected: [], seen_waves: [] };
  if (kind === "buoyancy") return { material: "wood", object_density: 600, volume_l: 1, liquid: "fresh water", liquid_density: 1000, probe_depth_m: 0.5, tried_liquids: [] };
  return { parts: [], wires: [] };
}

/** A state shaped for this kind, with every expected field present (old or foreign states get defaults). */
export function normaliseState(kind: string, state: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const base = emptyState(kind);
  if (!state) return base;
  const out: Record<string, unknown> = { ...base };
  for (const k of Object.keys(base)) if (state[k] !== undefined && state[k] !== null) out[k] = state[k];
  return out;
}

export function evaluateState(kind: string, rawState: Record<string, unknown>, goal: Record<string, unknown>, achieved: string[]): Evaluated {
  const state = normaliseState(kind, rawState);
  if (kind === "molecules") {
    const g: MoleculeGoal = { targets: (goal.targets as string[] | undefined) ?? ["H2O", "CO2", "CH4"] };
    const r = evaluateMolecule(state as unknown as Molecule, g, achieved);
    return { result: r.result as unknown as Record<string, unknown>, message: r.message, goal_met: r.goal_met, achieved: r.result.achieved };
  }
  if (kind === "tectonics") {
    const r = evaluateTectonics(state as unknown as TectonicsState, { tasks: (goal.tasks as string[] | undefined) ?? Object.keys(TECTONICS_TASKS) }, achieved);
    return { result: r.result as unknown as Record<string, unknown>, message: r.message, goal_met: r.goal_met, achieved: r.result.achieved };
  }
  if (kind === "orbits") {
    const r = evaluateOrbits(state as unknown as OrbitsState, { tasks: (goal.tasks as string[] | undefined) ?? Object.keys(ORBITS_TASKS) }, achieved);
    return { result: r.result as unknown as Record<string, unknown>, message: r.message, goal_met: r.goal_met, achieved: r.result.achieved };
  }
  if (kind === "respiration") {
    const r = evaluateRespiration(state as unknown as RespirationState, { tasks: (goal.tasks as string[] | undefined) ?? Object.keys(RESPIRATION_TASKS) }, achieved);
    return { result: r.result as unknown as Record<string, unknown>, message: r.message, goal_met: r.goal_met, achieved: r.result.achieved };
  }
  if (kind === "buoyancy") {
    const g: BuoyancyGoal = { tasks: (goal.tasks as string[] | undefined) ?? ["float", "sink", "salt", "pressure"] };
    const r = evaluateBuoyancy(state as unknown as BuoyancyState, g, achieved);
    return { result: r.result as unknown as Record<string, unknown>, message: r.message, goal_met: r.goal_met, achieved: r.result.achieved };
  }
  const c = state as unknown as Circuit;
  const ev = evaluateCircuit(c);
  const g = { min_lit: (goal.min_lit as number | undefined) ?? 1, require_switch: (goal.require_switch as boolean | undefined) ?? false };
  const met = circuitGoalMet(g, c, ev);
  const done = met ? [...new Set([...achieved, "lit"])] : achieved;
  return { result: ev as unknown as Record<string, unknown>, message: ev.message, goal_met: met, achieved: done };
}

/** Human description of a lab's goal, by kind. */
export function goalText(kind: string, goal: Record<string, unknown>): string {
  if (kind === "molecules") {
    const t = (goal.targets as string[] | undefined) ?? [];
    return `Build ${t.join(", ")}`;
  }
  if (TASK_LABELS[kind]) {
    const t = (goal.tasks as string[] | undefined) ?? [];
    return t.length ? t.map((k) => TASK_LABELS[kind]![k] ?? k).join(" · ") : "Explore freely";
  }
  if (kind === "buoyancy") {
    const t = (goal.tasks as string[] | undefined) ?? [];
    return `${t.length} task${t.length === 1 ? "" : "s"}: float, sink, compare liquids, measure pressure`.replace(/: .*$/, t.length ? `: ${t.join(", ")}` : "");
  }
  const n = (goal.min_lit as number | undefined) ?? 1;
  const base = n === 1 ? "Light the bulb" : `Light ${n} bulbs at the same time`;
  return goal.require_switch ? `${base}, using a closed switch in the loop` : base;
}

export function goalTotal(kind: string, goal: Record<string, unknown>): number {
  if (kind === "molecules") return ((goal.targets as string[] | undefined) ?? []).length;
  if (kind === "buoyancy" || TASK_LABELS[kind]) return ((goal.tasks as string[] | undefined) ?? []).length;
  return 1;
}
