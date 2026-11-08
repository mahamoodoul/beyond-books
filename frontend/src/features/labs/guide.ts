/**
 * Step-by-step guides, derived from the lab state itself: the first unmet step is the current
 * one, with a hint. One builder per lab kind; `buildStepsFor` dispatches.
 */
import type { Circuit, Evaluation } from "./circuit";
import type { BuoyancyResult, BuoyancyState } from "./engines/buoyancy";
import type { OrbitsResult } from "./engines/orbits";
import type { RespirationResult } from "./engines/respiration";
import type { TectonicsResult } from "./engines/tectonics";
import { NAMES, type Molecule, type MoleculeResult } from "./engines/molecules";

export interface Step {
  key: string;
  title: string;
  /** What to do right now. Lines separated by "\n" render as a numbered list. */
  hint: string;
  detail: string;
  state: "done" | "current" | "todo";
  /** One plain sentence describing what is being built (molecules). */
  goal?: string;
  /** The whole plan for this step, ticked off as the board changes (molecules). */
  plan?: PlanItem[];
}

export interface PlanItem { label: string; done: boolean }

interface Goal { min_lit: number; require_switch: boolean }

function finish(steps: Omit<Step, "state">[], done: boolean[]): Step[] {
  const result: Step[] = steps.map((s, i) => ({ ...s, state: done[i] ? "done" : "todo" }));
  const current = done.findIndex((d) => !d);
  if (current >= 0) result[current]!.state = "current";
  return result;
}

/* ---------------------------------------------------------------- circuit */
function nodes(circuit: Circuit, switchesClosed = false): Map<string, string> {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    if (!parent.has(x)) parent.set(x, x);
    let cur = x;
    while (parent.get(cur) !== cur) cur = parent.get(cur)!;
    return cur;
  };
  const union = (a: string, b: string) => { const ra = find(a); const rb = find(b); if (ra !== rb) parent.set(ra, rb); };
  for (const p of circuit.parts) {
    find(`${p.id}:a`); find(`${p.id}:b`);
    if (p.type === "switch" && (p.closed || switchesClosed)) union(`${p.id}:a`, `${p.id}:b`);
  }
  for (const w of circuit.wires) union(w.a, w.b);
  const out = new Map<string, string>();
  for (const p of circuit.parts) for (const t of ["a", "b"]) out.set(`${p.id}:${t}`, find(`${p.id}:${t}`));
  return out;
}

