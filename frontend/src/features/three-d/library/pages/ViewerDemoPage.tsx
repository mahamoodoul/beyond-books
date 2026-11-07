import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Link, NavLink, useParams } from "react-router";

import { api } from "@/api/client";
import type { AssetOut } from "@/api/generated/schema";
import { ErrorAlert, Loading } from "@/components/feedback";
import { useMe } from "@/features/auth/auth";
import { SceneViewer } from "@/features/three-d/library";
import { useLibraryModel } from "@/features/three-d/library/runtime/apiRegistry";
import {
  fixtureAnimations,
  fixtureRegistry,
  fixtureScenes,
} from "@/features/three-d/library/runtime/fixtureRegistry";
import { PartDeepDive, type DeepDiveCard } from "@/features/three-d/PartDeepDive";
import { PartEditor, partsOf, Readiness, UseInLesson, useTourNarration } from "@/features/three-d/StudioTools";

// prefer the high-detail cell; fall back to the detailed one when its GLB is missing
const DEFAULT_SCENES = ["scene_plant_cell_03", "scene_plant_cell_02"];
// hide scenes whose GLB isn't present in this checkout
const scenes = fixtureScenes.filter((s) =>
  (s.asset_refs ?? []).every((ref) => fixtureRegistry.resolve(ref) !== null),
);
const SOURCE: Record<string, string> = { blender: "Claude + Blender", llm: "AI designer" };

const pill = (active: boolean) =>
  `rounded-full px-3 py-1 text-sm ${active ? "bg-navy-700" : "bg-white shadow-sm hover:bg-slate-50"}`;

/** Teachers' own 3D-library models (uploaded or AI-generated), newest first. */
function useLibrary(enabled: boolean) {
  return useQuery({
    queryKey: ["assets"],
    queryFn: () => api.get<AssetOut[]>("/assets"),
    enabled,
    select: (list) =>
      list
        .filter((a) => a.latest_version > 0)
        .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)),
  });
}

/** A library model in the Studio: viewer + focus/X-ray/tour + in-depth cards + editing. */
function LibraryStudio({ assetId }: { assetId: string }) {
  const { model, error, isPending, empty } = useLibraryModel(assetId);
  const tour = useTourNarration(model?.asset);
  const parts = useMemo(() => (model ? partsOf(model.asset) : []), [model]);
  const labels = useMemo(() => Object.fromEntries(parts.map((p) => [p.name, p.label])), [parts]);
  // Live explanations (edits show at once), keyed like the scene's explanation refs.
  const explanations = useMemo(() => {
    const out: Record<string, string> = {};
    for (const c of model?.scene.components ?? []) {
      const p = parts.find((x) => x.name === c.mesh_name);
      if (p?.description) out[`exp_${c.component_id}`.slice(0, 64)] = p.description;
    }
    return out;
  }, [model, parts]);
  if (isPending) return <Loading label="Loading 3D model…" />;
  if (error) return <ErrorAlert error={error} />;
  if (empty || !model) return <p className="text-sm text-slate-600">This model has no file yet.</p>;
  const a = model.asset;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Readiness parts={parts} deepDives={Object.keys(model.insights).length} />
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${a.review_status === "approved" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>
          {a.review_status === "approved" ? "Approved" : "Not approved yet — only you can see it"}
        </span>
        <div className="ml-auto flex flex-wrap items-start gap-2">
          <Link to="/teacher/assets" className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100">3D library</Link>
          <UseInLesson asset={a} />
        </div>
      </div>
      {tour.error && <p role="alert" className="text-sm text-red-700">Tour narration: {String(tour.error)}</p>}
      <SceneViewer
        scene={model.scene}
        registry={model.registry}
        explanations={explanations}
        labels={labels}
        tour={tour.narration}
        onTourStart={tour.prepare}
        renderDetails={(c, inspect) => {
          const part = parts.find((p) => p.name === c.meshName);
          return (
            <>
              {part && <PartEditor asset={a} part={part} />}
              <PartDeepDive
                key={c.meshName}
                assetId={a.id}
                part={c.meshName}
                cached={model.insights[c.meshName] as DeepDiveCard | undefined}
                labelFor={(mesh) => labels[mesh] ?? mesh.replace(/_/g, " ")}
                onInspect={inspect}
              />
            </>
          );
        }}
        onEvent={(e) => {
          if (import.meta.env.DEV) console.debug("[studio event]", e);
        }}
      />
    </div>
  );
}

/** 3D Studio: your library models (incl. Claude + Blender) and demo scenes, with focus mode,
 *  X-ray, guided tour and in-depth explanations. */
export function ViewerDemoPage() {
  const { sceneId, assetId } = useParams();
  const me = useMe();
  const isTeacher = me.data?.account_type === "teacher";
  const library = useLibrary(isTeacher);
  const libraryAsset = assetId ? library.data?.find((a) => a.id === assetId) : undefined;

  const wanted = sceneId ? [sceneId] : DEFAULT_SCENES;
  const scene = assetId
    ? undefined
    : (wanted.map((id) => scenes.find((s) => s.scene_id === id)).find(Boolean) ?? scenes[0]);

  const title = assetId ? (libraryAsset?.name ?? "3D model") : (scene?.title ?? "3D Studio");
  const subtitle = assetId
    ? `${libraryAsset ? (SOURCE[libraryAsset.provider ?? ""] ?? "Uploaded") + " · " : ""}Click a part to focus on it and explore it in depth.`
    : "Demo scene. Schematic, not reviewed content. Click a part to focus on it.";

  return (
    <section className="space-y-4">
      <div className="space-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-accent">3D Studio</p>
          <h1 className="text-2xl font-semibold text-navy-950">{title}</h1>
          <p className="text-sm text-slate-600">{subtitle}</p>
        </div>
        {isTeacher && (
          <nav aria-label="Your 3D library" className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Your models</span>
            {library.isPending && <span className="text-sm text-slate-500">Loading…</span>}
            {library.data?.length === 0 && (
              <Link to="/teacher/assets" className="text-sm text-accent hover:underline">None yet — generate one in the 3D library</Link>
            )}
            {library.data?.map((a) => (
              <NavLink key={a.id} to={`/studio/library/${a.id}`} className={() => pill(a.id === assetId)}>
                {/* colour on a span: the app's unlayered `a { color: inherit }` beats utilities */}
                <span className={a.id === assetId ? "text-white" : "text-slate-700"}>{a.name}</span>
              </NavLink>
            ))}
          </nav>
        )}
        <nav aria-label="Demo scenes" className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Demo scenes</span>
          {scenes.map((s) => (
            <NavLink key={s.scene_id} to={`/studio/${s.scene_id}`} className={() => pill(s.scene_id === scene?.scene_id)}>
              <span className={s.scene_id === scene?.scene_id ? "text-white" : "text-slate-700"}>{s.title}</span>
            </NavLink>
          ))}
        </nav>
      </div>
      {assetId ? (
        <LibraryStudio key={assetId} assetId={assetId} />
      ) : scene ? (
        <SceneViewer
          scene={scene}
          animations={fixtureAnimations}
          registry={fixtureRegistry}
          onEvent={(e) => {
            if (import.meta.env.DEV) console.debug("[studio event]", e);
          }}
        />
      ) : (
        <p>No scene fixtures found.</p>
      )}
    </section>
  );
}

export default ViewerDemoPage;
