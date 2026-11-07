import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router";

import { api } from "@/api/client";
import type { AssetOut, JobOut, PromptDraftOut } from "@/api/generated/schema";
import { EmptyState, ErrorAlert, Loading } from "@/components/feedback";
import { Badge, Button, Field, Input, PageHeader } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { useJob } from "@/features/jobs/useJob";

import { uploadAssetFile, useAsset, useAssets } from "./api";
import { DescriptionReview } from "./DescriptionReview";
import { GenerationTray } from "./GenerationTray";
import { GenerateSuggested } from "./PlanSceneButton";

const AssetPreview = lazy(() => import("./components/AssetPreview"));

const STATUS = {
  approved: { tone: "green", label: "Approved" },
  pending: { tone: "amber", label: "Needs review" },
  rejected: { tone: "red", label: "Rejected" },
} as const;
const SOURCE: Record<string, string> = { blender: "Claude + Blender", llm: "AI designer", fake: "Test generator", upload: "Uploaded" };
type Filter = "all" | "pending" | "approved" | "rejected" | "empty";

const fmtDate = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
/** "Today 15:14", "Yesterday 09:02", or "7 Nov 2026, 15:14". */
function created(iso: string): string {
  const d = new Date(iso);
  const day = (x: Date) => x.toDateString();
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const yesterday = new Date(Date.now() - 86_400_000);
  if (day(d) === day(new Date())) return `Today ${time}`;
  if (day(d) === day(yesterday)) return `Yesterday ${time}`;
  return fmtDate.format(d);
}

function statusOf(a: AssetOut) {
  return STATUS[a.review_status as keyof typeof STATUS] ?? { tone: "slate" as const, label: a.review_status };
}

/* ------------------------------------------------------------------ upload */
function UploadForm({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({ name: "", license_name: "", attribution_text: "", source_url: "", subject: "" });
  const [file, setFile] = useState<File | null>(null);
  const qc = useQueryClient();
  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Choose a .glb file.");
      const asset = await api.post<AssetOut>("/assets", { ...form, source_url: form.source_url || null, subject: form.subject || null });
      return uploadAssetFile(asset.id, file);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["assets"] });
      onDone();
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    upload.mutate();
  };
  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <Field label="Name"><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
      <Field label="Subject"><Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Biology" /></Field>
      <Field label="License" hint="e.g. CC-BY-4.0, CC0-1.0, or your own work."><Input required value={form.license_name} onChange={(e) => setForm({ ...form, license_name: e.target.value })} /></Field>
      <Field label="Source URL (optional)"><Input type="url" value={form.source_url} onChange={(e) => setForm({ ...form, source_url: e.target.value })} /></Field>
      <Field label="Attribution"><Input value={form.attribution_text} onChange={(e) => setForm({ ...form, attribution_text: e.target.value })} placeholder="Author name, title" /></Field>
      <Field label="Model file (.glb)" hint="Binary glTF 2.0, everything embedded, max 30 MB.">
        <input type="file" accept=".glb,model/gltf-binary" required onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" />
      </Field>
      <div className="flex items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={upload.isPending}>{upload.isPending ? "Uploading & validating…" : "Upload model"}</Button>
        <ErrorAlert error={upload.error} />
      </div>
    </form>
  );
}

/* ---------------------------------------------------------------- generate */
interface PromptDraft {
  title: string;
  prompt: string;
  parts: { name: string; label: string; description: string }[];
  draft_id?: string;
}