export function buildSteps(goal: Goal, circuit: Circuit, ev: Evaluation): Step[] {
  const batteries = circuit.parts.filter((p) => p.type === "battery");
  const bulbs = circuit.parts.filter((p) => p.type === "bulb");
  const switches = circuit.parts.filter((p) => p.type === "switch");
  // Topology checks treat every switch as closed, so an open switch does not undo earlier steps.
  const node = nodes(circuit, true);
  const bat = batteries[0];
  const plus = bat ? node.get(`${bat.id}:a`) : undefined;
  const minus = bat ? node.get(`${bat.id}:b`) : undefined;
  const touchesPlus = bulbs.some((b) => node.get(`${b.id}:a`) === plus || node.get(`${b.id}:b`) === plus);
  const touchesMinus = bulbs.some((b) => node.get(`${b.id}:a`) === minus || node.get(`${b.id}:b`) === minus);
  const switchInLoop = switches.some((s) => circuit.wires.filter((w) => w.a.startsWith(`${s.id}:`) || w.b.startsWith(`${s.id}:`)).length >= 2);
  const closedSwitchInLoop = switches.some((s) => s.closed) && switchInLoop;

  const steps: Omit<Step, "state">[] = [];
  const done: boolean[] = [];
  steps.push({ key: "battery", title: "Add a battery", hint: "Click “+ Battery” above the board. The red + is the positive terminal, − the negative.", detail: "A battery pushes current out of its + terminal, through whatever you connect, and back into −." });
  done.push(batteries.length > 0);
  steps.push({ key: "bulb", title: "Add a bulb", hint: "Click “+ Bulb”. Drag it next to the battery so the wires are short.", detail: "A bulb only lights when current flows through it, so it needs a path in and a path out." });
  done.push(bulbs.length > 0);
  steps.push({ key: "plus", title: "Wire the battery’s + to the bulb", hint: "Click the battery’s + terminal (left circle), then click one terminal of the bulb. A wire appears.", detail: "Terminals are the small circles at each end of a part. One click starts a wire, the next click finishes it." });
  done.push(touchesPlus);
  steps.push({ key: "minus", title: "Wire the bulb back to the battery’s −", hint: "Click the bulb’s other terminal, then the battery’s − terminal. The loop is closed and the bulb should glow.", detail: "Current needs a complete loop: + → bulb → −. One missing wire and nothing happens." });
  done.push(bulbs.length > 0 && touchesPlus && touchesMinus && !ev.short_circuit);
  if (goal.require_switch) {
    steps.push({
      key: "switch",
      title: "Put the switch into the loop",
      hint: "Click “+ Switch” to add one.\nClick the wire between the battery’s + and the bulb to remove it. That makes a gap for the switch.\nClick the battery’s + terminal, then the switch’s left terminal. That is one new wire.\nClick the switch’s right terminal, then the bulb’s free terminal. That is the second wire.\nThe current now has to go through the switch to reach the bulb.",
      detail: "Think of the switch as a gate on the road the current travels. It only works if it sits on that road. A switch wired next to the loop, with the old wire still in place, is a gate in a field: the current drives past it.",
    });
    done.push(switchInLoop);
    steps.push({
      key: "close",
      title: "Close the switch to light the bulb",
      hint: "Click the switch itself (the small lever in the middle, not its terminals).\nOpen means there is a gap, so no current flows and the bulb is dark.\nClosed means the gap is bridged, so the current flows and the bulb lights.",
      detail: "Flip it a few times and watch the bulb. That is exactly what a light switch on the wall does.",
    });
    done.push(closedSwitchInLoop && ev.lit.length > 0);
  }
  if (goal.min_lit > 1) {
    steps.push({
      key: "more",
      title: `Light ${goal.min_lit} bulbs at once`,
      hint: "Click “+ Bulb” to add another bulb.\nWire its left terminal to the battery’s + (click + first, then the bulb’s terminal).\nWire its right terminal to the battery’s −.\nEach bulb now has its own loop, side by side with the other. Both shine at full brightness.",
      detail: "Bulbs side by side (in parallel) each get the whole battery and stay bright. Bulbs in a row (in series) have to share it and go dim.",
    });
    done.push(ev.lit.length >= goal.min_lit);
  }
  const result = finish(steps, done);
  if (ev.short_circuit) {
    const fix: Step = {
      key: "short",
      title: "Fix the short circuit",
      hint: "One wire goes from the battery's + to its − without passing through a bulb. Find that wire and click it to remove it. Then the only path for the current is through the bulb.",
      detail: "Current always takes the easiest path. An empty wire is easier than a bulb, so the bulb gets nothing. In a real circuit the battery would get hot and go flat fast.",
      state: "current",
    };
    for (const s of result) if (s.state === "current") s.state = "todo";
    const at = result.findIndex((s) => s.state === "todo");
    result.splice(at === -1 ? result.length : at, 0, fix);
  }
  return result;
}

/* -------------------------------------------------------------- molecules */
export const ELEMENT_NAMES: Record<string, string> = { H: "hydrogen", O: "oxygen", C: "carbon", N: "nitrogen", Cl: "chlorine", S: "sulfur" };
const ELEMENT_COLOURS: Record<string, string> = { H: "white", O: "red", C: "dark grey", N: "blue", Cl: "green", S: "yellow" };

/** A bond the recipe wants: `count` bonds between an `a` atom and a `b` atom of this `order`. */
interface BondSpec { a: string; b: string; order: number; count: number }
interface Recipe { atoms: Record<string, number>; bonds: BondSpec[]; plain: string }

