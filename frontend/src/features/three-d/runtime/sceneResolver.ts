/**
 * Scene resolver (design §7.3): validated scene spec -> approved assets + resolved components.
 *
 * The scene only names assets by ID + version and meshes by name. URLs come from the registry;
 * procedural generators come from the renderer allowlist. Anything else is an error, not a guess.
 */
import type {
  AssetRegistry,
  ComponentAction,
  ResolvedAsset,
  ResolvedComponent,
  ResolvedScene,
  SceneSpec,
  Vec3,
} from "./types";

const IDENTIFIER = /^[a-z][a-z0-9_]{0,63}$/;
const MESH_NAME = /^[A-Za-z0-9_.-]{1,128}$/;
const COMPONENT_ACTIONS: ReadonlySet<string> = new Set<ComponentAction>([
  "highlight",
  "show_explanation",
  "toggle_visibility",
  "focus_camera",
]);

export interface ProceduralCatalog {
  has(generator: string): boolean;
  /** Mesh names a generator can produce for the given params. */
  meshNames(generator: string, params: Record<string, unknown>): string[];
}

export function resolveScene(
  spec: SceneSpec,
  registry: AssetRegistry,
  procedural: ProceduralCatalog,
): ResolvedScene {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (spec.schema_version !== undefined && spec.schema_version !== "1.0") {
    errors.push(`unsupported scene schema_version ${String(spec.schema_version)}`);
  }
  if (!IDENTIFIER.test(spec.scene_id)) errors.push("invalid scene_id");

  const assets: ResolvedAsset[] = [];
  for (const ref of spec.asset_refs ?? []) {
    const asset = registry.resolve(ref);
    if (asset) assets.push(asset);
    else errors.push(`asset ${ref.asset_id} v${ref.version} is not in the approved registry`);
  }

  const proceduralMeshes = new Set<string>();
  for (const source of spec.procedural ?? []) {
    if (!procedural.has(source.generator)) {
      errors.push(`procedural generator "${source.generator}" is not allowlisted`);
      continue;
    }
    for (const name of procedural.meshNames(source.generator, source.params ?? {})) {
      proceduralMeshes.add(name);
    }
  }

  if (assets.length === 0 && proceduralMeshes.size === 0 && errors.length === 0) {
    errors.push("scene has no renderable asset or procedural source");
  }

  const paths: Record<string, Vec3[]> = {};
  for (const asset of assets) Object.assign(paths, asset.meta.paths ?? {});

  const components: ResolvedComponent[] = [];
  const seen = new Set<string>();
  for (const c of spec.components ?? []) {
    if (!IDENTIFIER.test(c.component_id) || !MESH_NAME.test(c.mesh_name)) {
      errors.push(`component "${c.component_id}" has an invalid id or mesh_name`);
      continue;
    }
    if (seen.has(c.component_id)) {
      errors.push(`duplicate component_id ${c.component_id}`);
      continue;
    }
    seen.add(c.component_id);

    const owner = assets.find((a) => a.meta.components.some((m) => m.mesh_name === c.mesh_name));
    const meta = owner?.meta.components.find((m) => m.mesh_name === c.mesh_name) ?? null;
    const isProcedural = proceduralMeshes.has(c.mesh_name);
    if (!owner && !isProcedural) {
      // The GLB is the final authority (checked at load); metadata should still list it.
      warnings.push(`mesh "${c.mesh_name}" is not listed in any asset's metadata`);
    }

    const actions = new Set<ComponentAction>();
    for (const a of c.actions ?? []) {
      if (COMPONENT_ACTIONS.has(a)) actions.add(a);
      else warnings.push(`component ${c.component_id}: ignoring unknown action "${String(a)}"`);
    }

    components.push({
      componentId: c.component_id,
      meshName: c.mesh_name,
      label: c.label,
      actions,
      explanationRef: c.explanation_ref ?? null,
      assetId: owner?.meta.asset_id ?? (isProcedural ? null : (assets[0]?.meta.asset_id ?? null)),
      meta,
    });
  }

  return { spec, assets, components, paths, errors, warnings };
}
