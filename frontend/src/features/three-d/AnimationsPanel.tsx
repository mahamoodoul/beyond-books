import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { api, ApiError } from "@/api/client";
import type { AnimationOut, AnimationSpec, JobOut } from "@/api/generated/schema";
import { ErrorAlert, Loading } from "@/components/feedback";
import { Badge, Button, Textarea } from "@/components/ui";
import { JobStatusLine } from "@/features/jobs/JobStatus";
import { useJob } from "@/features/jobs/useJob";

const details = (e: unknown) => (e instanceof ApiError ? e.details.map((d) => (d as { msg?: string }).msg ?? "") : []);

const TEMPLATE = (firstComponent: string): AnimationSpec => ({
  schema_version: "1.0",
  animation_id: `tour_${Math.random().toString(36).slice(2, 7)}`,
  title: "Guided tour",
  steps: [
    { step: 1, action: "camera_focus", target_component: firstComponent, duration_ms: 1500, explanation: "Let's look closer." },
    { step: 2, action: "highlight_component", target_component: firstComponent, duration_ms: 2500, explanation: "This part is highlighted." },
  ],
});

export function AnimationsPanel({ sceneId, lessonId, firstComponent }: { sceneId: string; lessonId: string; firstComponent?: string }) {
  const qc = useQueryClient();
  const key = ["animations", sceneId];
  const list = useQuery({ queryKey: key, queryFn: () => api.get<AnimationOut[]>(`/scenes/${sceneId}/animations`) });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: key });
    void qc.invalidateQueries({ queryKey: ["scenes", lessonId] });
    void qc.invalidateQueries({ queryKey: ["scene-resolved", sceneId] });
  };
  const [editing, setEditing] = useState<{ id: string | null; version: number; json: string } | null>(null);
  const [parseErr, setParseErr] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const job = useJob(jobId);
  const suggest = useMutation({ mutationFn: () => api.post<JobOut>(`/scenes/${sceneId}/ai/animation`), onSuccess: (j) => setJobId(j.id) });
  const save = useMutation({
    mutationFn: (b: { id: string | null; version: number; spec: AnimationSpec }) =>
      b.id ? api.patch<AnimationOut>(`/animations/${b.id}`, { expected_version: b.version, spec: b.spec }) : api.post<AnimationOut>(`/scenes/${sceneId}/animations`, { spec: b.spec }),
    onSuccess: () => {
      setEditing(null);
      refresh();
    },
  });
  const remove = useMutation({ mutationFn: (id: string) => api.delete<void>(`/animations/${id}`), onSuccess: refresh });
  useEffect(() => {
    if (job.data?.status === "completed") refresh();
  }, [job.data?.status]);

  const submit = () => {
    if (!editing) return;
    try {
      const spec = JSON.parse(editing.json) as AnimationSpec;
      setParseErr(null);
      save.mutate({ id: editing.id, version: editing.version, spec });
    } catch (e) {
      setParseErr((e as Error).message);
    }
  };

  return (
    <div className="mt-3 rounded-md border border-slate-200 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">Animations <span className="font-normal text-slate-500">(published together with the scene)</span></p>
        <div className="flex gap-1">
          <Button variant="secondary" disabled={suggest.isPending} onClick={() => suggest.mutate()}>✦ Suggest animation</Button>
          <Button variant="ghost" disabled={!firstComponent} onClick={() => setEditing({ id: null, version: 0, json: JSON.stringify(TEMPLATE(firstComponent ?? ""), null, 2) })}>New</Button>
        </div>
      </div>
      <JobStatusLine job={job.data?.status === "completed" ? undefined : job.data} label="Animation planning:" />
      <ErrorAlert error={suggest.error ?? remove.error} />
      {list.isPending && <Loading />}
      <ul className="space-y-1 text-sm">
        {list.data?.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center gap-2">
            <span>{a.title}</span>
            <Badge>{a.spec.steps.length} steps</Badge>
            {a.origin === "ai" && <Badge tone="blue">AI</Badge>}
            {(a.problems ?? []).map((p) => <Badge key={p} tone="red">{p}</Badge>)}
            <Button variant="ghost" onClick={() => setEditing({ id: a.id, version: a.version, json: JSON.stringify(a.spec, null, 2) })}>Edit</Button>
            <Button variant="ghost" onClick={() => remove.mutate(a.id)}>Delete</Button>
          </li>
        ))}
      </ul>
      {editing && (
        <div className="mt-2 space-y-2">
          <Textarea rows={14} spellCheck={false} aria-label="Animation specification JSON" value={editing.json} onChange={(e) => setEditing({ ...editing, json: e.target.value })} />
          {parseErr && <p className="text-sm text-red-700">Invalid JSON: {parseErr}</p>}
          <ErrorAlert error={save.error} />
          {details(save.error).map((d) => <p key={d} className="text-sm text-red-700">• {d}</p>)}
          <div className="flex gap-2">
            <Button disabled={save.isPending} onClick={submit}>Save animation</Button>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}
