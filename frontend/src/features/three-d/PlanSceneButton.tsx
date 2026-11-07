import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link } from "react-router";

import { api } from "@/api/client";
import type { GenerationResponse, JobOut } from "@/api/generated/schema";
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
  const [jobId, setJobId] = useState<string | null>(null);
  const job = useJob(jobId);
  const gen = useMutation({
    mutationFn: () => api.post<GenerationResponse>("/assets/generation-jobs", { name, prompt }),
    onSuccess: (r) => setJobId(r.job_id),
  });
  return (
    <div className="mt-3 space-y-2">
      <p className="font-medium">No suitable model exists. Generate one? This uses 3D provider credits.</p>
      <Input aria-label="Model name" value={name} onChange={(e) => setName(e.target.value)} />
      <Textarea aria-label="Generation prompt" rows={2} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      <Button variant="secondary" disabled={gen.isPending || !!jobId} onClick={() => gen.mutate()}>Generate model</Button>
      <ErrorAlert error={gen.error} />
      <JobStatusLine job={job.data} label="Generation:" />
      {job.data?.status === "completed" && (
        <p>Model generated and waiting for review in the <Link className="underline" to="/teacher/assets">3D library</Link>. Approve it, then create a scene from it.</p>
      )}
    </div>
  );
}