const RECIPES: Record<string, Recipe> = {
  H2O: { atoms: { O: 1, H: 2 }, bonds: [{ a: "O", b: "H", order: 1, count: 2 }], plain: "Water is 1 oxygen in the middle holding 2 hydrogens, one on each side." },
  CO2: { atoms: { C: 1, O: 2 }, bonds: [{ a: "C", b: "O", order: 2, count: 2 }], plain: "Carbon dioxide is 1 carbon in the middle with an oxygen on each side. Each oxygen is held with a double bond (two lines)." },
  CH4: { atoms: { C: 1, H: 4 }, bonds: [{ a: "C", b: "H", order: 1, count: 4 }], plain: "Methane is 1 carbon in the middle holding 4 hydrogens, one on every side." },
  NH3: { atoms: { N: 1, H: 3 }, bonds: [{ a: "N", b: "H", order: 1, count: 3 }], plain: "Ammonia is 1 nitrogen holding 3 hydrogens." },
  O2: { atoms: { O: 2 }, bonds: [{ a: "O", b: "O", order: 2, count: 1 }], plain: "Oxygen gas is 2 oxygens joined by a double bond (two lines)." },
  N2: { atoms: { N: 2 }, bonds: [{ a: "N", b: "N", order: 3, count: 1 }], plain: "Nitrogen gas is 2 nitrogens joined by a triple bond (three lines)." },
  H2: { atoms: { H: 2 }, bonds: [{ a: "H", b: "H", order: 1, count: 1 }], plain: "Hydrogen gas is 2 hydrogens joined by one bond." },
  Cl2: { atoms: { Cl: 2 }, bonds: [{ a: "Cl", b: "Cl", order: 1, count: 1 }], plain: "Chlorine gas is 2 chlorines joined by one bond." },
  HCl: { atoms: { H: 1, Cl: 1 }, bonds: [{ a: "Cl", b: "H", order: 1, count: 1 }], plain: "Hydrogen chloride is 1 hydrogen and 1 chlorine joined by one bond." },
  C2H6: { atoms: { C: 2, H: 6 }, bonds: [{ a: "C", b: "C", order: 1, count: 1 }, { a: "C", b: "H", order: 1, count: 6 }], plain: "Ethane is 2 carbons joined together, each holding 3 hydrogens." },
  C2H4: { atoms: { C: 2, H: 4 }, bonds: [{ a: "C", b: "C", order: 2, count: 1 }, { a: "C", b: "H", order: 1, count: 4 }], plain: "Ethene is 2 carbons joined by a double bond, each holding 2 hydrogens." },
  C2H2: { atoms: { C: 2, H: 2 }, bonds: [{ a: "C", b: "C", order: 3, count: 1 }, { a: "C", b: "H", order: 1, count: 2 }], plain: "Ethyne is 2 carbons joined by a triple bond, each holding 1 hydrogen." },
  CH3OH: { atoms: { C: 1, O: 1, H: 4 }, bonds: [{ a: "C", b: "O", order: 1, count: 1 }, { a: "C", b: "H", order: 1, count: 3 }, { a: "O", b: "H", order: 1, count: 1 }], plain: "Methanol is a carbon holding 3 hydrogens and an oxygen; the oxygen holds the last hydrogen." },
  H2O2: { atoms: { O: 2, H: 2 }, bonds: [{ a: "O", b: "O", order: 1, count: 1 }, { a: "O", b: "H", order: 1, count: 2 }], plain: "Hydrogen peroxide is 2 oxygens joined together, each holding 1 hydrogen." },
  H2S: { atoms: { S: 1, H: 2 }, bonds: [{ a: "S", b: "H", order: 1, count: 2 }], plain: "Hydrogen sulfide is 1 sulfur holding 2 hydrogens, like water with sulfur in the middle." },
  CO: { atoms: { C: 1, O: 1 }, bonds: [{ a: "C", b: "O", order: 3, count: 1 }], plain: "Carbon monoxide is 1 carbon and 1 oxygen joined by a triple bond (three lines)." },
  SO2: { atoms: { S: 1, O: 2 }, bonds: [{ a: "S", b: "O", order: 2, count: 2 }], plain: "Sulfur dioxide is 1 sulfur in the middle with an oxygen on each side, both double bonds." },
  NH2OH: { atoms: { N: 1, O: 1, H: 3 }, bonds: [{ a: "N", b: "O", order: 1, count: 1 }, { a: "N", b: "H", order: 1, count: 2 }, { a: "O", b: "H", order: 1, count: 1 }], plain: "Hydroxylamine is a nitrogen holding 2 hydrogens and an oxygen; the oxygen holds the last hydrogen." },
};

