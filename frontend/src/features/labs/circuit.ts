/**
 * DC circuit evaluation, a line-for-line port of backend/app/modules/labs/circuit.py so the
 * student gets instant feedback while the server stores the authoritative result. Keep in sync.
 *
 * Every part has terminals "<id>:a" and "<id>:b". Wires and closed switches join terminals into
 * nodes. A bulb is a 1 Ω resistor, a battery an ideal 1 V source (a = +). Modified nodal
 * analysis gives node voltages; a bulb with current is lit, brightness relative to one bulb on
 * one battery.
 */
export type PartType = "battery" | "bulb" | "switch";
export interface Part { id: string; type: PartType; x: number; y: number; closed: boolean }
export interface Wire { id: string; a: string; b: string }
export interface Circuit { parts: Part[]; wires: Wire[] }
export interface Evaluation {
  has_battery: boolean;
  short_circuit: boolean;
  lit: string[];
  brightness: Record<string, number>;
  closed_loop: boolean;
  message: string;
}

const BULB_OHMS = 1;
const BATTERY_VOLTS = 1;
const LIT_THRESHOLD = 1e-6;
const G_MIN = 1e-9; // leak to ground on every node: unconnected parts must not make the system singular

class UnionFind {
  private parent = new Map<string, string>();
  find(x: string): string {
    if (!this.parent.has(x)) this.parent.set(x, x);
    let cur = x;
    while (this.parent.get(cur) !== cur) {
      const p = this.parent.get(cur)!;
      this.parent.set(cur, this.parent.get(p)!);
      cur = this.parent.get(cur)!;
    }
    return cur;
  }
  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

function solve(matrix: number[][], rhs: number[]): number[] | null {
  const n = rhs.length;
  const a = matrix.map((row, i) => [...row, rhs[i]!]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(a[r]![col]!) > Math.abs(a[pivot]![col]!)) pivot = r;
    if (Math.abs(a[pivot]![col]!) < 1e-12) return null;
    [a[col], a[pivot]] = [a[pivot]!, a[col]!];
    for (let r = 0; r < n; r++) {
      if (r !== col && a[r]![col] !== 0) {
        const f = a[r]![col]! / a[col]![col]!;
        for (let c = col; c <= n; c++) a[r]![c] = a[r]![c]! - f * a[col]![c]!;
      }
    }
  }
  return a.map((row, i) => row[n]! / row[i]!);
}

export function evaluate(circuit: Circuit): Evaluation {
  const uf = new UnionFind();
  for (const p of circuit.parts) {
    uf.find(`${p.id}:a`);
    uf.find(`${p.id}:b`);
    if (p.type === "switch" && p.closed) uf.union(`${p.id}:a`, `${p.id}:b`);
  }
  for (const w of circuit.wires) uf.union(w.a, w.b);

  const batteries = circuit.parts.filter((p) => p.type === "battery");
  const bulbs = circuit.parts.filter((p) => p.type === "bulb");
  const off: Record<string, number> = Object.fromEntries(bulbs.map((b) => [b.id, 0]));
  if (!batteries.length) {
    return { has_battery: false, short_circuit: false, lit: [], brightness: off, closed_loop: false, message: "Add a battery to power the circuit." };
  }
  const node = (t: string) => uf.find(t);
  if (batteries.some((b) => node(`${b.id}:a`) === node(`${b.id}:b`))) {
    return { has_battery: true, short_circuit: true, lit: [], brightness: off, closed_loop: false, message: "Short circuit! A wire joins the battery's + straight to its −, so the current takes that shortcut and never reaches the bulb. Remove that wire so the only way round is through the bulb." };
  }

  const ground = node(`${batteries[0]!.id}:b`);
  const nodeSet = new Set<string>();
  for (const p of circuit.parts) { nodeSet.add(node(`${p.id}:a`)); nodeSet.add(node(`${p.id}:b`)); }
  nodeSet.delete(ground);
  const nodes = [...nodeSet].sort();
  const index = new Map(nodes.map((n, i) => [n, i]));
  const nNodes = nodes.length;
  const size = nNodes + batteries.length;
  const m: number[][] = Array.from({ length: size }, () => Array<number>(size).fill(0));
  const rhs = Array<number>(size).fill(0);
  const g = 1 / BULB_OHMS;
  for (let i = 0; i < nNodes; i++) m[i]![i] = m[i]![i]! + G_MIN;
  for (const b of bulbs) {
    const na = node(`${b.id}:a`);
    const nb = node(`${b.id}:b`);
    if (na === nb) continue;
    for (const [x, y] of [[na, nb], [nb, na]] as const) {
      const ix = index.get(x);
      if (ix === undefined) continue;
      m[ix]![ix] = m[ix]![ix]! + g;
      const iy = index.get(y);
      if (iy !== undefined) m[ix]![iy] = m[ix]![iy]! - g;
    }
  }
  batteries.forEach((bat, k) => {
    const row = nNodes + k;
    const pos = index.get(node(`${bat.id}:a`));
    const neg = index.get(node(`${bat.id}:b`));
    if (pos !== undefined) { m[pos]![row] = m[pos]![row]! + 1; m[row]![pos] = m[row]![pos]! + 1; }
    if (neg !== undefined) { m[neg]![row] = m[neg]![row]! - 1; m[row]![neg] = m[row]![neg]! - 1; }
    rhs[row] = BATTERY_VOLTS;
  });
  const solution = size ? solve(m, rhs) : [];
  if (solution === null) {
    return { has_battery: true, short_circuit: true, lit: [], brightness: off, closed_loop: false, message: "The batteries are connected against each other, so they cancel out. Turn one around so both + ends point the same way." };
  }
  const volts = new Map<string, number>([[ground, 0]]);
  for (const [n, i] of index) volts.set(n, solution[i]!);
  const brightness: Record<string, number> = {};
  for (const b of bulbs) {
    const va = volts.get(node(`${b.id}:a`)) ?? 0;
    const vb = volts.get(node(`${b.id}:b`)) ?? 0;
    const current = Math.abs(va - vb) / BULB_OHMS;
    brightness[b.id] = Math.round(Math.min(1, current / (BATTERY_VOLTS / BULB_OHMS)) * 1000) / 1000;
  }
  const lit = bulbs.filter((b) => brightness[b.id]! > LIT_THRESHOLD).map((b) => b.id);
  if (!lit.length) {
    const openSwitch = circuit.parts.some((p) => p.type === "switch" && !p.closed);
    const message = openSwitch && bulbs.length
      ? "The switch is open: close it to complete the loop."
      : bulbs.length
        ? "No complete loop: current must go from + through a bulb back to −."
        : "Add a bulb and connect it in the loop.";
    return { has_battery: true, short_circuit: false, lit: [], brightness, closed_loop: false, message };
  }
  const dim = lit.some((id) => brightness[id]! < 0.9);
  let message = `${lit.length} bulb${lit.length === 1 ? "" : "s"} lit.`;
  if (dim) message += " Some are dim: bulbs in series share the battery's voltage.";
  return { has_battery: true, short_circuit: false, lit, brightness, closed_loop: true, message };
}

/** Does the circuit satisfy the lab's goal? Mirrors service.goal_met. */
export function goalMet(goal: { min_lit: number; require_switch: boolean }, circuit: Circuit, ev: Evaluation): boolean {
  if (ev.lit.length < goal.min_lit) return false;
  if (goal.require_switch && !circuit.parts.some((p) => p.type === "switch" && p.closed)) return false;
  return true;
}
