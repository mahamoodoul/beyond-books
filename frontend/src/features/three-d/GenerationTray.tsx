/**
 * "Building in the background": the teacher's running 3D generations with a progress bar,
 * plus recent results (ready / failed + retry). Used in the 3D library and the Chapter Studio.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { api, errorMessage } from "@/api/client";
import type { GenerationJobOut, JobOut } from "@/api/generated/schema";

const ACTIVE = new Set(["queued", "processing", "retrying", "validating"]);
const LABEL: Record<string, string> = { blender: "Claude + Blender", llm: "AI designer", fake: "Test generator", tripo: "Tripo", meshy: "Meshy" };
/** Typical build time per generator, used to estimate the progress bar (seconds). */
const TYPICAL_S: Record<string, number> = { blender: 300, llm: 60, fake: 5 };

export const isActive = (j: GenerationJobOut) => ACTIVE.has(j.status);

/** Polls the user's generations: fast while something runs, slow otherwise. */
export function useGenerationJobs() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["generation-jobs"],
    queryFn: () => api.get<GenerationJobOut[]>("/assets/generation-jobs"),
    refetchInterval: (q) => ((q.state.data ?? []).some(isActive) ? 4000 : 30_000),
  });
  // When a build finishes, refresh the library so the new model shows up.
  const prev = useRef<Set<string>>(new Set());
  useEffect(() => {
    const active = new Set((query.data ?? []).filter(isActive).map((j) => j.job_id));
    const finished = [...prev.current].some((id) => !active.has(id));
    prev.current = active;
    if (finished) {
      for (const key of [["assets"], ["chapter-scenes"], ["scenes"], ["chapter-overview"]]) void qc.invalidateQueries({ queryKey: key });
    }
  }, [query.data, qc]);
  return query;
}

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [active]);
  return now;
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