const ORDER_WORD = ["", "single", "double", "triple"];
const lines = (n: number) => (n === 1 ? "one line" : n === 2 ? "two lines" : "three lines");
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const named = (el: string) => `${el} (${ELEMENT_NAMES[el] ?? el})`;
const button = (el: string) => `the ${ELEMENT_COLOURS[el] ?? ""} ${el} button above the board`.replace("the  ", "the ");
const pairKey = (x: string, y: string) => [x, y].sort().join("-");

/** Beginner, click-by-click plan for a recipe, used before the first atom is placed. */
function recipeLines(target: string): string[] {
  const r = RECIPES[target];
  if (!r) return [`Build ${target}.`];
  const out: string[] = [];
  for (const [el, n] of Object.entries(r.atoms)) out.push(`Click ${button(el)} ${n === 1 ? "once" : n === 2 ? "twice" : `${n} times`}. ${plural(n, `${ELEMENT_NAMES[el] ?? el} ball`)} appear${n === 1 ? "s" : ""} on the board.`);
  for (const b of r.bonds) {
    if (b.a === b.b) out.push(`Click one ${b.a} ball, then click the other ${b.a} ball. A line appears between them: that is a bond.`);
    else out.push(`Click the ${b.a} ball, then click ${b.count === 1 ? `the ${b.b} ball` : `one ${b.b} ball`}. A line appears between them: that is a bond.${b.count > 1 ? ` Do the same for ${b.count === 2 ? "the other" : "each other"} ${b.b}.` : ""}`);
    if (b.order > 1) out.push(`Click ${b.count === 1 ? "that line" : "each of those lines"} ${b.order === 2 ? "once more" : "twice more"} so it shows ${lines(b.order)}. That is a ${ORDER_WORD[b.order]} bond.`);
  }
  out.push("When no yellow numbers are left, the molecule glows green. Done!");
  return out;
}

const BOND_WORD = "A molecule is finished when every atom has exactly the bonds it wants, like hands to hold: H has 1 hand, O has 2, N has 3, C has 4. The small yellow number on an atom shows how many hands are still free.";

