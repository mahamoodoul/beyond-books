/**
 * 3D viewer: in-depth AI study card for the focused part of a 3D-library model.
 * Cards are cached per model version on the server, so a part already explained shows instantly.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";

import { api, errorMessage } from "@/api/client";
import type { JobOut } from "@/api/generated/schema";
import { useJob } from "@/features/jobs/useJob";

export interface DeepDiveCard {
  summary: string;
  structure: string;
  function: string;
  connections: { part: string; relationship: string }[];
  analogy: string;
  misconception: string;
  fact: string;
  check_question: string;
  check_answer: string;
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      <div className="mt-0.5 text-sm text-slate-800">{children}</div>
    </div>
  );
}

export function PartDeepDive({
  assetId,
  part,
  cached,
  labelFor,
  onInspect,
  readOnly = false,
}: {
  assetId: string;
  part: string;
  cached?: DeepDiveCard;
  labelFor: (meshName: string) => string;
  onInspect: (meshName: string) => void;
  /** Students: show a cached card only, never ask the AI. */
  readOnly?: boolean;
}) {
  const qc = useQueryClient();
  const [jobId, setJobId] = useState<string | null>(null);
  const [answer, setAnswer] = useState(false);
  const job = useJob(jobId);
  const start = useMutation({
    mutationFn: () => api.post<JobOut>(`/assets/${assetId}/ai/part-deep-dive`, { part }),
    onSuccess: (j) => setJobId(j.id),
  });
  const fresh = job.data?.status === "completed" ? ((job.data.result as { card?: DeepDiveCard } | null)?.card ?? null) : null;
  useEffect(() => {
    if (fresh) void qc.invalidateQueries({ queryKey: ["asset", assetId] }); // pick up the cached card
  }, [fresh, assetId, qc]);
  const card = cached ?? fresh;
  const running = start.isPending || (!!jobId && !["completed", "failed"].includes(job.data?.status ?? ""));

  if (!card && readOnly) return null;
  if (!card) {
    return (
      <div className="mt-3 border-t border-slate-100 pt-3">
        <button
          type="button"
          disabled={running}
          onClick={() => start.mutate()}
          className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-navy-900 px-3 py-2 text-sm font-medium text-white hover:bg-navy-700 disabled:opacity-60"
        >
          {running ? (
            <>
              <span aria-hidden className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white motion-reduce:animate-none" />
              Writing an in-depth explanation…
            </>
          ) : (
            "✦ Explain in depth"
          )}
        </button>
        {(start.error || job.data?.status === "failed") && (
          <p role="alert" className="mt-2 text-sm text-red-700">
            {start.error ? errorMessage(start.error) : (job.data?.error_message ?? "The AI could not explain this part.")}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="mt-3 max-h-[26rem] space-y-3 overflow-y-auto border-t border-slate-100 pt-3" aria-label="In-depth explanation">
      <p className="text-sm font-medium text-slate-900">{card.summary}</p>
      {card.structure && <Block title="Structure">{card.structure}</Block>}
      {card.function && <Block title="What it does">{card.function}</Block>}
      {card.connections.length > 0 && (
        <Block title="Works with">
          <ul className="mt-1 space-y-1.5">
            {card.connections.map((c) => (
              <li key={c.part}>
                <button type="button" onClick={() => onInspect(c.part)} className="font-medium text-accent hover:underline">
                  {labelFor(c.part)} →
                </button>
                <span className="block text-slate-700">{c.relationship}</span>
              </li>
            ))}
          </ul>
        </Block>
      )}
      {card.analogy && <Block title="Think of it like">{card.analogy}</Block>}
      {card.misconception && <Block title="Common mistake">{card.misconception}</Block>}
      {card.fact && <Block title="Did you know?">{card.fact}</Block>}
      {card.check_question && (
        <div className="rounded-md bg-amber-50 p-2.5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-800">Check yourself</h3>
          <p className="mt-0.5 text-sm text-slate-900">{card.check_question}</p>
          {answer ? (
            <p className="mt-1 text-sm text-slate-700">{card.check_answer}</p>
          ) : (
            <button type="button" onClick={() => setAnswer(true)} className="mt-1 text-xs font-medium text-amber-900 underline">
              Show answer
            </button>
          )}
        </div>
      )}
      {!readOnly && <p className="text-xs text-slate-400">AI-written study notes — check before teaching.</p>}
    </div>
  );
}
