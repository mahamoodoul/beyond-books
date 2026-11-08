/**
 * Student 3D Studio: the same Studio view as teachers (focus, X-ray, guided tour, fullscreen,
 * in-depth study cards) but read-only and limited to the published 3D scenes of the student's
 * enrolled courses. No library, demo scenes, editing or AI generation.
 */
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router";

import { api } from "@/api/client";
import type { ResolvedScene, StudioSceneOut } from "@/api/generated/schema";
import { ErrorAlert, Loading } from "@/components/feedback";
import { SceneViewer } from "@/features/three-d/library";
import type { AnimationSpec, AssetMetadata, AssetRegistry, SceneComponent, SceneSpec } from "@/features/three-d/library/runtime/types";
import type { SceneEvent } from "@/features/three-d/components/SceneViewer";
import { PartDeepDive, type DeepDiveCard } from "@/features/three-d/PartDeepDive";

interface TourMeta {
  intro: string;
  steps: { part: string; connection: string }[];
}

function useStudioScenes() {
  return useQuery({ queryKey: ["studio-scenes"], queryFn: () => api.get<StudioSceneOut[]>("/studio/scenes") });
}

/** Registry over the signed URLs the backend resolved for exactly this scene. */
function registryFor(data: ResolvedScene): AssetRegistry {
  const spec = data.spec;
  const labels = new Map((spec.components ?? []).map((c) => [c.mesh_name, c.label]));
  const metas = new Map(
    data.assets.map((a) => {
      const meta: AssetMetadata = {
        asset_id: a.asset_id,
        version: a.version,
        name: a.name,
        object_key: "",
        components: a.node_names.map((n) => ({ mesh_name: n, label: labels.get(n) ?? n.replace(/_/g, " ") })),
        review_status: "approved",
      };
      return [`${a.asset_id}@${a.version}`, { meta, url: a.url, previewUrl: a.preview_url }];
    }),
  );
  return {
    resolve: (ref) => {
      const hit = metas.get(`${ref.asset_id}@${ref.version}`);
      return hit ? { ref, meta: hit.meta, url: hit.url, previewUrl: hit.previewUrl } : null;
    },
  };
}

/** The Studio viewer for one published lesson scene (Studio page and lesson pages).
 *  `onEvent` reports learning events in the lesson-analytics format. */
