import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { EmptyState, ErrorAlert, Loading } from "@/components/feedback";
import { Badge, Button, Card, Input, Textarea } from "@/components/ui";
import { JobStatusLine } from "@/features/jobs/JobStatus";
import { useJob } from "@/features/jobs/useJob";
import { plural } from "@/lib/plural";

import {
  useAIUsage,
  useOutlineProposals,
  useProposalActions,
  useStartOutline,
  type ProposalChapter,
  type ProposalOutput,
  type ValidationInfo,
} from "./api";

interface Draft extends ProposalChapter {
  include: boolean;
  objectivesText: string;
}

export function OutlinePanel({ courseId, onApplied }: { courseId: string; onApplied?: () => void }) {
  const qc = useQueryClient();
  const proposals = useOutlineProposals(courseId);
  const usage = useAIUsage(courseId);
  const start = useStartOutline(courseId);
  const actions = useProposalActions(courseId);
  const [jobId, setJobId] = useState<string | null>(null);
  const job = useJob(jobId);
  const proposal = proposals.data?.find((p) => p.status === "proposed");
  const [drafts, setDrafts] = useState<Draft[]>([]);

  useEffect(() => {
    if (job.data?.status === "completed") {
      void qc.invalidateQueries({ queryKey: ["outline-proposals", courseId] });
      void qc.invalidateQueries({ queryKey: ["ai-usage", courseId] });
    }
  }, [job.data?.status, qc, courseId]);

  useEffect(() => {
    const out = proposal?.output as ProposalOutput | undefined;
    setDrafts(
      (out?.chapters ?? []).map((c) => ({
        ...c,
        include: true,
        objectivesText: c.objectives.map((o) => o.text).join("\n"),
      })),
    );
  }, [proposal?.id]);

  const set = (i: number, patch: Partial<Draft>) => setDrafts(drafts.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const validation = (proposal?.validation ?? {}) as ValidationInfo;
  const busy = start.isPending || (!!job.data && !["completed", "failed"].includes(job.data.status));

  const apply = () => {
    if (!proposal) return;
    const chapters = drafts
      .filter((d) => d.include && d.title.trim())
      .map((d) => ({
        title: d.title,
        description: d.description,
        source_refs: d.source_refs,
        objectives: d.objectivesText.split("\n").map((x) => x.trim()).filter(Boolean),
      }));
    actions.apply.mutate({ id: proposal.id, chapters }, { onSuccess: () => onApplied?.() });
  };

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">AI chapter outline</h2>
          <p className="text-sm text-slate-500">
            AI proposes chapters from your ready sources. Nothing is created until you review and apply it.
          </p>
        </div>
        <Button disabled={busy} onClick={() => start.mutate(undefined, { onSuccess: (j) => setJobId(j.id) })}>
          {busy ? "Generating…" : proposal ? "Generate new outline" : "Generate outline"}
        </Button>
      </div>
      <ErrorAlert error={start.error ?? actions.apply.error ?? actions.discard.error} />
      <JobStatusLine job={job.data} label="Outline generation:" />
      {usage.data && usage.data.calls > 0 && (
        <p className="mt-2 text-xs text-slate-500">
          AI usage for this course: {plural(usage.data.calls, "call")}, {usage.data.input_tokens.toLocaleString()} input /{" "}
          {usage.data.output_tokens.toLocaleString()} output tokens
          {usage.data.estimated_cost_usd != null && ` · ≈ $${usage.data.estimated_cost_usd.toFixed(3)}`}
        </p>
      )}
      {proposals.isPending && <Loading />}
      {!proposals.isPending && !proposal && <div className="mt-4"><EmptyState title="No outline to review" /></div>}
      {proposal && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge tone="blue">Proposed by {proposal.model}</Badge>
            <Badge>prompt {proposal.prompt_id}@{proposal.prompt_version}</Badge>
            {(validation.warnings ?? []).map((w) => <Badge key={w} tone="amber">{w}</Badge>)}
          </div>
          {drafts.map((d, i) => (
            <div key={i} className={`rounded-md border p-3 ${d.include ? "border-slate-200" : "border-dashed border-slate-200 opacity-50"}`}>
              <div className="flex items-center gap-2">
                <input type="checkbox" aria-label={`Include chapter ${i + 1}`} checked={d.include} onChange={(e) => set(i, { include: e.target.checked })} />
                <Input aria-label={`Chapter ${i + 1} title`} value={d.title} onChange={(e) => set(i, { title: e.target.value })} />
                {d.source_refs.length ? (
                  d.source_refs.map((r, k) => <Badge key={k}>pp. {r.page_start}–{r.page_end}</Badge>)
                ) : (
                  <Badge tone="amber">no source</Badge>
                )}
              </div>
              <Input className="mt-2" aria-label={`Chapter ${i + 1} description`} value={d.description} onChange={(e) => set(i, { description: e.target.value })} />
              <Textarea aria-label={`Chapter ${i + 1} objectives`} rows={3} value={d.objectivesText} onChange={(e) => set(i, { objectivesText: e.target.value })} />
            </div>
          ))}
          <div className="flex gap-2">
            <Button disabled={actions.apply.isPending || !drafts.some((d) => d.include)} onClick={apply}>
              Apply {plural(drafts.filter((d) => d.include).length, "chapter")}
            </Button>
            <Button variant="secondary" onClick={() => actions.discard.mutate(proposal.id)}>Discard</Button>
          </div>
        </div>
      )}
    </Card>
  );
}