export function buildMoleculeSteps(goal: { targets: string[] }, m: Molecule, r: MoleculeResult): Step[] {
  const steps: Omit<Step, "state">[] = [];
  const done: boolean[] = [];
  const achieved = new Set(r.achieved);
  const next = goal.targets.find((t) => !achieved.has(t));
  for (const t of goal.targets) {
    const name = NAMES[t];
    steps.push({ key: `t-${t}`, title: name ? `Build ${name} (${t})` : `Build ${t}`, hint: recipeLines(t).join("\n"), detail: BOND_WORD, goal: RECIPES[t]?.plain });
    done.push(achieved.has(t));
  }
  const result = finish(steps, done);
  const cur = result.find((s) => s.state === "current");
  if (!next || !cur) return result;
  const recipe = RECIPES[next];
  if (!recipe) return result;

  /* ---- where is the student inside this molecule? */
  const counts: Record<string, number> = {};
  for (const a of m.atoms) counts[a.element] = (counts[a.element] ?? 0) + 1;
  const extra = Object.entries(counts).filter(([el, n]) => n > (recipe.atoms[el] ?? 0));
  const short = Object.entries(recipe.atoms).filter(([el, n]) => (counts[el] ?? 0) < n);
  const atomsOk = extra.length === 0 && short.length === 0;

  const byId = new Map(m.atoms.map((a) => [a.id, a]));
  const boardBonds = m.bonds.flatMap((b) => {
    const A = byId.get(b.a); const B = byId.get(b.b);
    return A && B ? [{ key: pairKey(A.element, B.element), order: b.order, els: [A.element, B.element] }] : [];
  });
  const specFor = (key: string) => recipe.bonds.find((b) => pairKey(b.a, b.b) === key);
  const stray = boardBonds.find((b) => !specFor(b.key));
  const tooMany = boardBonds.find((b) => { const s = specFor(b.key); return s && b.order > s.order; });
  const joined = (spec: BondSpec) => boardBonds.filter((b) => b.key === pairKey(spec.a, spec.b));
  const joinedOk = recipe.bonds.every((spec) => joined(spec).length === spec.count);
  const ordersOk = recipe.bonds.every((spec) => joined(spec).every((b) => b.order === spec.order));
  const multi = recipe.bonds.filter((b) => b.order > 1);
  const built = r.complete && r.formula === next;

  cur.plan = [
    { label: `Put the atoms on the board: ${Object.entries(recipe.atoms).map(([el, n]) => plural(n, named(el))).join(" and ")}`, done: atomsOk || built },
    ...recipe.bonds.map((b) => ({
      label: b.a === b.b ? `Join the two ${b.a} atoms` : `Join the ${b.a} to ${b.count === 1 ? `the ${b.b}` : `${b.count === 2 ? "both" : `all ${b.count}`} ${b.b} atoms`}`,
      done: built || (joined(b).length === b.count && !stray && !tooMany),
    })),
    ...(multi.length ? [{ label: `Make the ${multi.map((b) => `${b.a}–${b.b}`).join(" and ")} bond${multi.reduce((n, b) => n + b.count, 0) === 1 ? "" : "s"} ${ORDER_WORD[multi[0]!.order]} (${lines(multi[0]!.order)})`, done: built || (joinedOk && ordersOk) }] : []),
    { label: "No yellow numbers left: the molecule glows", done: built },
  ];

  /* ---- the single thing to do right now */
  if (m.atoms.length === 0) return result; // the full recipe is already the hint
  const otherComplete = r.complete && r.formula !== next;
  if (otherComplete) cur.hint = `You built ${r.formula}${r.name ? ` (${r.name})` : ""}, which is not ${NAMES[next] ?? next}. Click “Clear board” above the bench to start again with an empty board.\n${recipeLines(next).join("\n")}`;
  else if (extra.length) {
    const [el, n] = extra[0]!;
    const over = n - (recipe.atoms[el] ?? 0);
    cur.hint = recipe.atoms[el]
      ? `There ${over === 1 ? "is" : "are"} ${plural(over, `${ELEMENT_NAMES[el] ?? el} ball`)} too many. Double-click ${over === 1 ? "one of the" : over + " of the"} ${el} balls to remove ${over === 1 ? "it" : "them"}.`
      : `${NAMES[next] ?? next} has no ${ELEMENT_NAMES[el] ?? el} in it. Double-click ${n === 1 ? "the" : "each"} ${el} ball to remove it, or click “Clear board” to start over.`;
  } else if (short.length) {
    const [el, n] = short[0]!;
    const need = n - (counts[el] ?? 0);
    cur.hint = `Add ${plural(need, `more ${ELEMENT_NAMES[el] ?? el} ball`)}: click ${button(el)} ${need === 1 ? "once" : need === 2 ? "twice" : `${need} times`}.`;
  } else if (stray) {
    const [x, y] = stray.els as [string, string];
    cur.hint = `${x} and ${y} should not be joined to each other in ${NAMES[next] ?? next}. The quick fix: double-click the ${x === y ? x : y} ball on that line to remove it, then click ${button(x === y ? x : y)} to add a fresh one.`;
  } else if (tooMany) {
    const [x, y] = tooMany.els as [string, string];
    const spec = specFor(tooMany.key)!;
    cur.hint = `The line between ${x} and ${y} has too many lines. Click it until it disappears (a triple bond turns into no bond), then click the ${x} ball and the ${y} ball again to make a ${ORDER_WORD[spec.order]} bond.`;
  } else if (!joinedOk) {
    const spec = recipe.bonds.find((b) => joined(b).length < b.count)!;
    cur.hint = spec.a === spec.b
      ? `Click one ${spec.a} ball, then click the other ${spec.a} ball. A line appears between them.`
      : `Click the ${spec.a} ball, then click a ${spec.b} ball that still shows a yellow number. A line appears between them.${joined(spec).length ? ` ${spec.count - joined(spec).length} more to go.` : ""}`;
  } else if (!ordersOk) {
    const spec = recipe.bonds.find((b) => joined(b).some((x) => x.order < b.order))!;
    const bond = joined(spec).find((x) => x.order < spec.order)!;
    const clicks = spec.order - bond.order;
    cur.hint = `Click the line between ${spec.a} and ${spec.b} ${clicks === 1 ? "once more" : "twice more"} so it shows ${lines(spec.order)}. That makes it a ${ORDER_WORD[spec.order]} bond.`;
  } else if (r.over_bonded.length) cur.hint = "An atom has a red outline: it has too many bonds. Click one of its lines until it disappears, then join the atoms again.";
  else if (!r.connected) cur.hint = "Some atoms are not joined to the rest. Click a loose ball, then click a ball that still shows a yellow number.";
  else if (Object.keys(r.missing).length) {
    const need = Object.values(r.missing).reduce((a, b) => a + b, 0);
    cur.hint = `${plural(need, "more bond")} to go. Click a ball with a yellow number, then click another ball with a yellow number.`;
  } else cur.hint = "Looks right. If it does not glow, click a bond to check it has the right number of lines.";
  return result;
}