export function SceneStudio({ sceneId, onEvent }: { sceneId: string; onEvent?: (e: SceneEvent) => void }) {
  const resolved = useQuery({
    queryKey: ["scene-resolved", sceneId],
    queryFn: () => api.get<ResolvedScene>(`/scenes/${sceneId}/resolved`),
    staleTime: 5 * 60_000, // signed URLs live ~10 minutes
  });
  const data = resolved.data;
  const view = useMemo(() => {
    if (!data) return null;
    const insights: Record<string, DeepDiveCard> = {};
    let tour: TourMeta | undefined;
    for (const a of data.assets) {
      Object.assign(insights, (a.insights ?? {}) as Record<string, DeepDiveCard>);
      tour ??= (a.tour ?? undefined) as TourMeta | undefined;
    }
    const base = data.spec as unknown as SceneSpec;
    // The model's own parts (teacher-reviewed labels/descriptions), or just its mesh names.
    const parts = new Map<string, { label: string; description: string }>();
    for (const a of data.assets) {
      for (const n of a.node_names) parts.set(n, { label: n.replace(/_/g, " "), description: "" });
      for (const p of a.parts ?? []) parts.set(p.name ?? "", { label: p.label ?? p.name ?? "", description: p.description ?? "" });
    }
    parts.delete("");
    // A scene published without a parts list still gets clickable, explained parts.
    const components: SceneComponent[] = base.components?.length
      ? base.components
      : [...parts].map(([name, p], i) => ({
          component_id: `part_${i}`,
          mesh_name: name,
          label: p.label.slice(0, 120),
          actions: ["highlight", "show_explanation", "toggle_visibility", "focus_camera"],
        }));
    const explanations: Record<string, string> = { ...((base.explanations ?? {}) as Record<string, string>) };
    const withText = components.map((c) => {
      const ref = c.explanation_ref ?? `exp_${c.component_id}`.slice(0, 64);
      const fallback = parts.get(c.mesh_name)?.description;
      if (!explanations[ref] && fallback) explanations[ref] = fallback;
      return explanations[ref] ? { ...c, explanation_ref: ref } : c;
    });
    const spec: SceneSpec = { ...base, components: withText };
    return {
      spec,
      registry: registryFor(data),
      explanations,
      labels: Object.fromEntries(withText.map((c) => [c.mesh_name, c.label])),
      insights,
      narration: {
        topic: spec.title ?? "this model",
        intro: tour?.intro,
        order: tour?.steps.map((s) => s.part),
        notes: Object.fromEntries((tour?.steps ?? []).filter((s) => s.connection).map((s) => [s.part, s.connection])),
      },
    };
  }, [data]);

  const loaded = !!resolved.data;
  useEffect(() => {
    if (loaded) onEvent?.({ event_type: "scene_opened" });
  }, [loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  if (resolved.isPending) return <Loading label="Loading 3D model…" />;
  if (resolved.error) return <ErrorAlert error={resolved.error} />;
  if (!view || !data) return null;
  return (
    <SceneViewer
      scene={view.spec}
      animations={(data.animations ?? []) as unknown as AnimationSpec[]}
      registry={view.registry}
      explanations={view.explanations}
      labels={view.labels}
      tour={view.narration}
      renderDetails={(c, inspect) => (
        <PartDeepDive
          key={c.meshName}
          assetId=""
          part={c.meshName}
          cached={view.insights[c.meshName]}
          readOnly
          labelFor={(mesh) => view.labels[mesh] ?? mesh.replace(/_/g, " ")}
          onInspect={inspect}
        />
      )}
      onEvent={(e) => {
        if (e.type === "component_selected") onEvent?.({ event_type: "component_selected", component_id: e.componentId });
        else if (e.type === "animation_started") onEvent?.({ event_type: "animation_started", animation_id: e.animationId });
        else if (e.type === "animation_completed") onEvent?.({ event_type: "animation_completed", animation_id: e.animationId });
      }}
    />
  );
}

/** /studio and /studio/scene/:studioSceneId for students. */
export function StudentStudio() {
  const { studioSceneId } = useParams();
  const navigate = useNavigate();
  const scenes = useStudioScenes();
  const list = scenes.data ?? [];
  const current = list.find((s) => s.scene_id === studioSceneId);
  const courses = useMemo(() => {
    const out = new Map<string, { title: string; items: StudioSceneOut[] }>();
    for (const s of list) {
      const c = out.get(s.course_id) ?? { title: s.course_title, items: [] };
      c.items.push(s);
      out.set(s.course_id, c);
    }
    return [...out.values()];
  }, [list]);

  if (scenes.isPending) return <Loading label="Loading your 3D models…" />;
  if (scenes.error) return <ErrorAlert error={scenes.error} />;
  // open the first model straight away; unknown/foreign ids fall back to the list
  const first = list[0];
  if (first && !current) return <Navigate to={`/studio/scene/${first.scene_id}`} replace />;

  return (
    <section className="space-y-4">
      <div className="space-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-accent">3D Studio</p>
          <h1 className="text-2xl font-semibold text-navy-950">{current?.title ?? "3D Studio"}</h1>
          <p className="text-sm text-slate-600">
            {current
              ? `${current.course_title} · ${current.chapter_title} · ${current.lesson_title}. Click a part to focus on it and explore it in depth.`
              : "3D models from your courses appear here once your teacher publishes them."}
          </p>
        </div>
        {list.length > 0 && (
          <div className="studio-picker">
            <label className="studio-picker-field">
              <span>Your 3D models ({list.length})</span>
              <select onChange={(e) => e.target.value && navigate(`/studio/scene/${e.target.value}`)} value={current?.scene_id ?? ""}>
                <option disabled value="">Choose a 3D model…</option>
                {courses.length > 1
                  ? courses.map((c) => (
                      <optgroup key={c.title} label={c.title}>
                        {c.items.map((sc) => <option key={sc.scene_id} value={sc.scene_id}>{sc.title}</option>)}
                      </optgroup>
                    ))
                  : list.map((sc) => <option key={sc.scene_id} value={sc.scene_id}>{sc.title}</option>)}
              </select>
            </label>
            {current && (
              <Link className="studio-picker-link" to={`/student/lessons/${current.lesson_id}`}>Open the lesson →</Link>
            )}
          </div>
        )}
      </div>
      {current ? (
        <div className="studio-wide"><SceneStudio key={current.scene_id} sceneId={current.scene_id} /></div>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">
          No 3D models yet. <Link to="/student/courses" className="text-accent hover:underline">Go to my courses</Link>
        </div>
      )}
    </section>
  );
}
