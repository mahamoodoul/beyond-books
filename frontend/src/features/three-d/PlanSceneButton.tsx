import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link } from "react-router";

import { useQuery } from "@tanstack/react-query";

import { api, errorMessage } from "@/api/client";
import type { GenerationResponse, JobOut, ProviderHealthOut, ThreeDProviderOut } from "@/api/generated/schema";
import { ErrorAlert } from "@/components/feedback";
import { Badge, Button, Input, Textarea } from "@/components/ui";
import { JobStatusLine } from "@/features/jobs/JobStatus";
import { useJob } from "@/features/jobs/useJob";

interface PlanResult {
  decision?: string;
  rationale?: string;
  scene_id?: string;
  generation_prompt?: string;
  suggested_name?: string;
}

/** AI scene planning: reuse a library model, use a generator, or SUGGEST generation (teacher decides). */
export function PlanSceneButton({ lessonId }: { lessonId: string }) {
  const qc = useQueryClient();
  const [jobId, setJobId] = useState<string | null>(null);
  const job = useJob(jobId);
  const start = useMutation({ mutationFn: () => api.post<JobOut>(`/lessons/${lessonId}/ai/scene`) });
  const result = (job.data?.status === "completed" ? job.data.result : null) as PlanResult | null;
  const running = start.isPending || (!!job.data && !["completed", "failed"].includes(job.data.status));

  useEffect(() => {
    if (result?.scene_id) void qc.invalidateQueries({ queryKey: ["scenes", lessonId] });
  }, [result?.scene_id, lessonId, qc]);

  return (
    <div className="space-y-2">
      <Button disabled={running} onClick={() => start.mutate(undefined, { onSuccess: (j) => setJobId(j.id) })}>
        {running ? "Planning…" : "✦ Suggest a 3D scene"}
      </Button>
      <ErrorAlert error={start.error} />
      <JobStatusLine job={job.data?.status === "completed" ? undefined : job.data} label="Scene planning:" />
      {result && (
        <div className="rounded-md bg-blue-50 p-3 text-sm">
          <p><Badge tone="blue">{result.decision?.replace("_", " ")}</Badge> {result.rationale}</p>
          {result.scene_id && <p className="mt-1">A draft scene was added below — preview, edit and publish it when ready.</p>}
          {result.decision === "generate_asset" && result.generation_prompt && (
            <GenerateSuggested prompt={result.generation_prompt} name={result.suggested_name ?? "Generated model"} />
          )}
        </div>
      )}
    </div>
  );
}

const PROVIDER_LABELS: Record<string, string> = {
  blender: "Claude + Blender (local Blender MCP)",
  llm: "AI designer (three.js primitives)",
  fake: "Offline test generator",
};

/** Is the chosen provider ready right now? (Blender must be open with its MCP add-on running.) */
function ProviderHealth({ name }: { name: string }) {
  const health = useQuery({
    queryKey: ["provider-health", name],
    queryFn: () => api.get<ProviderHealthOut>(`/three-d/provider-health?name=${encodeURIComponent(name)}`),
    enabled: name === "blender",
    refetchInterval: (q) => (q.state.data?.ok ? false : 5000),
  });
  if (name !== "blender" || !health.data) return null;
  return (
    <p role="status" className={`text-xs ${health.data.ok ? "text-green-700" : "text-amber-700"}`}>
      {health.data.ok ? "● " : "○ "}{health.data.message}
    </p>
  );
}

