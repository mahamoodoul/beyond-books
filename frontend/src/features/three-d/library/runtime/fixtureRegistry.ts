/**
 * Development asset registry backed by packages/demo-assets and the contract fixtures.
 * Replace with an API-backed AssetRegistry once the backend asset endpoints exist (Phase 4).
 */
import type { AnimationSpec, AssetMetadata, AssetRegistry, SceneSpec } from "./types";

const metas = import.meta.glob<AssetMetadata>("../../../../../../packages/demo-assets/metadata/*.json", {
  eager: true,
  import: "default",
});
const glbs = import.meta.glob<string>("../../../../../../packages/demo-assets/glb/*.glb", {
  eager: true,
  query: "?url",
  import: "default",
});
const fixtures = import.meta.glob<SceneSpec | AnimationSpec>(
  "../../../../../packages/three-d-contracts/fixtures/*.json",
  { eager: true, import: "default" },
);

const OBJECT_KEY = /^demo-assets\/glb\/([a-z][a-z0-9_]{0,63})\.glb$/;

function glbUrl(objectKey: string): string | null {
  const m = OBJECT_KEY.exec(objectKey);
  if (!m) return null;
  const entry = Object.entries(glbs).find(([path]) => path.endsWith(`/glb/${m[1]}.glb`));
  return entry ? entry[1] : null;
}

export const fixtureRegistry: AssetRegistry = {
  resolve(ref) {
    const meta = Object.values(metas).find(
      (m) => m.asset_id === ref.asset_id && m.version === ref.version,
    );
    if (!meta) return null;
    const url = glbUrl(meta.object_key);
    return url ? { ref, meta, url } : null;
  },
};

export const fixtureScenes: SceneSpec[] = Object.values(fixtures)
  .filter((f): f is SceneSpec => "scene_id" in f)
  .sort((a, b) => a.title.localeCompare(b.title));

export const fixtureAnimations: AnimationSpec[] = Object.values(fixtures).filter(
  (f): f is AnimationSpec => "animation_id" in f,
);
