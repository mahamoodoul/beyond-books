/**
 * Course page: the chapters, one card each, with what's inside (lessons, 3D, quizzes), the main
 * actions (Open Studio, Preview), reordering, "Add chapter" and "Split with AI" for a complex topic.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link } from "react-router";

import { api, errorMessage } from "@/api/client";
import type { ChapterOut, ChapterOverview, DocumentOut, JobOut } from "@/api/generated/schema";
import { EmptyState, ErrorAlert, Loading } from "@/components/feedback";
import { Badge, Button, Field, Input } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { useJob } from "@/features/jobs/useJob";

const overviewKey = (courseId: string) => ["chapter-overview", courseId];

export function useChapterOverview(courseId: string) {
  return useQuery({
    queryKey: overviewKey(courseId),
    queryFn: () => api.get<ChapterOverview[]>(`/courses/${courseId}/chapter-overview`),
  });
}

function useRefresh(courseId: string) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: overviewKey(courseId) });
    void qc.invalidateQueries({ queryKey: ["chapters", courseId] });
  };
}

function pagesOf(c: ChapterOverview): string | null {
  const refs = (c.source_refs ?? []) as { page_start?: number; page_end?: number }[];
  if (!refs.length) return null;
  return refs.map((r) => (r.page_start === r.page_end ? `p. ${r.page_start}` : `pp. ${r.page_start}–${r.page_end}`)).join(", ");
}

/* --------------------------------------------------------------- add chapter */
function AddChapter({ courseId, onDone }: { courseId: string; onDone: () => void }) {
  const refresh = useRefresh(courseId);
  const docs = useQuery({ queryKey: ["documents", courseId], queryFn: () => api.get<DocumentOut[]>(`/courses/${courseId}/documents`) });
  const ready = (docs.data ?? []).filter((d) => d.processing_status === "ready");
  const [form, setForm] = useState({ title: "", description: "", doc: "", from: "", to: "" });
  const create = useMutation({
    mutationFn: () =>
      api.post<ChapterOut>(`/courses/${courseId}/chapters`, {
        title: form.title.trim(),
        description: form.description.trim(),
        source_refs:
          form.doc && form.from
            ? [{ document_id: form.doc, page_start: Number(form.from), page_end: Number(form.to || form.from) }]
            : [],
      }),
    onSuccess: () => {
      refresh();
      onDone();
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };
  const maxPage = ready.find((d) => d.id === form.doc)?.page_count ?? undefined;
  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm" aria-label="Add a chapter">
      <h3 className="font-semibold text-slate-900">Add a chapter</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Title"><Input required maxLength={200} placeholder="e.g. Cell membranes" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
        <Field label="Short description (optional)"><Input maxLength={500} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
      </div>
      {ready.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-[1fr_7rem_7rem]">
          <Field label="Textbook pages (optional)" hint="The AI writes the chapter's lessons and 3D from these pages.">
            <select className="w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm" value={form.doc} onChange={(e) => setForm({ ...form, doc: e.target.value })}>
              <option value="">No pages — I'll write it myself</option>
              {ready.map((d) => <option key={d.id} value={d.id}>{d.title} ({d.page_count} pages)</option>)}
            </select>
          </Field>
          <Field label="From page"><Input type="number" min={1} max={maxPage} disabled={!form.doc} value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} /></Field>
          <Field label="To page"><Input type="number" min={Number(form.from) || 1} max={maxPage} disabled={!form.doc} value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} /></Field>
        </div>
      )}
      <div className="flex items-center gap-2">
        <Button type="submit" disabled={create.isPending || !form.title.trim()}>{create.isPending ? "Adding…" : "Add chapter"}</Button>
        <Button type="button" variant="secondary" onClick={onDone}>Cancel</Button>
        <ErrorAlert error={create.error} />
      </div>
    </form>
  );
}

/* -------------------------------------------------------------- split with AI */
interface ProposedChapter {
  title: string;
  description: string;
  source_refs: { document_id: string; page_start: number; page_end: number }[];
  objectives: { text: string }[];
}

