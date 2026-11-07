import { describe, expect, it } from "vitest";

import { computeExplodeOffsets, explodedBounds } from "../runtime/explode";
import { samplePath } from "../runtime/paths";
import { proceduralCatalog } from "../runtime/procedural";
import { resolveScene } from "../runtime/sceneResolver";
import type { AssetMetadata, AssetRegistry, SceneSpec } from "../runtime/types";

const meta: AssetMetadata = {
  asset_id: "cell_v1",
  version: 1,
  name: "Cell",
  object_key: "demo-assets/glb/cell_v1.glb",
  components: [
    { mesh_name: "wall", label: "Wall" },
    { mesh_name: "nucleus", label: "Nucleus", explode_offset: [1, 2, 3] },
  ],
  paths: { flow: [[0, 0, 0], [1, 0, 0]] },
};
const registry: AssetRegistry = {
  resolve: (ref) =>
    ref.asset_id === "cell_v1" && ref.version === 1 ? { ref, meta, url: "/cell.glb" } : null,
};
const base: SceneSpec = {
  scene_id: "scene_cell",
  title: "Cell",
  asset_refs: [{ asset_id: "cell_v1", version: 1 }],
  components: [
    { component_id: "wall", mesh_name: "wall", label: "Wall", actions: ["highlight"] },
    { component_id: "nucleus", mesh_name: "nucleus", label: "Nucleus" },
  ],
};

describe("resolveScene", () => {
  it("resolves assets, components, metadata and paths", () => {
    const r = resolveScene(base, registry, proceduralCatalog);
    expect(r.errors).toEqual([]);
    expect(r.assets[0]?.url).toBe("/cell.glb");
    expect(r.components.map((c) => c.componentId)).toEqual(["wall", "nucleus"]);
    expect(r.components[1]?.meta?.explode_offset).toEqual([1, 2, 3]);
    expect(r.components[0]?.actions.has("highlight")).toBe(true);
    expect(Object.keys(r.paths)).toEqual(["flow"]);
  });

  it("refuses assets outside the registry and unknown generators", () => {
    const r = resolveScene(
      {
        ...base,
        asset_refs: [{ asset_id: "cell_v1", version: 9 }],
        procedural: [{ generator: "eval_js", params: {} }],
      },
      registry,
      proceduralCatalog,
    );
    expect(r.errors.join("\n")).toMatch(/not in the approved registry/);
    expect(r.errors.join("\n")).toMatch(/"eval_js" is not allowlisted/);
  });

  it("warns about meshes the metadata doesn't list and drops unknown actions", () => {
    const r = resolveScene(
      {
        ...base,
        components: [
          { component_id: "ghost", mesh_name: "ghost", label: "Ghost", actions: ["explode" as never] },
        ],
      },
      registry,
      proceduralCatalog,
    );
    expect(r.errors).toEqual([]);
    expect(r.warnings.join("\n")).toMatch(/ghost/);
    expect(r.components[0]?.actions.size).toBe(0);
  });

  it("resolves procedural meshes from the allowlist", () => {
    const r = resolveScene(
      {
        scene_id: "solar",
        title: "Solar",
        procedural: [{ generator: "solar_system", params: { planet_count: 2 } }],
        components: [{ component_id: "venus", mesh_name: "venus", label: "Venus" }],
      },
      registry,
      proceduralCatalog,
    );
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.components[0]?.assetId).toBeNull();
  });
});

describe("explode", () => {
  const items = [
    { id: "wall", center: [0, 0, 0] as [number, number, number], size: [4, 3, 3] as [number, number, number] },
    { id: "membrane", center: [0, 0, 0] as [number, number, number], size: [3.8, 2.8, 2.8] as [number, number, number] },
    { id: "nucleus", center: [-1, 0.2, 0] as [number, number, number], size: [0.8, 0.8, 0.8] as [number, number, number] },
    { id: "plastid", center: [1.2, 0, 0.5] as [number, number, number], size: [0.4, 0.2, 0.2] as [number, number, number] },
  ];

  it("pushes off-centre parts outward and peels concentric shells back", () => {
    const o = computeExplodeOffsets(items);
    expect(o.nucleus![0]).toBeLessThan(0);
    expect(o.plastid![0]).toBeGreaterThan(0);
    expect(o.membrane).toEqual([0, 0, -0]);
    expect(o.wall![2]).toBeLessThan(0); // bigger shell goes further back
  });

  it("prefers authored offsets", () => {
    const o = computeExplodeOffsets(items, { nucleus: [0, 5, 0] });
    expect(o.nucleus).toEqual([0, 5, 0]);
  });

  it("grows the bounds as the explode amount grows", () => {
    const o = computeExplodeOffsets(items);
    expect(explodedBounds(items, o, 1).radius).toBeGreaterThan(explodedBounds(items, o, 0).radius);
  });
});

describe("samplePath", () => {
  it("samples by arc length", () => {
    const p: [number, number, number][] = [
      [0, 0, 0],
      [1, 0, 0],
      [1, 3, 0],
    ];
    expect(samplePath(p, 0)).toEqual([0, 0, 0]);
    expect(samplePath(p, 0.5)).toEqual([1, 1, 0]);
    expect(samplePath(p, 1)).toEqual([1, 3, 0]);
  });
});