/** Live "building in Blender" status with elapsed time (builds take minutes). */
function BuildProgress({ since }: { since?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const secs = since ? Math.max(0, Math.round((now - new Date(since).getTime()) / 1000)) : 0;
  const elapsed = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  return (
    <div role="status" className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
      <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-blue-300 border-t-blue-700 motion-reduce:animate-none" />
      <span className="flex-1">Claude is building the model in Blender. Usually 2–8 minutes; you can keep working.</span>
      <span className="font-mono tabular-nums">{elapsed}</span>
    </div>
  );
}

export function GenerateSuggested({
  prompt: initialPrompt,
  name: initialName,
  onDone,
  draftId,
  lessonId,
}: {
  prompt: string;
  name: string;
  onDone?: (assetId: string, sceneId?: string) => void;
  /** Chapter Studio: the finished model is saved straight into this lesson as a draft scene. */
  lessonId?: string;
  /** Saved prompt being edited: "Save prompt" stores edits, and Generate saves them first. */
  draftId?: string;
}) {
  const qc = useQueryClient();
  const [prompt, setPrompt] = useState(initialPrompt);
  const [name, setName] = useState(initialName);
  const providers = useQuery({ queryKey: ["three-d-providers"], queryFn: () => api.get<ThreeDProviderOut[]>("/three-d/providers"), staleTime: 60_000 });
  const [provider, setProvider] = useState<string>("");
  const chosen = provider || providers.data?.find((p) => p.is_default)?.name || providers.data?.[0]?.name || "";
  const [jobId, setJobId] = useState<string | null>(null);
  const [usedProvider, setUsedProvider] = useState("");
  const job = useJob(jobId);
  const [saved, setSaved] = useState({ prompt: initialPrompt, name: initialName });
  const dirty = !!draftId && (prompt !== saved.prompt || name !== saved.name);
  const saveDraft = useMutation({
    mutationFn: () => api.patch<unknown>(`/three-d/prompt-drafts/${draftId}`, { title: name.trim() || undefined, prompt }),
    onSuccess: () => {
      setSaved({ prompt, name });
      void qc.invalidateQueries({ queryKey: ["prompt-drafts"] });
    },
  });
  const gen = useMutation({
    mutationFn: async () => {
      if (dirty) await saveDraft.mutateAsync(); // keep the saved prompt in sync with what was built
      return api.post<GenerationResponse>("/assets/generation-jobs", { name, prompt, provider: chosen || null, lesson_id: lessonId ?? null });
    },
    onSuccess: (r) => {
      setJobId(r.job_id);
      setUsedProvider(chosen);
      void qc.invalidateQueries({ queryKey: ["generation-jobs"] });
    },
  });
  const done = job.data?.result as { asset_id?: string; scene_id?: string } | null;
  const assetId = done?.asset_id;
  useEffect(() => {
    if (job.data?.status === "completed" && assetId) {
      void qc.invalidateQueries({ queryKey: ["assets"] });
      void qc.invalidateQueries({ queryKey: ["generation-jobs"] });
      onDone?.(assetId, done?.scene_id ?? undefined);
    }
  }, [job.data?.status, assetId]); // eslint-disable-line react-hooks/exhaustive-deps
  const running = !!jobId && !["completed", "failed", "cancelled"].includes(job.data?.status ?? "");
  const building = running && usedProvider === "blender";

  return (
    <div className="mt-3 space-y-2">
      <p className="font-medium">Generate a new 3D model? This uses AI provider tokens or credits.</p>
      <Input aria-label="Model name" value={name} onChange={(e) => setName(e.target.value)} />
      <Textarea
        aria-label="Generation prompt"
        rows={prompt.length > 600 ? 14 : 5}
        maxLength={8000}
        placeholder="Describe the object in detail: which parts students should explore, their shapes, positions, colours, audience level…"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
      />
      <div className="flex items-center justify-end gap-3 text-xs text-slate-500">
        {draftId && (
          dirty ? (
            <button type="button" disabled={saveDraft.isPending} onClick={() => saveDraft.mutate()} className="rounded-md border border-slate-300 bg-white px-2 py-0.5 font-medium text-slate-700 hover:bg-slate-50">
              {saveDraft.isPending ? "Saving…" : "Save prompt"}
            </button>
          ) : (
            <span className="text-green-700">✓ Saved prompt</span>
          )
        )}
        <span>{prompt.length}/8000</span>
      </div>
      {saveDraft.error && <p role="alert" className="text-xs text-red-700">{errorMessage(saveDraft.error)}</p>}
      <label className="flex items-center gap-2 text-sm">
        Generator
        <select className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm" value={chosen} onChange={(e) => setProvider(e.target.value)}>
          {providers.data?.map((p) => (
            <option key={p.name} value={p.name} title={p.description}>
              {PROVIDER_LABELS[p.name] ?? p.name}{p.is_default ? " — default" : ""}
            </option>
          ))}
        </select>
      </label>
      {providers.data?.find((p) => p.name === chosen)?.description && (
        <p className="text-xs text-slate-500">{providers.data.find((p) => p.name === chosen)?.description}</p>
      )}
      <ProviderHealth name={chosen} />
      <ErrorAlert error={providers.error} />
      <Button variant="secondary" disabled={gen.isPending || running || providers.isPending || !!providers.error || !chosen || !name.trim() || prompt.trim().length < 5} onClick={() => gen.mutate()}>
        {running ? "Generating…" : "Generate model"}
      </Button>
      <ErrorAlert error={gen.error} />
      {building ? (
        <BuildProgress since={job.data?.created_at} />
      ) : (
        <JobStatusLine job={job.data} label="Generation:" />
      )}
      {lessonId && running && (
        <p className="text-xs text-slate-500">It's saved into this lesson automatically when it finishes, so you can close this panel and keep working.</p>
      )}
      {job.data?.status === "completed" && !lessonId && (
        <p>
          Model generated and waiting for review in the <Link className="underline" to="/teacher/assets">3D library</Link>.{" "}
          {assetId && <Link className="font-medium underline" to={`/studio/library/${assetId}`}>Open it in the Studio</Link>}
        </p>
      )}
    </div>
  );
}
