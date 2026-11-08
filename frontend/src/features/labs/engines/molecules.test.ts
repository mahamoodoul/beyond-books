import { describe, expect, it } from "vitest";

import { evaluateMolecule, formula, type Atom, type Molecule } from "./molecules";

const atom = (id: string, element: string): Atom => ({ id, element, x: 0, y: 0 });
const bond = (id: string, a: string, b: string, order = 1) => ({ id, a, b, order });
const WATER: Molecule = { atoms: [atom("o", "O"), atom("h1", "H"), atom("h2", "H")], bonds: [bond("b1", "o", "h1"), bond("b2", "o", "h2")] };
const CO2: Molecule = { atoms: [atom("c", "C"), atom("o1", "O"), atom("o2", "O")], bonds: [bond("b1", "c", "o1", 2), bond("b2", "c", "o2", 2)] };
const goal = { targets: ["H2O", "CO2"] };

// Same cases as backend/tests/test_labs.py::test_molecule_engine_*
describe("molecule engine", () => {
  it("writes formulas in Hill order", () => {
    expect(formula([atom("1", "H"), atom("2", "O"), atom("3", "H")])).toBe("H2O");
    expect(formula([atom("1", "C"), atom("2", "H"), atom("3", "H"), atom("4", "H"), atom("5", "H")])).toBe("CH4");
    expect(formula([atom("1", "Cl"), atom("2", "H")])).toBe("ClH"); // no carbon: alphabetical
  });

  it("recognises water and carbon dioxide with their shapes and tracks targets", () => {
    const r = evaluateMolecule(WATER, goal, []);
    expect(r.result.formula).toBe("H2O");
    expect(r.result.name).toBe("water");
    expect(r.result.shape).toBe("bent");
    expect(r.achieved).toEqual(["H2O"]);
    expect(r.goal_met).toBe(false);
    const r2 = evaluateMolecule(CO2, goal, ["H2O"]);
    expect(r2.result.shape).toBe("linear");
    expect(r2.goal_met).toBe(true);
    expect(r2.message).toContain("Every target");
  });

  it("explains what is missing, over-bonded or disconnected", () => {
    const half: Molecule = { atoms: [atom("o", "O"), atom("h1", "H")], bonds: [bond("b1", "o", "h1")] };
    const r = evaluateMolecule(half, goal, []);
    expect(r.result.complete).toBe(false);
    expect(r.result.missing).toEqual({ o: 1 });
    expect(r.message).toContain("more bond");
    const bad: Molecule = { atoms: [atom("h", "H"), atom("o", "O")], bonds: [bond("b1", "h", "o", 2)] };
    expect(evaluateMolecule(bad, goal, []).message).toContain("too many bonds");
    const frag: Molecule = { atoms: [atom("h1", "H"), atom("h2", "H"), atom("h3", "H"), atom("h4", "H")], bonds: [bond("b1", "h1", "h2"), bond("b2", "h3", "h4")] };
    expect(evaluateMolecule(frag, goal, []).message).toContain("one molecule");
  });
});
