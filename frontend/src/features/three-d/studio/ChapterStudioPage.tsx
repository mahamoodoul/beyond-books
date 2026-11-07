/**
 * Chapter Studio: the teacher's workspace for one chapter. Read the chapter text, write a chapter
 * prompt, generate all content (lesson, quiz, 3D) with AI, review it, preview it and publish it.
 * Full CRUD for lesson scenes: create (model / generator / AI), view (live preview), edit
 * (title, camera, controls, parts, explanations, animations), publish/unpublish, duplicate, delete.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";

import { api, ApiError, errorMessage } from "@/api/client";
import type {
  AvailablePart,
  ChapterDetail,
  ChapterSceneOut,
  CourseOut,
  JobOut,
  LessonSummary,
  SceneComponent,
  SceneOut,
  SceneSpec,
} from "@/api/generated/schema";
import { useJob } from "@/features/jobs/useJob";

import { AnimationsPanel } from "../AnimationsPanel";
import { NewScene } from "../ScenesCard";
import { ContentBoard, GeneratePanel, PromptPanel, PublishBar, SourcePanel } from "./ChapterWorkflow";
import { Chip, panel, Ring } from "./StudioPage";
import { useResolved } from "./useStudio";

const StudioViewport = lazy(() => import("./StudioViewport"));

const PRESETS = ["three_quarter", "front", "side", "top"] as const;
const CONTROLS = ["rotate", "zoom", "pan", "select_component"] as const;
const btn = "inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-200 hover:border-[#38b2ac]/60 hover:text-white disabled:opacity-40";
const btnPrimary = "inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#38b2ac] px-3 py-1.5 text-sm font-semibold text-[#0b0d16] hover:bg-[#4fc7c0] disabled:opacity-40";
const input = "w-full rounded-lg border border-white/10 bg-[#0f1220] px-2.5 py-1.5 text-sm text-slate-100 focus:border-[#38b2ac] focus:outline-none";

function ident(raw: string): string {
  let id = raw.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);
  if (!/^[a-z]/.test(id)) id = `part_${id}`;
  return id || "part";
}

function details(err: unknown): string[] {
  return err instanceof ApiError ? err.details.map((d) => String((d as { msg?: string }).msg ?? JSON.stringify(d))) : [];
}

/* ------------------------------------------------------------- data hooks */
function useChapterStudio(chapterId: string) {
  const chapter = useQuery({ queryKey: ["chapter", chapterId], queryFn: () => api.get<ChapterDetail>(`/chapters/${chapterId}`) });
  const course = useQuery({
    queryKey: ["course", chapter.data?.course_id],
    queryFn: () => api.get<CourseOut>(`/courses/${chapter.data?.course_id}`),
    enabled: !!chapter.data,
  });
  const lessons = useQuery({ queryKey: ["lessons", chapterId], queryFn: () => api.get<LessonSummary[]>(`/chapters/${chapterId}/lessons`) });
  const board = useQuery({ queryKey: ["chapter-scenes", chapterId], queryFn: () => api.get<ChapterSceneOut[]>(`/chapters/${chapterId}/scenes`) });
  return { chapter, course, lessons, board };
}

function useRefresh(chapterId: string) {
  const qc = useQueryClient();
  return (sceneId?: string) => {
    void qc.invalidateQueries({ queryKey: ["chapter-scenes", chapterId] });
    void qc.invalidateQueries({ queryKey: ["scenes"] });
    if (sceneId) {
      void qc.invalidateQueries({ queryKey: ["scene-resolved", sceneId] });
      void qc.invalidateQueries({ queryKey: ["available-parts", sceneId] });
    }
  };
}