function SplitPanel({ chapter, courseId, onDone }: { chapter: ChapterOverview; courseId: string; onDone: () => void }) {
  const refresh = useRefresh(courseId);
  const [jobId, setJobId] = useState<string | null>(null);
  const job = useJob(jobId);
  const start = useMutation({
    mutationFn: () => api.post<JobOut>(`/chapters/${chapter.id}/ai/split`),
    onSuccess: (j) => setJobId(j.id),
  });
  const proposal = job.data?.status === "completed" ? ((job.data.result as { chapters?: ProposedChapter[] } | null)?.chapters ?? []) : null;
  const [edits, setEdits] = useState<Record<number, { title?: string; include?: boolean }>>({});
  const hasContent = (chapter.lessons ?? 0) > 0 || (chapter.quizzes ?? 0) > 0;
  const [removeOriginal, setRemoveOriginal] = useState(!hasContent);
  const chosen = (proposal ?? [])
    .map((c, i) => ({ ...c, title: edits[i]?.title ?? c.title, include: edits[i]?.include ?? true }))
    .filter((c) => c.include && c.title.trim());
  const apply = useMutation({
    mutationFn: () =>
      api.post<ChapterOut[]>(`/chapters/${chapter.id}/split`, {
        chapters: chosen.map((c) => ({ title: c.title.trim(), description: c.description, source_refs: c.source_refs, objectives: c.objectives.map((o) => o.text) })),
        remove_original: removeOriginal,
      }),
    onSuccess: () => {
      refresh();
      onDone();
    },
  });
  const running = start.isPending || (!!jobId && !["completed", "failed"].includes(job.data?.status ?? ""));

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-violet-200 bg-violet-50/60 p-3" aria-label={`Split ${chapter.title}`}>
      {!jobId && (
        <div className="flex flex-wrap items-center gap-2">
          <p className="mr-auto text-sm text-slate-700">Too much in one chapter? The AI reads its pages and proposes 2–5 smaller chapters. You review before anything changes.</p>
          <Button disabled={start.isPending} onClick={() => start.mutate()}><Icon name="sparkles" size={16} /> Propose split</Button>
          <Button variant="secondary" onClick={onDone}>Cancel</Button>
        </div>
      )}
      {running && <p role="status" className="text-sm text-slate-700">Reading the chapter's pages and planning smaller chapters…</p>}
      {(start.error || job.data?.status === "failed") && (
        <p role="alert" className="text-sm text-red-700">{start.error ? errorMessage(start.error) : job.data?.error_message}</p>
      )}
      {proposal && (
        <>
          <p className="text-sm font-medium text-slate-900">Proposed chapters — edit titles, untick any you don't want:</p>
          <ol className="space-y-2">
            {proposal.map((c, i) => (
              <li key={i} className="flex gap-3 rounded-md bg-white p-2.5 shadow-sm">
                <input type="checkbox" className="mt-2" aria-label={`Include ${c.title}`} checked={edits[i]?.include ?? true} onChange={(e) => setEdits({ ...edits, [i]: { ...edits[i], include: e.target.checked } })} />
                <div className="min-w-0 flex-1 space-y-1">
                  <Input aria-label={`Title ${i + 1}`} value={edits[i]?.title ?? c.title} onChange={(e) => setEdits({ ...edits, [i]: { ...edits[i], title: e.target.value } })} />
                  {c.description && <p className="text-xs text-slate-600">{c.description}</p>}
                  <p className="text-xs text-slate-500">
                    {c.source_refs.map((r) => `pp. ${r.page_start}–${r.page_end}`).join(", ")}
                    {c.objectives.length > 0 && ` · ${c.objectives.length} objectives`}
                  </p>
                </div>
              </li>
            ))}
          </ol>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={removeOriginal} disabled={hasContent} onChange={(e) => setRemoveOriginal(e.target.checked)} />
            Replace “{chapter.title}” with these chapters
            {hasContent && <span className="text-xs text-slate-500">(kept: it already has lessons or quizzes)</span>}
          </label>
          <div className="flex items-center gap-2">
            <Button disabled={apply.isPending || chosen.length < 2} onClick={() => apply.mutate()}>{apply.isPending ? "Applying…" : `Create ${chosen.length} chapters`}</Button>
            <Button variant="secondary" onClick={onDone}>Cancel</Button>
            {chosen.length < 2 && <span className="text-xs text-slate-500">Keep at least 2.</span>}
            <ErrorAlert error={apply.error} />
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- chapter card */
function Stat({ icon, label }: { icon: "book" | "layers" | "check" | "target"; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-slate-600">
      <Icon name={icon} size={13} className="text-slate-400" /> {label}
    </span>
  );
}

function ChapterCard({ c, index, total, courseId }: { c: ChapterOverview; index: number; total: number; courseId: string }) {
  const refresh = useRefresh(courseId);
  const [splitting, setSplitting] = useState(false);
  const [menu, setMenu] = useState(false);
  const move = useMutation({ mutationFn: (position: number) => api.patch<ChapterOut>(`/chapters/${c.id}`, { position }), onSuccess: refresh });
  const remove = useMutation({ mutationFn: () => api.delete<void>(`/chapters/${c.id}`), onSuccess: refresh });
  const live = c.status === "published";
  const pages = pagesOf(c);
  const lessons = c.lessons ?? 0;

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md">
      <div className="flex gap-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-100 text-sm font-semibold text-slate-700">{index + 1}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link to={`/teacher/chapters/${c.id}`} className="font-semibold text-slate-900 hover:underline">{c.title}</Link>
            <Badge tone={live ? "green" : "slate"}>{live ? "Published" : "Draft"}</Badge>
          </div>
          {c.description && <p className="mt-0.5 line-clamp-2 text-sm text-slate-600">{c.description}</p>}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            <Stat icon="book" label={lessons ? `${lessons} lesson${lessons === 1 ? "" : "s"} · ${c.published_lessons ?? 0} live` : "No lessons yet"} />
            <Stat icon="layers" label={`${c.scenes ?? 0} 3D`} />
            <Stat icon="check" label={`${c.quizzes ?? 0} quiz${(c.quizzes ?? 0) === 1 ? "" : "zes"}`} />
            {(c.objectives ?? 0) > 0 && <Stat icon="target" label={`${c.objectives} objectives`} />}
            {pages && <span className="text-xs text-slate-400">{pages}</span>}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-start">
          <Link to={`/teacher/chapters/${c.id}/studio`} className="inline-flex items-center gap-1.5 rounded-md bg-navy-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-navy-700">
            <Icon name="sparkles" size={15} /> Open Studio
          </Link>
          <div className="relative">
            <button type="button" aria-label={`More actions for ${c.title}`} aria-expanded={menu} onClick={() => setMenu(!menu)} className="rounded-md border border-slate-200 px-2 py-1.5 text-slate-600 hover:bg-slate-50">
              <Icon name="more" size={16} />
            </button>
            {menu && (
              <div role="menu" className="absolute right-0 z-10 mt-1 w-48 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-lg" onMouseLeave={() => setMenu(false)}>
                <Link role="menuitem" to={`/teacher/chapters/${c.id}/preview`} className="block px-3 py-1.5 hover:bg-slate-50">Preview as student</Link>
                <Link role="menuitem" to={`/teacher/chapters/${c.id}`} className="block px-3 py-1.5 hover:bg-slate-50">Edit details</Link>
                <button role="menuitem" type="button" className="block w-full px-3 py-1.5 text-left hover:bg-slate-50" onClick={() => { setSplitting(true); setMenu(false); }}>✦ Split with AI</button>
                <button role="menuitem" type="button" disabled={index === 0 || move.isPending} className="block w-full px-3 py-1.5 text-left hover:bg-slate-50 disabled:text-slate-300" onClick={() => move.mutate(c.position - 1)}>Move up</button>
                <button role="menuitem" type="button" disabled={index === total - 1 || move.isPending} className="block w-full px-3 py-1.5 text-left hover:bg-slate-50 disabled:text-slate-300" onClick={() => move.mutate(c.position + 1)}>Move down</button>
                <button role="menuitem" type="button" className="block w-full px-3 py-1.5 text-left text-red-700 hover:bg-red-50" onClick={() => confirm(`Delete chapter "${c.title}" and its lessons?`) && remove.mutate()}>Delete</button>
              </div>
            )}
          </div>
        </div>
      </div>
      {splitting && <SplitPanel chapter={c} courseId={courseId} onDone={() => setSplitting(false)} />}
      <ErrorAlert error={move.error ?? remove.error} />
    </li>
  );
}

/* -------------------------------------------------------------------- board */
export function ChapterBoard({ courseId, onGoToSources }: { courseId: string; onGoToSources: () => void }) {
  const overview = useChapterOverview(courseId);
  const [adding, setAdding] = useState(false);
  const list = overview.data ?? [];

  return (
    <section aria-label="Chapters" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto">
          <h2 className="text-lg font-semibold text-slate-900">Chapters</h2>
          <p className="text-sm text-slate-600">Work chapter by chapter: open a chapter's Studio to generate its lesson, quiz and 3D, then publish it.</p>
        </div>
        <Button onClick={() => setAdding(!adding)} variant={adding ? "secondary" : "primary"}><Icon name="plus" size={16} /> Add chapter</Button>
      </div>
      {adding && <AddChapter courseId={courseId} onDone={() => setAdding(false)} />}
      {overview.isPending && <Loading />}
      <ErrorAlert error={overview.error} />
      {overview.data && list.length === 0 && !adding && (
        <EmptyState title="No chapters yet">
          Generate chapters from your textbook in{" "}
          <button type="button" className="font-medium text-accent hover:underline" onClick={onGoToSources}>Sources &amp; outline</button>, or add one yourself.
        </EmptyState>
      )}
      <ol className="space-y-3">
        {list.map((c, i) => <ChapterCard key={c.id} c={c} index={i} total={list.length} courseId={courseId} />)}
      </ol>
    </section>
  );
}