/* --------------------------------------------------------------- buoyancy */
const TASK_STEPS: Record<string, Omit<Step, "state">> = {
  float: { key: "float", title: "Make an object float", hint: "Pick wood or ice as the object and fresh water as the liquid. Watch where it settles.", detail: "An object floats when its density is lower than the liquid's. It sinks only far enough for the buoyant force to equal its weight." },
  sink: { key: "sink", title: "Make an object sink", hint: "Pick steel or glass. It goes to the bottom.", detail: "Denser than the liquid: even fully under water, the buoyant force is smaller than the weight, so it keeps going down." },
  half: { key: "half", title: "Float an object about half submerged", hint: "Try a custom density close to half of the liquid's, for example 500 kg/m³ in fresh water.", detail: "The submerged fraction equals object density ÷ liquid density. Half the density, half under water." },
  salt: { key: "salt", title: "Compare fresh and salt water", hint: "Keep the same object and switch the liquid from fresh water to salt water. Look at the submerged percentage.", detail: "Salt water is denser, so it pushes up harder: the same object floats a little higher. That is why swimming is easier in the sea." },
  pressure: { key: "pressure", title: "Read a pressure of at least 10 kPa", hint: "Drag the yellow probe down the depth scale until the readout shows 10 kPa or more.", detail: "Pressure grows with depth: liquid density × g × depth. In fresh water that is about 9.8 kPa for every metre." },
};

export function buildBuoyancySteps(goal: { tasks: string[] }, _s: BuoyancyState, r: BuoyancyResult): Step[] {
  const achieved = new Set(r.achieved);
  const steps = goal.tasks.map((t) => TASK_STEPS[t] ?? { key: t, title: t, hint: "", detail: "" });
  return finish(steps, goal.tasks.map((t) => achieved.has(t)));
}