function Row({ job, dark, now, onOpen }: { job: GenerationJobOut; dark: boolean; now: number; onOpen?: (assetId: string) => void }) {
  const qc = useQueryClient();
  const retry = useMutation({
    mutationFn: () => api.post<JobOut>(`/assets/${job.asset_id}/generation-jobs/retry`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["generation-jobs"] }),
  });
  const dismiss = useMutation({
    mutationFn: () => api.post<void>(`/assets/generation-jobs/${job.job_id}/dismiss`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["generation-jobs"] });
      void qc.invalidateQueries({ queryKey: ["assets"] });
    },
  });
  const active = isActive(job);
  const failed = job.status === "failed";
  const elapsed = Math.max(0, Math.round((now - Date.parse(job.created_at)) / 1000));
  const typical = TYPICAL_S[job.provider] ?? 120;
  // eased estimate that slows down near the end and never claims to be finished
  const pct = active ? Math.min(95, Math.round(100 * (1 - Math.exp(-elapsed / (typical * 0.6))))) : 100;
  const label =
    job.status === "queued"
      ? "Waiting to start"
      : active
        ? `${job.provider === "blender" ? "Claude is building in Blender" : "Designing the model"}${job.lesson_title ? ` for “${job.lesson_title}”` : ""}`
        : failed
          ? "Failed"
          : job.scene_id && job.lesson_title
            ? `Saved into “${job.lesson_title}” as a draft 3D scene`
            : "Ready — needs your review";
  const text = dark ? "text-slate-200" : "text-slate-900";
  const sub = dark ? "text-slate-400" : "text-slate-500";
  const track = dark ? "bg-white/10" : "bg-slate-200";
  const bar = failed ? "bg-red-500" : active ? "bg-[#38b2ac]" : "bg-green-600";

  return (
    <li className={`rounded-lg px-3 py-2.5 ${dark ? "bg-white/5" : "bg-white shadow-sm ring-1 ring-slate-200"}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {active ? (
          <span aria-hidden className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#38b2ac]/30 border-t-[#38b2ac] motion-reduce:animate-none" />
        ) : (
          <span aria-hidden className={failed ? "text-red-500" : "text-green-600"}>{failed ? "✕" : "✓"}</span>
        )}
        <span className={`min-w-0 flex-1 truncate text-sm font-medium ${text}`}>{job.asset_name}</span>
        <span className={`text-xs ${sub}`}>{LABEL[job.provider] ?? job.provider}</span>
        {active && <span className={`font-mono text-xs tabular-nums ${sub}`}>{clock(elapsed)}</span>}
        {/* label colours sit on spans: the app's global button colour beats utility classes */}
        {!active && !failed && onOpen && (
          <button type="button" onClick={() => onOpen(job.asset_id)} className="rounded-md bg-[#38b2ac] px-2 py-0.5 hover:bg-[#4fc7c0]">
            <span className="text-xs font-semibold text-[#0b0d16]">Review</span>
          </button>
        )}
        {failed && (
          <button type="button" disabled={retry.isPending} onClick={() => retry.mutate()} className="rounded-md bg-slate-900 px-2 py-0.5 hover:bg-slate-700 disabled:opacity-60">
            <span className="text-xs font-medium text-white">{retry.isPending ? "Retrying…" : "Retry"}</span>
          </button>
        )}
        {!active && (
          <button type="button" aria-label={`Dismiss ${job.asset_name}`} title={failed && !job.has_model ? "Dismiss and remove the empty library entry" : "Dismiss"} disabled={dismiss.isPending} onClick={() => dismiss.mutate()} className="rounded-md px-1.5 py-0.5 hover:bg-slate-100">
            <span className={`text-xs ${sub}`}>✕</span>
          </button>
        )}
      </div>
      <div
        role="progressbar"
        aria-label={`${job.asset_name}: ${label}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className={`mt-2 h-1.5 overflow-hidden rounded-full ${track}`}
      >
        <div className={`h-full rounded-full transition-[width] duration-1000 ${bar} ${active ? "animate-pulse motion-reduce:animate-none" : ""}`} style={{ width: `${pct}%` }} />
      </div>
      <p className={`mt-1 text-xs ${failed ? "text-red-500" : sub}`}>
        {failed ? (job.error_message ?? "The build failed.") : label}
        {active && job.provider === "blender" && " · usually 2–8 minutes"}
      </p>
      {retry.error && <p role="alert" className="mt-1 text-xs text-red-500">{errorMessage(retry.error)}</p>}
    </li>
  );
}

export function GenerationTray({ dark = false, onOpen, className = "" }: { dark?: boolean; onOpen?: (assetId: string) => void; className?: string }) {
  const jobs = useGenerationJobs();
  const list = jobs.data ?? [];
  const running = list.filter(isActive).length;
  const now = useNow(running > 0);
  if (list.length === 0) return null;
  return (
    <section aria-label="3D models in progress" className={`rounded-xl p-3 ${dark ? "border border-white/10 bg-[#141726]/90" : "bg-slate-50 ring-1 ring-slate-200"} ${className}`}>
      <div className="mb-2 flex items-center gap-2">
        <h2 className={`text-sm font-semibold ${dark ? "text-white" : "text-slate-900"}`}>
          {running ? `Building in the background (${running})` : "Recent 3D generations"}
        </h2>
        <span className={`text-xs ${dark ? "text-slate-500" : "text-slate-500"}`}>You can keep working — this updates by itself.</span>
      </div>
      <ul className="space-y-2" aria-live="polite">
        {list.map((j) => <Row key={j.job_id} job={j} dark={dark} now={now} onOpen={onOpen} />)}
      </ul>
    </section>
  );
}

/** Small badge for headers/step bars: "⟳ 2 building". */
export function BuildingBadge() {
  const jobs = useGenerationJobs();
  const n = (jobs.data ?? []).filter(isActive).length;
  if (!n) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-700 ring-1 ring-teal-200">
      <span aria-hidden className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-teal-300 border-t-teal-700 motion-reduce:animate-none" />
      {n} building
    </span>
  );
}
