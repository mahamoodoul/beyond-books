/**
 * Chapter Studio, step 3: give one lesson its 3D model, in one organised place.
 *   ✦ Let AI choose  - AI plans a scene: library model, generator, or suggests a new model
 *   From 3D library  - pick an approved model (or review a pending one), add it to the lesson
 *   Generate new     - topic → AI prompt → generator (incl. Claude + Blender) → review
 *                      descriptions → "Approve & add to lesson"
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { api, errorMessage } from "@/api/client";
import type { AssetOut, JobOut, SceneOut } from "@/api/generated/schema";
import { Badge, Button, Input } from "@/components/ui";
import { useJob } from "@/features/jobs/useJob";

import { useAsset, useAssets } from "../api";
import { GeneratePanel } from "../AssetsPage";
import { DescriptionReview } from "../DescriptionReview";
import { specFromAsset } from "../specBuilders";

type Tab = "ai" | "library" | "generate";
interface Plan {
  decision?: string;
  rationale?: string;
  scene_id?: string;
  generation_prompt?: string;
  suggested_name?: string;
}

const SOURCE: Record<string, string> = { blender: "Claude + Blender", llm: "AI designer" };

/** Add an asset to the lesson as a scene (approving it first when asked). */
function useAddToLesson(lessonId: string, onAdded: (sceneId: string) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ asset, approve }: { asset: AssetOut; approve: boolean }) => {
      let a = asset;
      if (approve) a = await api.post<AssetOut>(`/assets/${asset.id}/review`, { decision: "approved" });
      const full = a.versions ? a : await api.get<AssetOut>(`/assets/${a.id}`);
      return api.post<SceneOut>(`/lessons/${lessonId}/scenes`, { spec: { ...specFromAsset(full), title: full.name.slice(0, 200) } });
    },
    onSuccess: (scene) => {
      void qc.invalidateQueries({ queryKey: ["assets"] });
      onAdded(scene.id);
    },
  });
}

/** Review a model's part descriptions, then approve it and add it to the lesson in one click. */
function ReviewAndAdd({ assetId, lessonId, lessonTitle, onAdded, onBack }: { assetId: string; lessonId: string; lessonTitle: string; onAdded: (sceneId: string) => void; onBack: () => void }) {
  const asset = useAsset(assetId);
  const add = useAddToLesson(lessonId, onAdded);
  const qc = useQueryClient();
  const reject = useMutation({
    mutationFn: () => api.post<AssetOut>(`/assets/${assetId}/review`, { decision: "rejected" }),
    onSuccess: (a) => { qc.setQueryData(["asset", assetId], a); onBack(); },
  });
  if (!asset.data) return <p className="text-sm text-slate-500">Loading the model…</p>;
  const a = asset.data;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-sm text-slate-700">
          <strong>{a.name}</strong> is ready. Check what students will read for each part, then approve it to add it to <strong>{lessonTitle}</strong>.
        </p>
        <a href={`/studio/library/${a.id}`} target="_blank" rel="noreferrer" className="text-sm font-medium text-accent hover:underline">Inspect in Studio ↗</a>
      </div>
      <DescriptionReview
        asset={a}
        reviewing={add.isPending || reject.isPending}
        onReview={(d) => (d === "approved" ? add.mutate({ asset: a, approve: true }) : reject.mutate())}
      />
      {a.review_status === "approved" && (
        <Button disabled={add.isPending} onClick={() => add.mutate({ asset: a, approve: false })}>{add.isPending ? "Adding…" : `Add to “${lessonTitle}”`}</Button>
      )}
      {(add.error || reject.error) && <p role="alert" className="text-sm text-red-700">{errorMessage(add.error ?? reject.error)}</p>}
    </div>
  );
}