/* ------------------------------------------------------------ respiration */
const BREATH_STEPS: Record<string, Omit<Step, "state">> = {
  inhale: { key: "inhale", title: "Breathe in", hint: "In the Lungs view, press \"Breathe in\". Watch the orange diaphragm and the ribs.", detail: "The diaphragm is a dome-shaped muscle under the lungs. When it contracts it flattens and moves down, and the ribs lift. The chest gets bigger, the air pressure inside drops, and air flows in." },
  exhale: { key: "exhale", title: "Breathe out and compare", hint: "Press \"Breathe out\". Compare: what does the diaphragm do now, and the lungs?", detail: "Breathing out at rest is passive: the diaphragm relaxes back into a dome, the ribs drop, the chest gets smaller and pushes the air out." },
  rate: { key: "rate", title: "Breathe faster", hint: "Drag the Rate slider to 25 breaths a minute or more, then press \"▶ Auto\" to watch.", detail: "Air per minute = breaths per minute × air per breath. More breaths bring more fresh air, and more oxygen, to the lungs." },
  exercise: { key: "exercise", title: "Go for a run", hint: "Pick Run. Blood oxygen drops: breathing at rest is not enough.\nRaise the Rate.\nRaise the Depth (bigger breaths) until blood oxygen is back at 95 % or more.", detail: "Running muscles need about ten times more oxygen than at rest. You breathe faster and deeper. Deeper breaths help most, because the first 0.15 L of every breath only fills the airways and never reaches an alveolus." },
  trace: { key: "trace", title: "Follow oxygen into the blood", hint: "Switch the view to \"Zoom: alveolus\".\nPress \"Trace an oxygen molecule\".\nFollow the yellow molecule from the air sac into a red blood cell.", detail: "The lungs hold about 300 million alveoli. Their walls and the capillary walls are each one cell thick, so oxygen diffuses across into the blood, and CO₂ diffuses the other way to be breathed out." },
};

export function buildRespirationSteps(goal: { tasks: string[] }, r: RespirationResult): Step[] {
  const achieved = new Set(r.achieved);
  return finish(goal.tasks.map((t) => BREATH_STEPS[t] ?? { key: t, title: t, hint: "", detail: "" }), goal.tasks.map((t) => achieved.has(t)));
}

/* ----------------------------------------------------------------- orbits */
const ORBIT_STEPS: Record<string, Omit<Step, "state">> = {
  periods: { key: "periods", title: "Run a full Earth year", hint: "In the Solar system view, press \"▶ Play\" (or \"+1 year\").\nWatch the table: how many times does Mercury go round while Earth goes round once?", detail: "Planets closer to the Sun move faster and have a shorter path, so their year is shorter: Mercury 88 days, Earth 365, Mars 687. Kepler worked this out 400 years ago." },
  solar_eclipse: { key: "solar_eclipse", title: "Make a solar eclipse", hint: "Open the Sun–Earth–Moon view.\nDrag the Moon between the Sun and Earth, right on the line, until the banner says \"Solar eclipse\".", detail: "The Moon blocks the Sun and its small shadow falls on Earth. Only people inside that shadow see the eclipse. It can only happen at new moon." },
  lunar_eclipse: { key: "lunar_eclipse", title: "Make a lunar eclipse", hint: "Drag the Moon to the far side of Earth, opposite the Sun, until the banner says \"Lunar eclipse\".", detail: "Earth blocks the sunlight and its shadow falls on the Moon. A little red sunlight, bent through Earth's atmosphere, still reaches it: that is why it looks dark red. It can only happen at full moon." },
  seasons: { key: "seasons", title: "Visit summer and winter", hint: "Open the Seasons view.\nDrag Earth to June: look at the daylight hours and the Sun's height.\nThen drag it to December and compare.", detail: "Earth's axis always leans the same way in space. In June the north half leans toward the Sun: the Sun climbs higher and days are long. In December it leans away: low Sun, short days." },
  no_tilt: { key: "no_tilt", title: "Take away the tilt", hint: "In the Seasons view, drag Tilt to 0°. Now move through the year: what happens to the daylight hours?", detail: "Without a tilt every place gets 12 hours of day all year, and the Sun is equally high every day: no seasons. So seasons come from the tilt, not from Earth being closer to the Sun (it is actually closest in January)." },
};

