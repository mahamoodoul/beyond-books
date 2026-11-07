import type { AssetOut, GeneratorOut, SceneComponent, SceneSpec } from "@/api/generated/schema";

const MESH_OK = /^[A-Za-z0-9_.-]{1,128}$/;

function identifier(raw: string, prefix: string): string {
  let id = raw.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);
  if (!/^[a-z]/.test(id)) id = `${prefix}_${id}`;
  return id || prefix;
}

export function labelFor(name: string): string {
  const s = name.replace(/[_-]+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function componentsFrom(names: string[]): SceneComponent[] {
  const seen = new Set<string>();
  return names
    .filter((n) => MESH_OK.test(n))
    .map((n) => {
      let id = identifier(n, "part");
      while (seen.has(id)) id = `${id}_x`;
      seen.add(id);
      return { component_id: id, mesh_name: n, label: labelFor(n), actions: ["highlight", "show_explanation"] };
    });
}

const sceneId = () => `scene_${Math.random().toString(36).slice(2, 10)}`;

export function specFromAsset(asset: AssetOut): SceneSpec {
  const latest = asset.versions?.find((v) => v.version_number === asset.latest_version);
  const names = (latest?.metadata_json?.node_names as string[] | undefined) ?? [];
  return {
    schema_version: "1.0",
    scene_id: sceneId(),
    title: `Explore: ${asset.name}`,
    asset_refs: [{ asset_id: asset.slug, version: asset.latest_version }],
    camera: { preset: "three_quarter", min_distance: 2, max_distance: 12 },
    components: componentsFrom(names),
    controls: ["rotate", "zoom", "select_component"],
    explanations: {},
  };
}

export function specFromGenerator(g: GeneratorOut): SceneSpec {
  const big = g.name === "solar_system";
  return {
    schema_version: "1.0",
    scene_id: sceneId(),
    title: labelFor(g.name),
    procedural: [{ generator: g.name, params: {} }],
    camera: { preset: big ? "three_quarter" : "front", min_distance: big ? 4 : 2, max_distance: big ? 60 : 20 },
    components: componentsFrom(g.default_components),
    controls: ["rotate", "zoom", "pan", "select_component"],
    explanations: {},
  };
}
