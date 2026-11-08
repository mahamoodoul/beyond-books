import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router";

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
import { SceneStudio, StudentStudio } from "@/features/three-d/library/pages/StudentStudio";
import { PartEditor, partsOf, Readiness, UseInLesson, useTourNarration } from "@/features/three-d/StudioTools";

// prefer the high-detail cell; fall back to the detailed one when its GLB is missing
const DEFAULT_SCENES = ["scene_plant_cell_03", "scene_plant_cell_02"];
// hide scenes whose GLB isn't present in this checkout
const scenes = fixtureScenes.filter((s) =>
  (s.asset_refs ?? []).every((ref) => fixtureRegistry.resolve(ref) !== null),
);
const SOURCE: Record<string, string> = { blender: "Claude + Blender", llm: "AI designer" };
const sourceOf = (a: AssetOut) => SOURCE[a.provider ?? ""] ?? (a.provider === "seed" ? "Built-in" : "Uploaded");
const GROUP_ORDER = ["Claude + Blender", "AI designer", "Uploaded", "Built-in"];

/** Your models + demo scenes as two compact dropdowns (they used to be long rows of pills). */
function StudioPicker({
  library,
  loading,
  assetId,
  sceneId,
}: {
  library: AssetOut[] | undefined;
  loading: boolean;
  assetId: string | undefined;
  sceneId: string | undefined;
}) {
  const navigate = useNavigate();
  const groups = useMemo(() => {
    const byGroup = new Map<string, AssetOut[]>();
    for (const a of library ?? []) byGroup.set(sourceOf(a), [...(byGroup.get(sourceOf(a)) ?? []), a]);
    return [...byGroup].sort(([x], [y]) => GROUP_ORDER.indexOf(x) - GROUP_ORDER.indexOf(y));
  }, [library]);
  const count = library?.length ?? 0;

  return (
    <div className="studio-picker">
      <label className="studio-picker-field">
        <span>Your models{count ? ` (${count})` : ""}</span>
        <select
          disabled={loading || count === 0}
          onChange={(e) => e.target.value && navigate(`/studio/library/${e.target.value}`)}
          value={assetId ?? ""}
        >
          <option disabled value="">{loading ? "Loading…" : count === 0 ? "No models yet" : "Choose one of your models…"}</option>
          {groups.length > 1
            ? groups.map(([group, assets]) => (
                <optgroup key={group} label={group}>
                  {assets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </optgroup>
              ))
            : (library ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </label>
      {scenes.length > 0 && (
        <label className="studio-picker-field">
          <span>Demo scenes ({scenes.length})</span>
          <select onChange={(e) => e.target.value && navigate(`/studio/${e.target.value}`)} value={assetId ? "" : (sceneId ?? "")}>
            <option disabled value="">Choose a demo scene…</option>
            {scenes.map((s) => <option key={s.scene_id} value={s.scene_id}>{s.title}</option>)}
          </select>
        </label>
      )}
      <Link className="studio-picker-link" to="/teacher/assets">
        {count === 0 && !loading ? "Generate a model in the 3D library" : "Open the 3D library"}
      </Link>
    </div>
  );
}

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
  const me = useMe();
  if (me.isPending) return <Loading />;
  // Students get a read-only Studio with only their courses' published 3D models.
  if (me.data?.account_type !== "teacher") return <StudentStudio />;
  return <TeacherStudio />;
}

/** Teacher /studio/scene/:id: a lesson scene exactly as students see it in their Studio. */
function StudentViewPreview({ sceneId }: { sceneId: string }) {
  return (
    <section className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-accent">3D Studio · student view</p>
        <h1 className="text-2xl font-semibold text-navy-950">What students see</h1>
        <p className="text-sm text-slate-600">Read-only: students can explore, X-ray and tour this model, and read saved study cards.</p>
      </div>
      <div className="studio-wide"><SceneStudio sceneId={sceneId} /></div>
    </section>
  );
}

function TeacherStudio() {
  const { sceneId, assetId, studioSceneId } = useParams();
  const isTeacher = true;
  const library = useLibrary(isTeacher);
  const libraryAsset = assetId ? library.data?.find((a) => a.id === assetId) : undefined;

  const wanted = sceneId ? [sceneId] : DEFAULT_SCENES;
  const scene = assetId
    ? undefined
    : (wanted.map((id) => scenes.find((s) => s.scene_id === id)).find(Boolean) ?? scenes[0]);

  if (studioSceneId) return <StudentViewPreview sceneId={studioSceneId} />;
  const title = assetId ? (libraryAsset?.name ?? "3D model") : (scene?.title ?? "3D Studio");
  const subtitle = assetId
    ? `${libraryAsset ? (SOURCE[libraryAsset.provider ?? ""] ?? "Uploaded") + " · " : ""}Click a part to focus on it and explore it in depth.`
    : scene
      ? "Demo scene. Schematic, not reviewed content. Click a part to focus on it."
      : "Choose one of your models to explore it here.";

  return (
    <section className="space-y-4">
      <div className="space-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-accent">3D Studio</p>
          <h1 className="text-2xl font-semibold text-navy-950">{title}</h1>
          <p className="text-sm text-slate-600">{subtitle}</p>
        </div>
        <StudioPicker
          assetId={assetId}
          library={library.data}
          loading={library.isPending}
          sceneId={scene?.scene_id}
        />
      </div>
      <div className="studio-wide">
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
        <p className="text-sm text-slate-600">
          Choose one of your models above to open it here, or create one in the{" "}
          <Link to="/teacher/assets" className="font-medium text-accent hover:underline">3D library</Link>.
        </p>
      )}
      </div>
    </section>
  );
}

export default ViewerDemoPage;
