/**
 * 3D library: review every part's student-facing description, edit it, let AI write the missing
 * ones, then "Approve all" (approves the model and marks every description reviewed).
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { api, errorMessage } from "@/api/client";
import type { AssetOut, JobOut } from "@/api/generated/schema";
import { Badge, Button } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { useJob } from "@/features/jobs/useJob";

import { partsOf, type PartMeta } from "./StudioTools";

function PartRow({ asset, part }: { asset: AssetOut; part: PartMeta }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ label: part.label, description: part.description });
  useEffect(() => setForm({ label: part.label, description: part.description }), [part.label, part.description]);
  const save = useMutation({
    mutationFn: () => api.patch<AssetOut>(`/assets/${asset.id}/parts/${encodeURIComponent(part.name)}`, form),
    onSuccess: (a) => {
      qc.setQueryData(["asset", asset.id], a);
      setEditing(false);
    },
  });
  const missing = !part.description.trim();
  const draft = !missing && part.source === "ai" && !part.reviewed;

  if (editing) {
    return (
      <li className="space-y-2 bg-slate-50 px-3 py-3">
        <input aria-label={`Label for ${part.name}`} maxLength={200} className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm font-medium" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
        <textarea aria-label={`Description for ${form.label}`} rows={3} maxLength={2000} placeholder="1-3 sentences students read when they click this part." className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <div className="flex items-center gap-2">
          <Button disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : "Save"}</Button>
          <Button variant="secondary" onClick={() => { setEditing(false); save.reset(); }}>Cancel</Button>
          {save.error && <span role="alert" className="text-xs text-red-700">{errorMessage(save.error)}</span>}
        </div>
      </li>
    );
  }
  return (
    <li className="flex items-start gap-3 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium capitalize text-slate-900">
          {part.label}
          {missing && <Badge tone="red">Missing</Badge>}
          {draft && <Badge tone="amber">AI draft</Badge>}
          {!missing && part.reviewed && <Badge tone="green">Reviewed</Badge>}
        </p>
        <p className={`text-sm ${missing ? "italic text-slate-400" : "text-slate-600"}`}>{missing ? "No description yet." : part.description}</p>
      </div>
      {asset.can_manage && (
        <button type="button" onClick={() => setEditing(true)} className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-accent hover:bg-slate-100" aria-label={`Edit ${part.label}`}>
          Edit
        </button>
      )}
    </li>
  );
}

export function DescriptionReview({
  asset,
  onReview,
  reviewing,
}: {
  asset: AssetOut;
  onReview: (decision: "approved" | "rejected") => void;
  reviewing: boolean;
}) {
  const qc = useQueryClient();
  const parts = partsOf(asset);
  const missing = parts.filter((p) => !p.description.trim()).length;
  const drafts = parts.filter((p) => p.description.trim() && p.source === "ai" && !p.reviewed).length;
  const [jobId, setJobId] = useState<string | null>(null);
  const job = useJob(jobId);
  const write = useMutation({
    mutationFn: () => api.post<JobOut>(`/assets/${asset.id}/ai/part-descriptions`),
    onSuccess: (j) => setJobId(j.id),
  });
  useEffect(() => {
    if (job.data?.status === "completed") void qc.invalidateQueries({ queryKey: ["asset", asset.id] });
  }, [job.data?.status, asset.id, qc]);
  const writing = write.isPending || (!!jobId && !["completed", "failed"].includes(job.data?.status ?? ""));
  const approved = asset.review_status === "approved";
  if (parts.length === 0) return null;

  return (
    <section aria-labelledby="part-descriptions" className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="mr-auto">
          <h3 id="part-descriptions" className="text-sm font-semibold text-slate-900">Part descriptions</h3>
          <p className="text-xs text-slate-500">
            What students read when they click a part · {parts.length - missing} of {parts.length} written
            {drafts > 0 && ` · ${drafts} AI draft${drafts === 1 ? "" : "s"} to review`}
            {missing > 0 && ` · ${missing} missing`}
          </p>
        </div>
        {asset.can_manage && missing > 0 && (
          <Button variant="secondary" disabled={writing} onClick={() => write.mutate()}>
            <Icon name="sparkles" size={16} /> {writing ? "Writing…" : `Write ${missing} missing with AI`}
          </Button>
        )}
      </div>
      {(write.error || job.data?.status === "failed") && (
        <p role="alert" className="text-sm text-red-700">{write.error ? errorMessage(write.error) : job.data?.error_message}</p>
      )}
      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
        {parts.map((p) => <PartRow key={p.name} asset={asset} part={p} />)}
      </ul>

      {asset.can_manage && (
        <div className={`flex flex-wrap items-center gap-2 rounded-lg border p-3 ${approved ? "border-green-200 bg-green-50" : "border-slate-200"}`}>
          <span className="mr-auto text-sm text-slate-700">
            {approved
              ? "Approved: the model and its descriptions can be used in lessons."
              : missing > 0
                ? `${missing} part${missing === 1 ? " has" : "s have"} no description yet. Write or generate them, then approve.`
                : drafts > 0
                  ? "Read the AI drafts, edit anything that's wrong, then approve."
                  : "Everything is written. Approve to use this model in lessons."}
          </span>
          <Button disabled={reviewing || (approved && drafts === 0)} onClick={() => onReview("approved")}>
            <Icon name="check" size={16} /> {approved && drafts > 0 ? "Approve new drafts" : "Approve all"}
          </Button>
          <Button variant="secondary" disabled={reviewing || asset.review_status === "rejected"} onClick={() => onReview("rejected")}>Reject</Button>
        </div>
      )}
    </section>
  );
}
