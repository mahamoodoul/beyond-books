import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { EMPTY_FRAME } from "../runtime/animation";
import { ComponentRegistry, GHOST_OPACITY, type ViewState } from "../runtime/componentRegistry";
import type { ResolvedComponent } from "../runtime/types";

function part(name: string): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
  m.name = name;
  return m;
}
const component = (id: string): ResolvedComponent => ({
  componentId: id,
  meshName: id,
  label: id,
  actions: new Set(),
  explanationRef: null,
  assetId: "a",
  meta: null,
});

function setup() {
  const root = new THREE.Group();
  root.add(part("frontal_lobe"), part("cerebellum"));
  const reg = new ComponentRegistry();
  reg.registerFrom(root, [component("frontal_lobe"), component("cerebellum")]);
  const opacity = (id: string) => (root.getObjectByName(id) as THREE.Mesh<THREE.BufferGeometry, THREE.Material>).material.opacity;
  const view = (isolated: string | null): ViewState => ({
    explode: 0,
    offsets: {},
    frame: EMPTY_FRAME,
    hidden: new Set(),
    selected: isolated,
    isolated,
    hovered: null,
    timeSeconds: 0,
    reducedMotion: true,
  });
  return { reg, opacity, view };
}

describe("focus mode", () => {
  it("keeps the focused part solid and ghosts every other part", () => {
    const { reg, opacity, view } = setup();
    reg.apply(view("frontal_lobe"));
    expect(opacity("frontal_lobe")).toBe(1);
    expect(opacity("cerebellum")).toBeCloseTo(GHOST_OPACITY);
  });

  it("restores every part when focus mode ends", () => {
    const { reg, opacity, view } = setup();
    reg.apply(view("frontal_lobe"));
    reg.apply(view(null));
    expect(opacity("frontal_lobe")).toBe(1);
    expect(opacity("cerebellum")).toBe(1);
  });
});

describe("x-ray mode", () => {
  it("makes every part see-through except the selected one", async () => {
    const { XRAY_OPACITY } = await import("../runtime/componentRegistry");
    const { reg, opacity, view } = setup();
    reg.apply({ ...view(null), selected: "cerebellum", xray: true });
    expect(opacity("cerebellum")).toBe(1);
    expect(opacity("frontal_lobe")).toBeCloseTo(XRAY_OPACITY);
  });
});
