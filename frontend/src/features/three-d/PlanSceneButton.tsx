import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link } from "react-router";

import { useQuery } from "@tanstack/react-query";

import { api } from "@/api/client";
import type { GenerationResponse, JobOut, ThreeDProviderOut } from "@/api/generated/schema";
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

export function GenerateSuggested({ prompt: initialPrompt, name: initialName }: { prompt: string; name: string }) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [name, setName] = useState(initialName);
  const providers = useQuery({ queryKey: ["three-d-providers"], queryFn: () => api.get<ThreeDProviderOut[]>("/three-d/providers"), staleTime: 60_000 });
  const [provider, setProvider] = useState<string>("");
  const chosen = provider || providers.data?.find((p) => p.is_default)?.name || providers.data?.[0]?.name || "";
  const [jobId, setJobId] = useState<string | null>(null);
  const job = useJob(jobId);
  const gen = useMutation({
    mutationFn: () => api.post<GenerationResponse>("/assets/generation-jobs", { name, prompt, provider: chosen || null }),
    onSuccess: (r) => setJobId(r.job_id),
  });
  return (
    <div className="mt-3 space-y-2">
      <p className="font-medium">Generate a new 3D model? This uses AI provider tokens or credits.</p>
      <Input aria-label="Model name" value={name} onChange={(e) => setName(e.target.value)} />
      <Textarea
        aria-label="Generation prompt"
        rows={5}
        maxLength={2000}
        placeholder="Describe the object in detail: which parts students should explore, their shapes, positions, colours, audience level…"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
      />
      <label className="flex items-center gap-2 text-sm">
        Generator
        <select className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm" value={chosen} onChange={(e) => setProvider(e.target.value)}>
          {providers.data?.map((p) => (
            <option key={p.name} value={p.name} title={p.description}>
              {p.name === "llm" ? "AI designer (three.js primitives)" : p.name}{p.is_default ? " — default" : ""}
            </option>
          ))}
        </select>
      </label>
      {providers.data?.find((p) => p.name === chosen)?.description && (
        <p className="text-xs text-slate-500">{providers.data.find((p) => p.name === chosen)?.description}</p>
      )}
      <ErrorAlert error={providers.error} />
      <Button variant="secondary" disabled={gen.isPending || (!!jobId && !["failed", "cancelled"].includes(job.data?.status ?? "")) || providers.isPending || !!providers.error || !chosen || !name.trim() || prompt.trim().length < 5} onClick={() => gen.mutate()}>Generate model</Button>
      <ErrorAlert error={gen.error} />
      <JobStatusLine job={job.data} label="Generation:" />
      {job.data?.status === "completed" && (
        <p>Model generated and waiting for review in the <Link className="underline" to="/teacher/assets">3D library</Link>. Approve it, then create a scene from it.</p>
      )}
    </div>
  );
}
