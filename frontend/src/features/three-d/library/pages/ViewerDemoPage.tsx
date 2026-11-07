import { NavLink, useParams } from "react-router";

import { SceneViewer } from "@/features/three-d/library";
import {
  fixtureAnimations,
  fixtureRegistry,
  fixtureScenes,
} from "@/features/three-d/library/runtime/fixtureRegistry";

// prefer the high-detail cell; its GLB is local-only, so fall back to the detailed one
const DEFAULT_SCENES = ["scene_plant_cell_03", "scene_plant_cell_02"];
// hide scenes whose GLB isn't present in this checkout (e.g. the uncommitted high-detail cell)
const scenes = fixtureScenes.filter((s) =>
  (s.asset_refs ?? []).every((ref) => fixtureRegistry.resolve(ref) !== null),
);

/** Development page: every scene fixture rendered by the viewer (design Phase 4). */
export function ViewerDemoPage() {
  const { sceneId } = useParams();
  const wanted = sceneId ? [sceneId] : DEFAULT_SCENES;
  const scene =
    wanted.map((id) => scenes.find((s) => s.scene_id === id)).find(Boolean) ?? scenes[0];

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-navy-950">{scene?.title ?? "3D viewer"}</h1>
          <p className="text-sm text-slate-600">
            Demo scenes from the contract fixtures. Schematic, not reviewed content.
          </p>
        </div>
        <nav aria-label="Demo scenes" className="flex flex-wrap gap-1.5">
          {scenes.map((s) => (
            <NavLink
              key={s.scene_id}
              to={`/viewer/${s.scene_id}`}
              className={() =>
                `rounded-full px-3 py-1 text-sm ${
                  s.scene_id === scene?.scene_id
                    ? "bg-navy-700"
                    : "bg-white shadow-sm hover:bg-slate-50"
                }`
              }
            >
              {/* colour on a span: the app's unlayered `a { color: inherit }` beats utilities */}
              <span className={s.scene_id === scene?.scene_id ? "text-white" : "text-slate-700"}>
                {s.title}
              </span>
            </NavLink>
          ))}
        </nav>
      </div>
      {scene ? (
        <SceneViewer
          scene={scene}
          animations={fixtureAnimations}
          registry={fixtureRegistry}
          onEvent={(e) => {
            if (import.meta.env.DEV) console.debug("[viewer event]", e);
          }}
        />
      ) : (
        <p>No scene fixtures found.</p>
      )}
    </section>
  );
}

export default ViewerDemoPage;