function LibraryPicker({ lessonId, onAdded, onReview }: { lessonId: string; onAdded: (sceneId: string) => void; onReview: (assetId: string) => void }) {
  const assets = useAssets();
  const [q, setQ] = useState("");
  const add = useAddToLesson(lessonId, onAdded);
  const list = (assets.data ?? [])
    .filter((a) => a.latest_version > 0 && a.review_status !== "rejected")
    .filter((a) => !q.trim() || `${a.name} ${a.subject ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  return (
    <div className="space-y-2">
      <Input aria-label="Search the 3D library" placeholder="Search your 3D library" value={q} onChange={(e) => setQ(e.target.value)} />
      {assets.isPending && <p className="text-sm text-slate-500">Loading…</p>}
      {assets.data && list.length === 0 && <p className="text-sm text-slate-500">No models found. Try “Let AI choose” or “Generate new”.</p>}
      <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-md border border-slate-200">
        {list.map((a) => {
          const approved = a.review_status === "approved";
          return (
            <li key={a.id} className="flex items-center gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900">{a.name}</p>
                <p className="text-xs text-slate-500">{SOURCE[a.provider ?? ""] ?? "Uploaded"} · {new Date(a.created_at).toLocaleDateString()}</p>
              </div>
              <Badge tone={approved ? "green" : "amber"}>{approved ? "Approved" : "Needs review"}</Badge>
              {approved ? (
                <Button disabled={add.isPending} onClick={() => add.mutate({ asset: a, approve: false })}>Add</Button>
              ) : (
                <Button variant="secondary" onClick={() => onReview(a.id)}>Review</Button>
              )}
            </li>
          );
        })}
      </ul>
      {add.error && <p role="alert" className="text-sm text-red-700">{errorMessage(add.error)}</p>}
    </div>
  );
}

function AIChoose({ lessonId, onAdded, onGenerate }: { lessonId: string; onAdded: (sceneId: string) => void; onGenerate: (plan: Plan) => void }) {
  const [jobId, setJobId] = useState<string | null>(null);
  const job = useJob(jobId);
  const start = useMutation({ mutationFn: () => api.post<JobOut>(`/lessons/${lessonId}/ai/scene`), onSuccess: (j) => setJobId(j.id) });
  const plan = job.data?.status === "completed" ? (job.data.result as Plan | null) : null;
  useEffect(() => { if (plan?.scene_id) onAdded(plan.scene_id); }, [plan?.scene_id]); // eslint-disable-line react-hooks/exhaustive-deps
  const running = start.isPending || (!!jobId && !["completed", "failed"].includes(job.data?.status ?? ""));
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-700">The AI reads the lesson and picks the best 3D: a model from your library, a built-in generator, or it suggests a new model to generate.</p>
      <Button disabled={running} onClick={() => start.mutate()}>{running ? "Planning…" : "✦ Let AI choose"}</Button>
      {job.data?.status === "failed" && <p role="alert" className="text-sm text-red-700">{job.data.error_message}</p>}
      {start.error && <p role="alert" className="text-sm text-red-700">{errorMessage(start.error)}</p>}
      {plan && (
        <div className="rounded-md bg-slate-50 p-3 text-sm">
          <p><Badge tone="blue">{plan.decision?.replace(/_/g, " ")}</Badge> {plan.rationale}</p>
          {plan.scene_id && <p className="mt-1 text-green-700">✓ Added a draft 3D scene to this lesson.</p>}
          {plan.decision === "generate_asset" && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-slate-600">Nothing suitable in the library yet.</span>
              <Button onClick={() => onGenerate(plan)}>Generate it now →</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function Add3DPanel({ lessonId, lessonTitle, onAdded, onClose }: { lessonId: string; lessonTitle: string; onAdded: (sceneId: string) => void; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("ai");
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [seed, setSeed] = useState<Plan | null>(null);
  const tabs: { key: Tab; label: string }[] = [
    { key: "ai", label: "✦ AI choose" },
    { key: "library", label: "3D library" },
    { key: "generate", label: "Generate new" },
  ];
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-sm" aria-label={`Add 3D to ${lessonTitle}`}>
      <header className="flex items-start gap-3 border-b border-slate-200 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">Add 3D to lesson</p>
          <h2 className="truncate font-semibold">{lessonTitle}</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900">✕</button>
      </header>
      <div role="tablist" className="grid grid-cols-3 gap-1 border-b border-slate-200 bg-slate-50 p-1.5">
        {tabs.map((t) => {
          const on = tab === t.key && !reviewId;
          return (
            <button key={t.key} role="tab" aria-selected={on} onClick={() => { setTab(t.key); setReviewId(null); }}
              className={`rounded-md px-2 py-1.5 text-xs font-medium transition ${on ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200" : "text-slate-600 hover:text-slate-900"}`}>
              {t.label}
            </button>
          );
        })}
      </div>
      <div className="max-h-[70vh] overflow-y-auto p-4">
        {reviewId ? (
          <ReviewAndAdd assetId={reviewId} lessonId={lessonId} lessonTitle={lessonTitle} onAdded={onAdded} onBack={() => setReviewId(null)} />
        ) : tab === "ai" ? (
          <AIChoose lessonId={lessonId} onAdded={onAdded} onGenerate={(p) => { setSeed(p); setTab("generate"); }} />
        ) : tab === "library" ? (
          <LibraryPicker lessonId={lessonId} onAdded={onAdded} onReview={setReviewId} />
        ) : (
          <GeneratePanel
            key={seed?.generation_prompt ?? "topic"}
            compact
            initialTopic={lessonTitle}
            initialPrompt={seed?.generation_prompt}
            initialName={seed?.suggested_name}
            lessonId={lessonId}
            onCreated={(assetId, sceneId) => (sceneId ? onAdded(sceneId) : setReviewId(assetId))}
          />
        )}
      </div>
    </section>
  );
}