/* ------------------------------------------------------- generation rows */
function JobRow({ title, jobId, status, reason, onDone }: { title: string; jobId: string | null; status: string; reason?: string | null; onDone: () => void }) {
  const job = useJob(jobId);
  const s = job.data?.status ?? status;
  useEffect(() => { if (s === "completed" || s === "failed") onDone(); }, [s]); // eslint-disable-line react-hooks/exhaustive-deps
  const decision = (job.data?.result as { decision?: string } | null)?.decision;
  const tone = s === "completed" ? "teal" : s === "failed" ? "amber" : s === "skipped" ? "slate" : "violet";
  return (
    <li className="flex items-center gap-2 text-sm">
      <span className="min-w-0 flex-1 truncate text-slate-200">{title}</span>
      <Chip tone={tone}>{s}</Chip>
      <span className="max-w-[45%] truncate text-xs text-slate-500">{job.data?.error_message ?? reason ?? (decision ? decision.replace("_", " ") : "")}</span>
    </li>
  );
}

/* ------------------------------------------------------------ scene editor */
function SceneEditor({ item, chapterId, onDeleted, onDuplicated }: { item: ChapterSceneOut; chapterId: string; onDeleted: () => void; onDuplicated: (id: string) => void }) {
  const scene = item.scene;
  const refresh = useRefresh(chapterId);
  const [draft, setDraft] = useState<SceneSpec>(scene.spec);
  const [open, setOpen] = useState<string | null>(null);
  const [add, setAdd] = useState("");
  useEffect(() => { setDraft(scene.spec); setOpen(null); }, [scene.id, scene.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const parts = useQuery({ queryKey: ["available-parts", scene.id], queryFn: () => api.get<AvailablePart[]>(`/scenes/${scene.id}/available-parts`) });
  const dirty = JSON.stringify(draft) !== JSON.stringify(scene.spec);
  const comps = draft.components ?? [];
  const used = new Set(comps.map((c) => c.mesh_name));
  const addable = (parts.data ?? []).filter((p) => !used.has(p.mesh_name));

  const save = useMutation({ mutationFn: () => api.patch<SceneOut>(`/scenes/${scene.id}`, { expected_version: scene.version, spec: draft }), onSuccess: () => refresh(scene.id) });
  const publish = useMutation({ mutationFn: (on: boolean) => api.post<SceneOut>(`/scenes/${scene.id}/${on ? "publish" : "unpublish"}`), onSuccess: () => refresh(scene.id) });
  const dup = useMutation({ mutationFn: () => api.post<SceneOut>(`/scenes/${scene.id}/duplicate`), onSuccess: (s) => { refresh(); onDuplicated(s.id); } });
  const del = useMutation({ mutationFn: () => api.delete<void>(`/scenes/${scene.id}`), onSuccess: () => { refresh(); onDeleted(); } });

  const setComp = (i: number, patch: Partial<SceneComponent>) =>
    setDraft({ ...draft, components: comps.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const explanation = (c: SceneComponent) => (c.explanation_ref ? draft.explanations?.[c.explanation_ref] ?? "" : "");
  const setExplanation = (i: number, c: SceneComponent, text: string) => {
    const ref = c.explanation_ref ?? `exp_${c.component_id}`.slice(0, 64);
    const ex = { ...(draft.explanations ?? {}) };
    if (text.trim()) ex[ref] = text; else delete ex[ref];
    setDraft({ ...draft, explanations: ex, components: comps.map((x, j) => (j === i ? { ...x, explanation_ref: text.trim() ? ref : null } : x)) });
  };
  const removeComp = (i: number) => {
    const c = comps[i];
    const ex = { ...(draft.explanations ?? {}) };
    if (c?.explanation_ref) delete ex[c.explanation_ref];
    setDraft({ ...draft, explanations: ex, components: comps.filter((_, j) => j !== i) });
  };
  const addPart = () => {
    const p = parts.data?.find((x) => x.mesh_name === add);
    if (!p) return;
    let id = ident(p.mesh_name);
    while (comps.some((c) => c.component_id === id)) id = `${id}_2`.slice(0, 64);
    const ref = p.description ? `exp_${id}`.slice(0, 64) : null;
    setDraft({
      ...draft,
      components: [...comps, { component_id: id, mesh_name: p.mesh_name, label: p.label, actions: ["highlight", "show_explanation"], explanation_ref: ref }],
      explanations: ref ? { ...(draft.explanations ?? {}), [ref]: p.description } : draft.explanations,
    });
    setAdd("");
  };
  const cam = draft.camera ?? { preset: "three_quarter", min_distance: 2, max_distance: 12 };
  const ctrls = new Set(draft.controls ?? []);
  const live = !!scene.published_version;

  return (
    <div className="space-y-4">
      <section className={`${panel} space-y-3 p-4`}>
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone={live ? (scene.has_unpublished_changes ? "amber" : "teal") : "slate"}>{live ? (scene.has_unpublished_changes ? "unpublished changes" : "published") : "draft"}</Chip>
          {scene.origin === "ai" && <Chip tone="violet">AI planned</Chip>}
          <span className="text-xs text-slate-500">v{scene.version} · {item.lesson_title}</span>
        </div>
        <label className="block text-xs uppercase tracking-wide text-slate-500">Title
          <input className={`${input} mt-1`} value={draft.title} maxLength={200} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
        </label>
        <div className="grid grid-cols-3 gap-2">
          <label className="text-xs uppercase tracking-wide text-slate-500">Camera
            <select className={`${input} mt-1`} value={cam.preset ?? "three_quarter"} onChange={(e) => setDraft({ ...draft, camera: { ...cam, preset: e.target.value as (typeof PRESETS)[number] } })}>
              {PRESETS.map((p) => <option key={p} value={p}>{p.replace("_", " ")}</option>)}
            </select>
          </label>
          <label className="text-xs uppercase tracking-wide text-slate-500">Min dist
            <input type="number" min={0.1} step={0.5} className={`${input} mt-1`} value={cam.min_distance ?? 1} onChange={(e) => setDraft({ ...draft, camera: { ...cam, min_distance: Number(e.target.value) } })} />
          </label>
          <label className="text-xs uppercase tracking-wide text-slate-500">Max dist
            <input type="number" min={0.5} step={0.5} className={`${input} mt-1`} value={cam.max_distance ?? 20} onChange={(e) => setDraft({ ...draft, camera: { ...cam, max_distance: Number(e.target.value) } })} />
          </label>
        </div>
        <fieldset className="flex flex-wrap gap-3 text-sm text-slate-300">
          <legend className="sr-only">Controls</legend>
          {CONTROLS.map((c) => (
            <label key={c} className="flex items-center gap-1.5">
              <input type="checkbox" checked={ctrls.has(c)} onChange={(e) => { const n = new Set(ctrls); if (e.target.checked) n.add(c); else n.delete(c); setDraft({ ...draft, controls: [...n] as SceneSpec["controls"] }); }} />
              {c.replace("_", " ")}
            </label>
          ))}
        </fieldset>
      </section>

      <section className={`${panel} p-4`}>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold text-white">Parts ({comps.length})</p>
          <span className="text-xs text-slate-500">{comps.filter((c) => explanation(c)).length} explained</span>
        </div>
        <ul className="max-h-80 space-y-1.5 overflow-auto pr-1">
          {comps.map((c, i) => (
            <li key={c.component_id} className="rounded-lg border border-white/10 p-2">
              <div className="flex items-center gap-2">
                <input aria-label={`Label for ${c.mesh_name}`} className={input} value={c.label} maxLength={200} onChange={(e) => setComp(i, { label: e.target.value })} />
                <button className={btn} aria-expanded={open === c.component_id} onClick={() => setOpen(open === c.component_id ? null : c.component_id)}>{explanation(c) ? "✎" : "+ text"}</button>
                <button className={btn} aria-label={`Remove ${c.label}`} onClick={() => removeComp(i)}>✕</button>
              </div>
              {open === c.component_id && (
                <textarea aria-label={`Explanation for ${c.label}`} rows={3} className={`${input} mt-2`} value={explanation(c)} maxLength={2000} onChange={(e) => setExplanation(i, c, e.target.value)} />
              )}
            </li>
          ))}
        </ul>
        <div className="mt-2 flex gap-2">
          <select aria-label="Add a part from the model" className={input} value={add} onChange={(e) => setAdd(e.target.value)}>
            <option value="">{addable.length ? "Add a part from the model…" : "All model parts are in the scene"}</option>
            {addable.map((p) => <option key={p.mesh_name} value={p.mesh_name}>{p.label}</option>)}
          </select>
          <button className={btn} disabled={!add} onClick={addPart}>Add</button>
        </div>
      </section>

      <section className={`${panel} space-y-2 p-4`}>
        <div className="flex flex-wrap gap-2">
          <button className={btnPrimary} disabled={!dirty || save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : dirty ? "Save changes" : "Saved"}</button>
          {dirty && <button className={btn} onClick={() => setDraft(scene.spec)}>Discard</button>}
          <button className={btn} disabled={dirty || publish.isPending} onClick={() => publish.mutate(!(live && !scene.has_unpublished_changes))}>
            {live && !scene.has_unpublished_changes ? "Unpublish" : `Publish v${scene.version}`}
          </button>
          <button className={btn} disabled={dup.isPending} onClick={() => dup.mutate()}>Duplicate</button>
          <Link className={btn} to={`/teacher/lessons/${item.lesson_id}/studio`}>Lesson studio ↗</Link>
          <button className={`${btn} border-red-400/30 text-red-300`} disabled={del.isPending} onClick={() => confirm(`Delete “${scene.title}” and its animations?`) && del.mutate()}>Delete</button>
        </div>
        {[save.error, publish.error, dup.error, del.error].filter(Boolean).map((e, i) => (
          <div key={i} className="text-sm text-red-300" role="alert">
            {errorMessage(e)}
            {details(e).map((d) => <p key={d}>• {d}</p>)}
          </div>
        ))}
      </section>

      <section className="rounded-2xl bg-white p-3 text-slate-900">
        <AnimationsPanel sceneId={scene.id} lessonId={item.lesson_id} firstComponent={comps[0]?.component_id} />
      </section>
    </div>
  );
}

/* --------------------------------------------------------------- page */
export default function ChapterStudioPage() {
  const { chapterId = "" } = useParams();
  const { chapter, course, lessons, board } = useChapterStudio(chapterId);
  const refresh = useRefresh(chapterId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedPart, setSelectedPart] = useState<SceneComponent | null>(null);
  const [creatingFor, setCreatingFor] = useState<string | null>(null);
  const [planJobs, setPlanJobs] = useState<Record<string, string>>({});

  const items = board.data ?? [];
  const selected = items.find((i) => i.scene.id === selectedId) ?? items[0];
  useEffect(() => { if (!selectedId && items[0]) setSelectedId(items[0].scene.id); }, [items, selectedId]);
  useEffect(() => { setSelectedPart(null); }, [selected?.scene.id, selected?.scene.version]);
  const resolved = useResolved(selected?.scene.id);
  const byLesson = useMemo(() => {
    const m = new Map<string, ChapterSceneOut[]>();
    for (const i of items) m.set(i.lesson_id, [...(m.get(i.lesson_id) ?? []), i]);
    return m;
  }, [items]);
  const totals = items.reduce((a, i) => ({ parts: a.parts + i.parts, explained: a.explained + i.explained }), { parts: 0, explained: 0 });
  const lessonsWith = (lessons.data ?? []).filter((l) => byLesson.has(l.id)).length;

  const planOne = useMutation({
    mutationFn: (lessonId: string) => api.post<JobOut>(`/lessons/${lessonId}/ai/scene`),
    onSuccess: (j, lessonId) => setPlanJobs((p) => ({ ...p, [lessonId]: j.id })),
  });

  if (chapter.isPending || board.isPending) return <div className="grid min-h-screen place-items-center bg-[#0b0d16] text-slate-400">Loading chapter 3D studio…</div>;
  if (chapter.error) return <div className="grid min-h-screen place-items-center bg-[#0b0d16] text-red-300">{errorMessage(chapter.error)}</div>;
  const ch = chapter.data;

  return (
    <div className="min-h-screen bg-[#0b0d16] text-slate-200">
      <header className="flex flex-wrap items-center gap-3 border-b border-white/10 px-5 py-3">
        <Link to={`/teacher/chapters/${chapterId}`} className="text-lg font-semibold text-white">Beyond Books <span className="text-[#38b2ac]">Chapter Studio</span></Link>
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-sm text-slate-400">
          <Link className="hover:text-white" to="/teacher">Courses</Link><span>›</span>
          {course.data && <><Link className="hover:text-white" to={`/teacher/courses/${course.data.id}`}>{course.data.title}</Link><span>›</span></>}
          <span className="text-white">{ch.title}</span>
        </nav>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <PublishBar chapter={ch} course={course.data} />
          <Link to={course.data ? `/teacher/courses/${course.data.id}` : "/teacher/courses"} className="rounded-lg border border-white/10 px-3 py-1.5 text-sm hover:text-white">Exit studio</Link>
        </div>
      </header>

      <div className="grid gap-4 p-4 xl:grid-cols-[19rem_1fr_24rem]">
        {/* left: chapter overview + generation */}
        <aside className="space-y-4">
          <section className={`${panel} p-4`}>
            <p className="text-xs uppercase tracking-wider text-slate-500">Chapter {ch.position}</p>
            <h1 className="mt-1 text-xl font-semibold text-white">{ch.title}</h1>
            <div className="mt-3 flex items-center gap-3">
              <Ring pct={totals.parts ? Math.round((totals.explained / totals.parts) * 100) : 0} />
              <dl className="space-y-1 text-sm">
                <div className="flex gap-2"><dt className="text-slate-400">Lessons with 3D</dt><dd className="text-white">{lessonsWith}/{lessons.data?.length ?? 0}</dd></div>
                <div className="flex gap-2"><dt className="text-slate-400">Scenes</dt><dd className="text-white">{items.length}</dd></div>
                <div className="flex gap-2"><dt className="text-slate-400">Published</dt><dd className="text-white">{items.filter((i) => i.scene.published_version).length}</dd></div>
                <div className="flex gap-2"><dt className="text-slate-400">Parts explained</dt><dd className="text-white">{totals.explained}/{totals.parts}</dd></div>
              </dl>
            </div>
          </section>
          <SourcePanel chapterId={chapterId} />
          <PromptPanel chapter={ch} />
          <GeneratePanel chapter={ch} />
        </aside>

        {/* centre: live preview + organized board */}
        <main className="space-y-4">
          <section className="relative h-[52vh] min-h-80 overflow-hidden rounded-2xl border border-white/10 bg-[radial-gradient(ellipse_at_center,#1a2036_0%,#0b0d16_70%)]">
            {!selected ? (
              <div className="grid h-full place-items-center p-6 text-center text-slate-400">No 3D scenes in this chapter yet — generate them with AI or add one to a lesson below.</div>
            ) : resolved.error ? (
              <div className="p-6 text-sm text-red-300">{errorMessage(resolved.error)}{details(resolved.error).map((d) => <p key={d}>• {d}</p>)}</div>
            ) : !resolved.data ? (
              <p className="p-6 text-slate-400" role="status">Preparing preview…</p>
            ) : (
              <Suspense fallback={<p className="p-6 text-slate-400">Loading 3D engine…</p>}>
                <div className="absolute inset-0">
                  <StudioViewport resolved={resolved.data} selected={selectedPart} onSelect={setSelectedPart} xray={false} zoom={1} tourStep={null} tourPlaying={false} onTourStepComplete={() => {}} resetKey={selected.scene.version} />
                </div>
              </Suspense>
            )}
            {selected && (
              <div className="pointer-events-none absolute left-4 top-4 flex flex-wrap items-center gap-2">
                <span className="rounded-lg bg-black/40 px-2 py-1 text-sm text-white">{selected.scene.title}</span>
                <span className="text-xs text-slate-400">{selected.lesson_title}{selectedPart ? ` · ${selectedPart.label}` : ""}</span>
              </div>
            )}
          </section>

          <ContentBoard chapterId={chapterId} />

          <section className="space-y-3" aria-label="Chapter scenes by lesson">
            {(lessons.data ?? []).map((l) => {
              const scenes = byLesson.get(l.id) ?? [];
              return (
                <div key={l.id} className={`${panel} p-3`}>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="text-xs text-slate-500">Lesson {l.position}</span>
                    <span className="font-medium text-white">{l.title}</span>
                    <Chip tone={l.published_version ? "teal" : "slate"}>{l.published_version ? "live" : "draft"}</Chip>
                    <div className="ml-auto flex gap-2">
                      {planJobs[l.id] ? <ul className="w-56"><JobRow title="AI plan" jobId={planJobs[l.id] ?? null} status="queued" onDone={() => refresh()} /></ul> : (
                        <button className={btn} disabled={planOne.isPending} onClick={() => planOne.mutate(l.id)}>✦ AI plan</button>
                      )}
                      <button className={btn} onClick={() => setCreatingFor(creatingFor === l.id ? null : l.id)}>{creatingFor === l.id ? "Cancel" : "+ New scene"}</button>
                    </div>
                  </div>
                  {creatingFor === l.id && (
                    <div className="mb-2 rounded-xl bg-white p-2 text-slate-900"><NewScene lessonId={l.id} onCreated={() => { setCreatingFor(null); refresh(); }} /></div>
                  )}
                  {scenes.length === 0 ? <p className="text-sm text-slate-500">No 3D scene yet.</p> : (
                    <ul className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
                      {scenes.map((i) => {
                        const pct = i.parts ? Math.round((i.explained / i.parts) * 100) : 0;
                        const active = i.scene.id === selected?.scene.id;
                        return (
                          <li key={i.scene.id}>
                            <button onClick={() => setSelectedId(i.scene.id)} aria-pressed={active}
                              className={`w-full rounded-xl border p-3 text-left transition ${active ? "border-[#38b2ac] bg-[#38b2ac]/10" : "border-white/10 hover:border-white/30"}`}>
                              <span className="block truncate font-medium text-white">{i.scene.title}</span>
                              <span className="mt-1 flex flex-wrap gap-1">
                                <Chip tone={i.scene.published_version ? (i.scene.has_unpublished_changes ? "amber" : "teal") : "slate"}>{i.scene.published_version ? (i.scene.has_unpublished_changes ? "changed" : "live") : "draft"}</Chip>
                                {i.scene.origin === "ai" && <Chip tone="violet">AI</Chip>}
                                <Chip>{(i.scene.spec.asset_refs?.length ? "model" : "generator")}</Chip>
                              </span>
                              <span className="mt-2 block h-1.5 overflow-hidden rounded bg-white/10"><span className="block h-full bg-[#38b2ac]" style={{ width: `${pct}%` }} /></span>
                              <span className="mt-1 block text-xs text-slate-500">{i.explained}/{i.parts} parts explained · v{i.scene.version} · {new Date(i.scene.updated_at).toLocaleDateString()}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </section>
        </main>

        {/* right: editor */}
        <aside>
          {selected ? (
            <SceneEditor key={selected.scene.id} item={selected} chapterId={chapterId} onDeleted={() => setSelectedId(null)} onDuplicated={(id) => setSelectedId(id)} />
          ) : (
            <section className={`${panel} p-4 text-sm text-slate-400`}>Select a scene to edit it.</section>
          )}
        </aside>
      </div>
    </div>
  );
}
