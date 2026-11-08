/**
 * Chemistry engine, a port of backend/app/modules/labs/engines/molecules.py. Keep in sync.
 */
export const VALENCE: Record<string, number> = { H: 1, O: 2, N: 3, C: 4, Cl: 1, S: 2 };
export const NAMES: Record<string, string> = {
  H2O: "water", CO2: "carbon dioxide", CH4: "methane", NH3: "ammonia", O2: "oxygen gas", N2: "nitrogen gas",
  H2: "hydrogen gas", Cl2: "chlorine gas", HCl: "hydrogen chloride", C2H6: "ethane", C2H4: "ethene", C2H2: "ethyne",
  CH3OH: "methanol", H2O2: "hydrogen peroxide", H2S: "hydrogen sulfide", CO: "carbon monoxide", SO2: "sulfur dioxide",
  NH2OH: "hydroxylamine",
};
const SHAPES: Record<string, string> = { "2,0": "linear", "2,1": "bent", "2,2": "bent", "3,0": "trigonal planar", "3,1": "trigonal pyramidal", "4,0": "tetrahedral" };
const VALENCE_ELECTRONS: Record<string, number> = { H: 1, C: 4, N: 5, O: 6, Cl: 7, S: 6 };

export interface Atom { id: string; element: string; x: number; y: number }
export interface Bond { id: string; a: string; b: string; order: number }
export interface Molecule { atoms: Atom[]; bonds: Bond[] }
export interface MoleculeResult {
  formula: string;
  name: string | null;
  complete: boolean;
  connected: boolean;
  over_bonded: string[];
  missing: Record<string, number>;
  shape: string | null;
  bond_orders: Record<string, number>;
  achieved: string[];
  targets: string[];
}
export interface MoleculeGoal { targets: string[] }

export function formula(atoms: Atom[]): string {
  const counts: Record<string, number> = {};
  for (const a of atoms) counts[a.element] = (counts[a.element] ?? 0) + 1;
  const order = "C" in counts ? ["C", "H", ...Object.keys(counts).filter((e) => e !== "C" && e !== "H").sort()] : Object.keys(counts).sort();
  return order.filter((e) => e in counts).map((e) => `${e}${counts[e]! > 1 ? counts[e] : ""}`).join("");
}

function components(m: Molecule): number {
  const parent = new Map(m.atoms.map((a) => [a.id, a.id]));
  const find = (x: string): string => {
    while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x)!)!); x = parent.get(x)!; }
    return x;
  };
  for (const b of m.bonds) { const ra = find(b.a); const rb = find(b.b); if (ra !== rb) parent.set(ra, rb); }
  return new Set(m.atoms.map((a) => find(a.id))).size;
}

export function analyse(m: Molecule): Omit<MoleculeResult, "achieved" | "targets"> {
  const used: Record<string, number> = {};
  for (const b of m.bonds) { used[b.a] = (used[b.a] ?? 0) + b.order; used[b.b] = (used[b.b] ?? 0) + b.order; }
  const over = m.atoms.filter((a) => (used[a.id] ?? 0) > VALENCE[a.element]!).map((a) => a.id);
  const missing: Record<string, number> = {};
  for (const a of m.atoms) { const left = VALENCE[a.element]! - (used[a.id] ?? 0); if (left > 0) missing[a.id] = left; }
  const comps = components(m);
  const complete = m.atoms.length > 0 && over.length === 0 && Object.keys(missing).length === 0 && comps === 1;
  const f = m.atoms.length ? formula(m.atoms) : "";
  const name = complete ? NAMES[f] ?? null : null;
  let shape: string | null = null;
  if (complete && m.atoms.length >= 3) {
    const neighbours: Record<string, number> = {};
    for (const b of m.bonds) { neighbours[b.a] = (neighbours[b.a] ?? 0) + 1; neighbours[b.b] = (neighbours[b.b] ?? 0) + 1; }
    const [centralId, n] = Object.entries(neighbours).sort((x, y) => y[1] - x[1])[0]!;
    const central = m.atoms.find((a) => a.id === centralId)!;
    const lonePairs = Math.max(0, Math.floor((VALENCE_ELECTRONS[central.element]! - (used[centralId] ?? 0)) / 2));
    shape = SHAPES[`${n},${lonePairs}`] ?? null;
  }
  return { formula: f, name, complete, connected: comps <= 1, over_bonded: over, missing, shape, bond_orders: Object.fromEntries(m.bonds.map((b) => [b.id, b.order])) };
}

export function evaluateMolecule(m: Molecule, goal: MoleculeGoal, achieved: string[]): { result: MoleculeResult; message: string; goal_met: boolean; achieved: string[] } {
  const info = analyse(m);
  const now = info.complete && goal.targets.includes(info.formula) ? [info.formula] : [];
  const done = [...new Set([...achieved, ...now])].sort();
  const met = goal.targets.every((t) => done.includes(t));
  let message: string;
  if (!m.atoms.length) message = "Add atoms from the palette, then bond them by clicking one atom and then another.";
  else if (info.over_bonded.length) message = "An atom has too many bonds. Click a bond to lower its order, or remove one.";
  else if (!info.connected) message = "All atoms must be joined into one molecule. Bond the loose atoms.";
  else if (Object.keys(info.missing).length) {
    const need = Object.values(info.missing).reduce((a, b) => a + b, 0);
    message = `Not finished: ${need} more bond${need !== 1 ? "s" : ""} needed. Some atoms still want bonds.`;
  } else if (info.name) {
    message = `You built ${info.formula} (${info.name})${info.shape ? `, shape: ${info.shape}.` : "."}`;
    if (goal.targets.includes(info.formula)) message += met ? " Every target built!" : " Target reached.";
  } else message = `${info.formula} is a valid molecule, but not one of the targets.`;
  return { result: { ...info, achieved: done, targets: goal.targets }, message, goal_met: met, achieved: now };
}
