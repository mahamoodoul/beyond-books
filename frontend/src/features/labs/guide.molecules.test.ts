import { describe, expect, it } from "vitest";

import { evaluateMolecule, type Atom, type Bond, type Molecule } from "./engines/molecules";
import { buildMoleculeSteps } from "./guide";

const atom = (id: string, element: string): Atom => ({ id, element, x: 0, y: 0 });
const bond = (id: string, a: string, b: string, order = 1): Bond => ({ id, a, b, order });
const goal = { targets: ["H2O", "CO2", "CH4"] };
const steps = (m: Molecule, achieved: string[] = []) => buildMoleculeSteps(goal, m, evaluateMolecule(m, goal, achieved).result);
const current = (m: Molecule, achieved: string[] = []) => steps(m, achieved).find((s) => s.state === "current")!;

describe("molecule guide", () => {
  it("names the molecule and gives a full click-by-click recipe on an empty board", () => {
    const cur = current({ atoms: [], bonds: [] });
    expect(cur.title).toBe("Build water (H2O)");
    expect(cur.goal).toMatch(/1 oxygen/);
    const lines = cur.hint.split("\n");
    expect(lines[0]).toMatch(/red O button above the board once/);
    expect(lines[1]).toMatch(/white H button above the board twice/);
    expect(lines[2]).toMatch(/Click the O ball, then click one H ball/);
    expect(lines.at(-1)).toMatch(/glows green/);
    expect(cur.plan?.map((p) => p.done)).toEqual([false, false, false]);
  });

  it("tells the student exactly what to do next as the board changes", () => {
    const m: Molecule = { atoms: [atom("o1", "O")], bonds: [] };
    expect(current(m).hint).toBe("Add 2 more hydrogen balls: click the white H button above the board twice.");
    m.atoms.push(atom("h1", "H"), atom("h2", "H"));
    expect(current(m).plan?.[0]?.done).toBe(true);
    expect(current(m).hint).toMatch(/Click the O ball, then click a H ball that still shows a yellow number/);
    m.bonds.push(bond("b1", "o1", "h1"));
    expect(current(m).hint).toMatch(/1 more to go/);
    m.bonds.push(bond("b2", "o1", "h2"));
    const s = steps(m);
    expect(s[0]!.state).toBe("done");
    expect(s[1]!.state).toBe("current");
  });

  it("walks through double bonds for carbon dioxide", () => {
    const m: Molecule = { atoms: [atom("c1", "C"), atom("o1", "O"), atom("o2", "O")], bonds: [bond("b1", "c1", "o1"), bond("b2", "c1", "o2")] };
    const cur = current(m, ["H2O"]);
    expect(cur.title).toBe("Build carbon dioxide (CO2)");
    expect(cur.plan?.map((p) => p.done)).toEqual([true, true, false, false]);
    expect(cur.hint).toBe("Click the line between C and O once more so it shows two lines. That makes it a double bond.");
    m.bonds[0]!.order = 2;
    m.bonds[1]!.order = 2;
    expect(steps(m, ["H2O"])[1]!.state).toBe("done");
  });

  it("explains how to fix extra atoms, wrong pairs and leftovers", () => {
    expect(current({ atoms: [atom("o1", "O"), atom("h1", "H"), atom("h2", "H"), atom("h3", "H")], bonds: [] }).hint).toMatch(/1 hydrogen ball too many. Double-click one of the H balls/);
    expect(current({ atoms: [atom("o1", "O"), atom("n1", "N")], bonds: [] }).hint).toMatch(/water has no nitrogen in it/);
    expect(current({ atoms: [atom("o1", "O"), atom("h1", "H"), atom("h2", "H")], bonds: [bond("b1", "h1", "h2")] }).hint).toMatch(/H and H should not be joined/);
    // finished water while carbon dioxide is next: clear the board
    const water: Molecule = { atoms: [atom("o1", "O"), atom("h1", "H"), atom("h2", "H")], bonds: [bond("b1", "o1", "h1"), bond("b2", "o1", "h2")] };
    const cur = current(water, ["H2O"]);
    expect(cur.hint.split("\n")[0]).toMatch(/You built H2O \(water\), which is not carbon dioxide. Click “Clear board”/);
  });
});
