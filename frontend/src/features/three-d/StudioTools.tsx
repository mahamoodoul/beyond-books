/**
 * Studio tools for a 3D-library model: readiness, part editing and "use in a lesson".
 * Used by the Studio page (features/three-d/library/pages/ViewerDemoPage.tsx).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";

import { api, errorMessage } from "@/api/client";
import type { AssetOut, CourseOut, CourseOutline, JobOut, SceneOut } from "@/api/generated/schema";
import { useJob } from "@/features/jobs/useJob";

import { specFromAsset } from "./specBuilders";

export interface PartMeta {
  name: string;
  label: string;
  description: string;
  /** "ai" = written by AI, "teacher" = written/edited by a teacher. */
  source?: "ai" | "teacher";
  reviewed?: boolean;
}

export function partsOf(asset: AssetOut): PartMeta[] {
  const latest = asset.versions?.find((v) => v.version_number === asset.latest_version);
  const meta = (latest?.metadata_json ?? {}) as { node_names?: string[]; parts?: PartMeta[] };
  const byName = new Map((meta.parts ?? []).map((p) => [p.name, p]));
  return (meta.node_names ?? []).map(
    (n) => byName.get(n) ?? { name: n, label: n.replace(/_/g, " "), description: "" },
  );
}

/** Ring showing how many parts have an explanation (from the original studio). */
export function Readiness({ parts, deepDives }: { parts: PartMeta[]; deepDives: number }) {
  const explained = parts.filter((p) => p.description.trim()).length;
  const pct = parts.length ? Math.round((explained / parts.length) * 100) : 0;
  const r = 16;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
      <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden>
        <circle cx="20" cy="20" r={r} fill="none" style={{ stroke: "var(--line-strong)" }} strokeWidth="5" />
        <circle cx="20" cy="20" r={r} fill="none" stroke={pct === 100 ? "#16a34a" : "#d97706"} strokeWidth="5"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} strokeLinecap="round" transform="rotate(-90 20 20)" />
      </svg>
      <div className="text-sm">
        <p className="font-semibold text-slate-900">{pct === 100 ? "Ready to teach" : `${pct}% explained`}</p>
        <p className="text-xs text-slate-500">
          {explained}/{parts.length} parts explained · {deepDives} in-depth card{deepDives === 1 ? "" : "s"}
        </p>
      </div>
    </div>
  );
}

/** Edit one part's label and explanation (owners only). */
export function PartEditor({ asset, part }: { asset: AssetOut; part: PartMeta }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ label: part.label, description: part.description });
  useEffect(() => setForm({ label: part.label, description: part.description }), [part.name, part.label, part.description]);
  const save = useMutation({
    mutationFn: () => api.patch<AssetOut>(`/assets/${asset.id}/parts/${encodeURIComponent(part.name)}`, form),
    onSuccess: (a) => {
      qc.setQueryData(["asset", asset.id], a);
      setOpen(false);
    },
  });
  if (!asset.can_manage) return null;
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-2 text-xs font-medium text-accent hover:underline">
        ✎ Edit label & explanation
      </button>
    );
  }
  return (
    <form
      className="mt-2 space-y-2 rounded-md bg-slate-50 p-2"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <input aria-label="Part label" maxLength={200} className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
      <textarea aria-label="Part explanation" rows={4} maxLength={2000} className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      <div className="flex gap-2">
        <button type="submit" disabled={save.isPending} className="rounded-md bg-navy-900 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-60">{save.isPending ? "Saving…" : "Save"}</button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-md px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-100">Cancel</button>
      </div>
      {save.error && <p role="alert" className="text-xs text-red-700">{errorMessage(save.error)}</p>}
    </form>
  );
}