export function buildOrbitsSteps(goal: { tasks: string[] }, r: OrbitsResult): Step[] {
  const achieved = new Set(r.achieved);
  return finish(goal.tasks.map((t) => ORBIT_STEPS[t] ?? { key: t, title: t, hint: "", detail: "" }), goal.tasks.map((t) => achieved.has(t)));
}

/* -------------------------------------------------------------- tectonics */
const TECTONIC_STEPS: Record<string, Omit<Step, "state">> = {
  subduction: { key: "subduction", title: "Create a subduction zone", hint: "In the Plates view, pick Subduction.\nPress \"▶ Run\" or drag Time to at least 5 Myr.\nWatch the ocean plate dive under the continent: the trench, the volcanoes, the earthquakes.", detail: "Ocean crust is made of heavy basalt; continents are lighter granite. When they meet, the denser ocean plate sinks into the mantle. Water it carries down lowers the melting point of the rock above, and that magma rises to make volcanoes, like the Andes." },
  mountains: { key: "mountains", title: "Build mountains", hint: "Pick Collision and run time until the mountains are at least 5 km high (about 12 Myr).", detail: "Two continents are both too light to sink, so the crust crumples, folds and stacks up. India pushing into Asia built the Himalayas this way, and they still grow a few millimetres a year." },
  compare: { key: "compare", title: "Compare three boundaries", hint: "Run three different boundary types for at least 5 Myr each.\nFor each, check the panel: are there volcanoes? How deep are the earthquakes?", detail: "Convergent boundaries destroy or crumple crust, divergent ones make new crust, transform ones only slide. Volcanoes need melting rock: subduction and divergent boundaries have them, collisions and transform faults do not." },
  layers: { key: "layers", title: "Look inside the Earth", hint: "Open the Earth's layers view and click each layer: crust, mantle, outer core and inner core.", detail: "We have never drilled through the crust (the deepest hole is 12 km). Everything we know about the deeper layers comes from how seismic waves travel through them." },
  waves: { key: "waves", title: "Follow P and S waves", hint: "Open the Seismic waves view.\nTry P waves, then S waves.\nMove the seismometer past 104° and see which waves still arrive.", detail: "S waves cannot travel through liquid. Seismometers on the far side of the Earth never record S waves: that is how scientists found out that the outer core is liquid." },
};

export function buildTectonicsSteps(goal: { tasks: string[] }, r: TectonicsResult): Step[] {
  const achieved = new Set(r.achieved);
  return finish(goal.tasks.map((t) => TECTONIC_STEPS[t] ?? { key: t, title: t, hint: "", detail: "" }), goal.tasks.map((t) => achieved.has(t)));
}

/* -------------------------------------------------------------- dispatch */
export function buildStepsFor(kind: string, goal: Record<string, unknown>, state: Record<string, unknown>, result: Record<string, unknown>): Step[] {
  if (kind === "molecules") return buildMoleculeSteps({ targets: (goal.targets as string[] | undefined) ?? [] }, state as unknown as Molecule, result as unknown as MoleculeResult);
  if (kind === "tectonics") return buildTectonicsSteps({ tasks: (goal.tasks as string[] | undefined) ?? [] }, result as unknown as TectonicsResult);
  if (kind === "orbits") return buildOrbitsSteps({ tasks: (goal.tasks as string[] | undefined) ?? [] }, result as unknown as OrbitsResult);
  if (kind === "respiration") return buildRespirationSteps({ tasks: (goal.tasks as string[] | undefined) ?? [] }, result as unknown as RespirationResult);
  if (kind === "buoyancy") return buildBuoyancySteps({ tasks: (goal.tasks as string[] | undefined) ?? [] }, state as unknown as BuoyancyState, result as unknown as BuoyancyResult);
  return buildSteps({ min_lit: (goal.min_lit as number | undefined) ?? 1, require_switch: (goal.require_switch as boolean | undefined) ?? false }, state as unknown as Circuit, result as unknown as Evaluation);
}