/** Saved AI-written prompts (newest first), matching the topic being typed. */
function SavedPrompts({ topic, activeId, onUse }: { topic: string; activeId?: string; onUse: (d: PromptDraftOut) => void }) {
  const qc = useQueryClient();
  const q = topic.trim().length >= 2 ? topic.trim() : "";
  const drafts = useQuery({
    queryKey: ["prompt-drafts", q],
    queryFn: () => api.get<PromptDraftOut[]>(`/three-d/prompt-drafts${q ? `?topic=${encodeURIComponent(q)}` : ""}`),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete<void>(`/three-d/prompt-drafts/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["prompt-drafts"] }),
  });
  const list = (drafts.data ?? []).slice(0, q ? 5 : 3);
  if (list.length === 0) return null;
  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-white" aria-label="Saved prompts">
      <p className="border-b border-slate-100 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {q ? `Saved prompts for “${q}”` : "Recent saved prompts"} · reuse instead of writing a new one
      </p>
      <ul className="divide-y divide-slate-100">
        {list.map((d) => (
          <li key={d.id} className={`flex items-center gap-2 px-3 py-2 ${d.id === activeId ? "bg-teal-50" : ""}`}>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-900">{d.title}</p>
              <p className="truncate text-xs text-slate-500">
                {d.topic}{d.level ? ` · ${d.level}` : ""} · {d.parts.length} parts · {new Date(d.updated_at).toLocaleDateString()}{d.edited ? " · edited" : ""}
              </p>
            </div>
            {d.id === activeId ? (
              <span className="text-xs font-medium text-teal-700">In use</span>
            ) : (
              <button type="button" onClick={() => onUse(d)} className="rounded-md bg-navy-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-navy-700">Use</button>
            )}
            <button type="button" aria-label={`Delete saved prompt ${d.title}`} disabled={remove.isPending} onClick={() => confirm(`Delete the saved prompt "${d.title}"?`) && remove.mutate(d.id)} className="rounded-md px-1.5 py-1 text-xs text-slate-400 hover:bg-red-50 hover:text-red-700">✕</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

const TOPIC_IDEAS = ["human heart", "plant cell", "human brain", "DNA double helix", "volcano cross-section", "solar system"];

function Steps({ current }: { current: 1 | 2 | 3 }) {
  const steps = ["Topic", "Prompt", "Build"];
  return (
    <ol className="mb-5 flex items-center gap-2 text-sm" aria-label="Steps">
      {steps.map((s, i) => {
        const n = i + 1;
        const state = n < current ? "done" : n === current ? "now" : "next";
        return (
          <li key={s} className="flex items-center gap-2" aria-current={state === "now" ? "step" : undefined}>
            <span className={`grid h-6 w-6 place-items-center rounded-full text-xs font-semibold ${state === "done" ? "bg-green-600 text-white" : state === "now" ? "bg-navy-900 text-white" : "bg-slate-200 text-slate-500"}`}>
              {state === "done" ? "✓" : n}
            </span>
            <span className={state === "next" ? "text-slate-400" : "font-medium text-slate-800"}>{s}</span>
            {n < steps.length && <span aria-hidden className="mx-1 h-px w-8 bg-slate-300" />}
          </li>
        );
      })}
    </ol>
  );
}

/** Topic → AI-written prompt → generate. Also used inside the Chapter Studio (3D step). */
export function GeneratePanel({
  onCreated,
  initialTopic = "",
  initialPrompt,
  initialName,
  compact = false,
  lessonId,
}: {
  onCreated: (assetId: string, sceneId?: string) => void;
  /** Chapter Studio: save the finished model straight into this lesson. */
  lessonId?: string;
  /** Narrow side-panel layout (Chapter Studio): fields stack, fewer suggestions. */
  compact?: boolean;
  initialTopic?: string;
  /** e.g. the AI scene plan's suggested prompt: skips straight to review + generate. */
  initialPrompt?: string;
  initialName?: string;
}) {
  const [topic, setTopic] = useState(initialTopic);
  const [more, setMore] = useState(false);
  const [extra, setExtra] = useState({ subject: "", level: "", focus: "" });
  const [searched, setSearched] = useState("");
  const [draftJobId, setDraftJobId] = useState<string | null>(null);
  const [manual, setManual] = useState(!!initialPrompt);
  const draftJob = useJob(draftJobId);
  const existing = useQuery({
    queryKey: ["asset-search", searched],
    queryFn: () => api.get<AssetOut[]>(`/assets/search?q=${encodeURIComponent(searched)}`),
    enabled: searched.length > 2,
  });
  const draft = useMutation({
    mutationFn: () =>
      api.post<JobOut>("/three-d/prompt-drafts", {
        topic: topic.trim(),
        subject: extra.subject.trim() || null,
        level: extra.level.trim() || null,
        focus: extra.focus.trim() || null,
      }),
    onSuccess: (j) => { setDraftJobId(j.id); setSearched(topic.trim()); setManual(false); setPicked(null); },
  });
  const drafting = draft.isPending || (!!draftJob.data && !["completed", "failed"].includes(draftJob.data.status));
  const [picked, setPicked] = useState<PromptDraft | null>(null);
  const fresh = draftJob.data?.status === "completed" ? (draftJob.data.result as unknown as PromptDraft) : null;
  const result = picked ?? fresh;
  const qc = useQueryClient();
  useEffect(() => {
    if (fresh) void qc.invalidateQueries({ queryKey: ["prompt-drafts"] }); // the new prompt was saved
  }, [fresh, qc]);
  const step: 1 | 2 = result || manual ? 2 : 1;

  return (
    <div>
      {!compact && <Steps current={step} />}
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (topic.trim().length > 1) draft.mutate(); }}>
        <label htmlFor="topic" className="block text-sm font-medium text-slate-700">What should students explore?</label>
        <div className={`flex flex-col gap-2 ${compact ? "" : "sm:flex-row"}`}>
          <Input id="topic" className="text-base sm:flex-1" required minLength={2} maxLength={200} placeholder="e.g. human brain" value={topic} onChange={(e) => setTopic(e.target.value)} />
          <Button type="submit" disabled={drafting || topic.trim().length < 2}>
            <Icon name="sparkles" size={16} /> {drafting ? "Writing prompt…" : result ? "Rewrite prompt" : "Write prompt with AI"}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {(compact ? [] : TOPIC_IDEAS).map((t) => (
            <button key={t} type="button" onClick={() => setTopic(t)} className={`rounded-full border px-2.5 py-0.5 text-xs transition ${topic === t ? "border-navy-900 bg-navy-900 text-white" : "border-slate-300 text-slate-600 hover:border-slate-400 hover:bg-white"}`}>{t}</button>
          ))}
          <button type="button" className={`${compact ? "" : "ml-auto "}text-xs font-medium text-accent hover:underline`} aria-expanded={more} onClick={() => setMore(!more)}>{more ? "Fewer options" : "More options"}</button>
        </div>
        {more && (
          <div className={`grid gap-3 ${compact ? "" : "sm:grid-cols-3"}`}>
            <Field label="Subject"><Input maxLength={80} placeholder="Biology" value={extra.subject} onChange={(e) => setExtra({ ...extra, subject: e.target.value })} /></Field>
            <Field label="Audience"><Input maxLength={80} placeholder="Year 9" value={extra.level} onChange={(e) => setExtra({ ...extra, level: e.target.value })} /></Field>
            <Field label="Focus"><Input maxLength={500} placeholder="e.g. the four lobes" value={extra.focus} onChange={(e) => setExtra({ ...extra, focus: e.target.value })} /></Field>
          </div>
        )}
      </form>
      <ErrorAlert error={draft.error} />
      {draftJob.data?.status === "failed" && <p className="mt-2 text-sm text-red-700" role="alert">{draftJob.data.error_message ?? "The AI could not write a prompt."}</p>}
      {!drafting && (
        <SavedPrompts
          topic={topic}
          activeId={result?.draft_id}
          onUse={(d) => {
            setPicked({ title: d.title, prompt: d.prompt, parts: d.parts as PromptDraft["parts"], draft_id: d.id });
            setManual(false);
          }}
        />
      )}
      {existing.data && existing.data.length > 0 && (
        <p className="mt-3 rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-900">Already in your library: {existing.data.map((a) => a.name).join(", ")}. Consider reusing it.</p>
      )}
      {!result && !manual && !drafting && (
        <button type="button" className="mt-3 text-xs text-slate-500 hover:underline" onClick={() => { setManual(true); setSearched(topic.trim()); }}>Or write the prompt yourself →</button>
      )}

      {(result || manual) && (
        <section className="mt-5 border-t border-slate-200 pt-5" aria-label="Review the prompt and build">
          {result && result.parts.length > 0 && (
            <div className="mb-1">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{result.parts.length} parts planned</p>
              <div className="flex flex-wrap gap-1">{result.parts.map((p) => <Badge key={p.name} tone="blue">{p.label}</Badge>)}</div>
            </div>
          )}
          <GenerateSuggested
            key={result?.draft_id ?? draftJobId ?? `manual-${searched}`}
            draftId={result?.draft_id}
            lessonId={lessonId}
            prompt={result?.prompt ?? initialPrompt ?? (topic.trim() ? `A clear, simple educational 3D model of ${topic.trim()}` : "")}
            name={result?.title ?? initialName ?? topic.trim()}
            onDone={onCreated}
          />
        </section>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------- cards */
function AssetCard({ a, onOpen, active }: { a: AssetOut; onOpen: () => void; active: boolean }) {
  const st = statusOf(a);
  const empty = a.latest_version === 0;
  return (
    <li>
      <button onClick={onOpen} aria-pressed={active} className={`group flex h-full w-full flex-col overflow-hidden rounded-xl border bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${active ? "border-navy-900 ring-2 ring-navy-900/20" : "border-slate-200"}`}>
        <div className={`relative grid h-32 place-items-center ${empty ? "bg-slate-100" : "bg-gradient-to-br from-navy-900 to-navy-700"}`}>
          <Icon name={empty ? "clock" : "layers"} size={36} className={empty ? "text-slate-400" : "text-white/80 transition group-hover:scale-110"} />
          <span className="absolute right-2 top-2"><Badge tone={st.tone}>{st.label}</Badge></span>
        </div>
        <div className="flex flex-1 flex-col gap-1 p-3">
          <span className="line-clamp-2 font-medium text-slate-900">{a.name}</span>
          <time dateTime={a.created_at} title={new Date(a.created_at).toLocaleString()} className="text-xs text-slate-500">
            Created {created(a.created_at)}
          </time>
          <span className="mt-auto flex flex-wrap gap-x-2 text-xs text-slate-500">
            <span>{SOURCE[a.provider ?? "upload"] ?? a.provider ?? "Uploaded"}</span>
            {a.subject && <span>· {a.subject}</span>}
            {empty && <span className="text-amber-700">· no model file</span>}
          </span>
        </div>
      </button>
    </li>
  );
}

/* ------------------------------------------------------------------ drawer */
function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="font-semibold text-slate-900">{value}</dd>
    </div>
  );
}

function AssetDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const asset = useAsset(id);
  const qc = useQueryClient();
  const review = useMutation({
    mutationFn: (decision: "approved" | "rejected") => api.post<AssetOut>(`/assets/${id}/review`, { decision }),
    onSuccess: (a) => {
      qc.setQueryData(["asset", id], a);
      void qc.invalidateQueries({ queryKey: ["assets"] });
    },
  });
  const [confirming, setConfirming] = useState(false);
  const remove = useMutation({
    mutationFn: () => api.delete<void>(`/assets/${id}`),
    onSuccess: () => {
      qc.removeQueries({ queryKey: ["asset", id] });
      void qc.invalidateQueries({ queryKey: ["assets"] });
      onClose();
    },
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const a = asset.data;
  const latest = a?.versions?.find((v) => v.version_number === a.latest_version);
  const meta = (latest?.metadata_json ?? {}) as {
    node_names?: string[];
    triangle_count?: number;
    mesh_count?: number;
    parts?: { name: string; label: string; description: string }[];
  };
  const parts = meta.parts?.length ? meta.parts : (meta.node_names ?? []).map((n) => ({ name: n, label: n.replace(/_/g, " "), description: "" }));

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-label={a?.name ?? "3D model"}>
      <button aria-label="Close" className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-2xl flex-col overflow-y-auto bg-white shadow-2xl">
        <header className="sticky top-0 z-10 flex items-start gap-3 border-b border-slate-200 bg-white px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-semibold text-slate-900">{a?.name ?? "Loading…"}</h2>
            {a && (
              <p className="text-sm text-slate-500">
                {SOURCE[a.provider ?? "upload"] ?? a.provider} · created {created(a.created_at)} · {a.license_name}
              </p>
            )}
          </div>
          {a && <Badge tone={statusOf(a).tone}>{statusOf(a).label}</Badge>}
          <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-slate-500 hover:bg-slate-100"><Icon name="close" size={18} /></button>
        </header>
        <div className="space-y-5 p-5">
          {asset.isPending && <Loading />}
          <ErrorAlert error={asset.error} />
          {a && (
            <>
              {a.latest_version > 0 ? (
                <Suspense fallback={<Loading label="Loading 3D preview…" />}><AssetPreview asset={a} /></Suspense>
              ) : (
                <EmptyState title="No model file">The generation did not finish. Generate it again from “Generate with AI”.</EmptyState>
              )}
              {latest && (
                <dl className="grid grid-cols-3 gap-2 text-sm">
                  <Stat label="Parts" value={meta.mesh_count ?? parts.length} />
                  <Stat label="Triangles" value={meta.triangle_count?.toLocaleString() ?? "—"} />
                  <Stat label="Size" value={`${(latest.file_size_bytes / 1024).toFixed(0)} KB`} />
                </dl>
              )}
              {a.latest_version > 0 && (
                <Link to={`/studio/library/${a.id}`} className="inline-flex items-center gap-2 rounded-md bg-navy-900 px-3 py-2 text-sm font-medium text-white hover:bg-navy-700">
                  <Icon name="eye" size={16} /> Open in Studio
                </Link>
              )}
              {a.latest_version > 0 && (
                <DescriptionReview asset={a} reviewing={review.isPending} onReview={(d) => review.mutate(d)} />
              )}
              <ErrorAlert error={review.error} />
              {a.description && (
                <details className="text-sm text-slate-600">
                  <summary className="cursor-pointer font-medium text-slate-700">How it was made</summary>
                  <p className="mt-2 whitespace-pre-line">{a.description}</p>
                </details>
              )}
              {a.can_manage && (
                <section className="rounded-lg border border-red-200 p-3" aria-label="Delete model">
                  {!confirming ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="mr-auto text-sm text-slate-600">Remove this model and its files from the library.</span>
                      <Button variant="secondary" className="border-red-300 text-red-700 hover:bg-red-50" onClick={() => setConfirming(true)}>Delete model</Button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="mr-auto text-sm font-medium text-red-800">Delete “{a.name}” permanently? This can't be undone.</span>
                      <Button variant="danger" disabled={remove.isPending} onClick={() => remove.mutate()}>{remove.isPending ? "Deleting…" : "Yes, delete"}</Button>
                      <Button variant="secondary" disabled={remove.isPending} onClick={() => { setConfirming(false); remove.reset(); }}>Cancel</Button>
                    </div>
                  )}
                  <div className="mt-2"><ErrorAlert error={remove.error} /></div>
                </section>
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

/* -------------------------------------------------------------------- page */
function Panel({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-label={title}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        <button onClick={onClose} aria-label={`Close ${title}`} className="rounded-md p-1 text-slate-500 hover:bg-slate-100"><Icon name="close" size={18} /></button>
      </div>
      {children}
    </section>
  );
}

export function AssetsPage() {
  const assets = useAssets();
  const [panel, setPanel] = useState<"generate" | "upload" | null>(null);
  const [params] = useSearchParams();
  const [open, setOpen] = useState<string | null>(params.get("open"));
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");

  const list = assets.data ?? [];
  const counts = useMemo(() => ({
    all: list.filter((a) => a.latest_version > 0).length,
    pending: list.filter((a) => a.latest_version > 0 && a.review_status === "pending").length,
    approved: list.filter((a) => a.review_status === "approved").length,
    rejected: list.filter((a) => a.review_status === "rejected").length,
    empty: list.filter((a) => a.latest_version === 0).length,
  }), [list]);
  const shown = list
    .filter((a) => {
    const hasModel = a.latest_version > 0;
    const okFilter = filter === "empty" ? !hasModel : hasModel && (filter === "all" || a.review_status === filter);
    const text = `${a.name} ${a.subject ?? ""}`.toLowerCase();
    return okFilter && (!q.trim() || text.includes(q.trim().toLowerCase()));
  })
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)); // newest first
  const tabs: { key: Filter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "pending", label: "Needs review" },
    { key: "approved", label: "Approved" },
    { key: "rejected", label: "Rejected" },
    ...(counts.empty ? [{ key: "empty" as Filter, label: "No model" }] : []),
  ];

  return (
    <>
      <PageHeader title="3D model library">
        <Button variant={panel === "upload" ? "primary" : "secondary"} onClick={() => setPanel(panel === "upload" ? null : "upload")}><Icon name="download" size={16} /> Upload</Button>
        <Button variant={panel === "generate" ? "secondary" : "primary"} onClick={() => setPanel(panel === "generate" ? null : "generate")}><Icon name="sparkles" size={16} /> Generate with AI</Button>
      </PageHeader>
      <p className="-mt-2 mb-5 text-sm text-slate-600">Models your lessons can use. New models need your review before students see them.</p>

      {panel === "generate" && <Panel title="Generate a 3D model with AI" onClose={() => setPanel(null)}><GeneratePanel onCreated={(id) => setOpen(id)} /></Panel>}
      {panel === "upload" && <Panel title="Upload a .glb model" onClose={() => setPanel(null)}><UploadForm onDone={() => setPanel(null)} /></Panel>}

      <GenerationTray className="mb-5" onOpen={setOpen} />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div role="tablist" aria-label="Filter models" className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1">
          {tabs.map((t) => (
            <button key={t.key} role="tab" aria-selected={filter === t.key} onClick={() => setFilter(t.key)}
              className={`rounded-md px-3 py-1 text-sm font-medium transition ${filter === t.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>
              {t.label} <span className="text-xs text-slate-400">{counts[t.key]}</span>
            </button>
          ))}
        </div>
        <div className="relative sm:ml-auto sm:w-64">
          <Icon name="search" size={16} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input aria-label="Search models" placeholder="Search models" className="pl-8" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {assets.isPending && <Loading />}
      <ErrorAlert error={assets.error} />
      {assets.data && shown.length === 0 && (
        list.length === 0 ? (
          <EmptyState title="No models yet">Generate one with AI or upload a licensed .glb model.</EmptyState>
        ) : (
          <EmptyState title="Nothing matches">Try another filter or search.</EmptyState>
        )
      )}
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {shown.map((a) => <AssetCard key={a.id} a={a} active={open === a.id} onOpen={() => setOpen(a.id)} />)}
      </ul>

      {open && <AssetDrawer id={open} onClose={() => setOpen(null)} />}
    </>
  );
}