/** Add this library model to a lesson as a 3D scene, then continue in the lesson studio. */
export function UseInLesson({ asset }: { asset: AssetOut }) {
  const [open, setOpen] = useState(false);
  const [courseId, setCourseId] = useState("");
  const [lessonId, setLessonId] = useState("");
  const courses = useQuery({ queryKey: ["courses"], queryFn: () => api.get<CourseOut[]>("/courses"), enabled: open });
  const outline = useQuery({
    queryKey: ["outline", courseId],
    queryFn: () => api.get<CourseOutline>(`/courses/${courseId}/outline`),
    enabled: open && !!courseId,
  });
  const create = useMutation({
    mutationFn: () => api.post<SceneOut>(`/lessons/${lessonId}/scenes`, { spec: { ...specFromAsset(asset), title: asset.name.slice(0, 200) } }),
  });
  const approved = asset.review_status === "approved";

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
        + Use in a lesson
      </button>
    );
  }
  return (
    <div className="w-full space-y-2 rounded-lg border border-slate-200 bg-white p-3 sm:w-auto sm:min-w-96" role="group" aria-label="Use in a lesson">
      {!approved && <p className="text-xs text-amber-700">Approve this model in the 3D library before using it in a lesson.</p>}
      <div className="flex flex-wrap gap-2">
        <select aria-label="Course" className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm" value={courseId} onChange={(e) => { setCourseId(e.target.value); setLessonId(""); create.reset(); }}>
          <option value="">Choose a course…</option>
          {courses.data?.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
        <select aria-label="Lesson" disabled={!outline.data} className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm" value={lessonId} onChange={(e) => { setLessonId(e.target.value); create.reset(); }}>
          <option value="">Choose a lesson…</option>
          {outline.data?.chapters.map((ch) => (
            <optgroup key={ch.id} label={`${ch.position}. ${ch.title}`}>
              {ch.lessons.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
            </optgroup>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" disabled={!lessonId || !approved || create.isPending || create.isSuccess} onClick={() => create.mutate()} className="rounded-md bg-navy-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
          {create.isPending ? "Adding…" : "Add as 3D scene"}
        </button>
        <button type="button" onClick={() => { setOpen(false); create.reset(); }} className="text-sm text-slate-600 hover:underline">Close</button>
      </div>
      {create.isSuccess && (
        <p role="status" className="text-sm text-green-700">
          Added as a draft scene. <Link className="font-medium underline" to={`/teacher/lessons/${lessonId}/studio`}>Open the lesson studio →</Link>
        </p>
      )}
      {create.error && <p role="alert" className="text-sm text-red-700">{errorMessage(create.error)}</p>}
    </div>
  );
}


interface TourMeta {
  intro: string;
  steps: { part: string; connection: string }[];
}

/** Guided-tour narration for a library model: cached on the model, or written on first use. */
export function useTourNarration(asset: AssetOut | undefined) {
  const qc = useQueryClient();
  const latest = asset?.versions?.find((v) => v.version_number === asset.latest_version);
  const cached = (latest?.metadata_json as { tour?: TourMeta } | undefined)?.tour;
  const [jobId, setJobId] = useState<string | null>(null);
  const job = useJob(jobId);
  const start = useMutation({
    mutationFn: () => api.post<JobOut>(`/assets/${asset?.id}/ai/tour`),
    onSuccess: (j) => setJobId(j.id),
  });
  const done = job.data?.status === "completed";
  useEffect(() => {
    if (done && asset) void qc.invalidateQueries({ queryKey: ["asset", asset.id] });
  }, [done, asset, qc]);
  const fresh = done ? (job.data?.result as { tour?: TourMeta } | null)?.tour : undefined;
  const tour = cached ?? fresh;
  const loading = !tour && (start.isPending || (!!jobId && !["completed", "failed"].includes(job.data?.status ?? "")));
  const narration = useMemo(
    () =>
      asset
        ? {
            topic: asset.name,
            intro: tour?.intro,
            order: tour?.steps.map((s) => s.part),
            notes: Object.fromEntries((tour?.steps ?? []).filter((s) => s.connection).map((s) => [s.part, s.connection])),
            loading,
          }
        : undefined,
    [asset, tour, loading],
  );
  const prepare = () => {
    if (!tour && !start.isPending && !jobId) start.mutate();
  };
  return { narration, prepare, error: start.error ?? (job.data?.status === "failed" ? job.data.error_message : null) };
}
