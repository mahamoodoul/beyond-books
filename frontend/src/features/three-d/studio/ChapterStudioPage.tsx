/**
 * Chapter Studio: the teacher's workspace for one chapter. Read the chapter text, write a chapter
 * prompt, generate all content (lesson, quiz, 3D) with AI, review it, preview it and publish it.
 * Full CRUD for lesson scenes: create (model / generator / AI), view (live preview), edit
 * (title, camera, controls, parts, explanations, animations), publish/unpublish, duplicate, delete.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";

import { api, ApiError, errorMessage } from "@/api/client";
import type {
  AssessmentSummary,
  AvailablePart,
  ChapterDetail,
  ChapterSceneOut,
  ChapterSourceOut,
  CourseOut,
  LessonSummary,
  SceneComponent,
  SceneOut,
  SceneSpec,
} from "@/api/generated/schema";

import { AnimationsPanel } from "../AnimationsPanel";
import { GenerationTray } from "../GenerationTray";
import { Add3DPanel } from "./Add3DPanel";
import { LessonsStep, QuizStep, ReviewStep, StepFooter, StepNav, type StepKey } from "./ChapterSteps";
import { GeneratePanel, type PendingChanges, PromptPanel, PublishStatus, SourcePanel } from "./ChapterWorkflow";
import { Chip, panel, Ring } from "./StudioPage";
import { useResolved } from "./useStudio";

const StudioViewport = lazy(() => import("./StudioViewport"));

const PRESETS = ["three_quarter", "front", "side", "top"] as const;
const PRESET_LABELS: Record<(typeof PRESETS)[number], string> = { three_quarter: "Three-quarter view", front: "Front", side: "Side", top: "Top" };
const CONTROLS = ["rotate", "zoom", "pan", "select_component"] as const;
const btn = "inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:border-[#38b2ac]/60 hover:text-slate-900 disabled:opacity-40";
const btnPrimary = "inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#38b2ac] px-3 py-1.5 text-sm font-semibold text-[#0b0d16] hover:bg-[#4fc7c0] disabled:opacity-40";
const input = "w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 focus:border-[#38b2ac] focus:outline-none";

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
        <div className="grid grid-cols-2 gap-2">
          <label className="col-span-2 text-xs uppercase tracking-wide text-slate-500">Camera
            <select className={`${input} mt-1`} value={cam.preset ?? "three_quarter"} onChange={(e) => setDraft({ ...draft, camera: { ...cam, preset: e.target.value as (typeof PRESETS)[number] } })}>
              {PRESETS.map((p) => <option key={p} value={p}>{PRESET_LABELS[p]}</option>)}
            </select>
          </label>
          <label className="text-xs uppercase tracking-wide text-slate-500">Min dist
            <input type="number" min={0.1} step={0.5} className={`${input} mt-1`} value={cam.min_distance ?? 1} onChange={(e) => setDraft({ ...draft, camera: { ...cam, min_distance: Number(e.target.value) } })} />
          </label>
          <label className="text-xs uppercase tracking-wide text-slate-500">Max dist
            <input type="number" min={0.5} step={0.5} className={`${input} mt-1`} value={cam.max_distance ?? 20} onChange={(e) => setDraft({ ...draft, camera: { ...cam, max_distance: Number(e.target.value) } })} />
          </label>
        </div>
        <fieldset className="flex flex-wrap gap-3 text-sm text-slate-600">
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
          <p className="text-sm font-semibold text-slate-900">Parts ({comps.length})</p>
          <span className="text-xs text-slate-500">{comps.filter((c) => explanation(c)).length} explained</span>
        </div>
        <ul className="max-h-80 space-y-1.5 overflow-auto pr-1">
          {comps.map((c, i) => (
            <li key={c.component_id} className="rounded-lg border border-slate-200 p-2">
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
          <button className={btn} title="Publishes only this 3D scene. “Review & publish” publishes the whole chapter at once." disabled={dirty || publish.isPending} onClick={() => publish.mutate(!(live && !scene.has_unpublished_changes))}>
            {live && !scene.has_unpublished_changes ? "Unpublish scene" : "Publish scene only"}
          </button>
          <button className={btn} disabled={dup.isPending} onClick={() => dup.mutate()}>Duplicate</button>
          <Link className={btn} to={`/teacher/lessons/${item.lesson_id}/studio`}>Lesson studio ↗</Link>
          <button className={`${btn} border-red-400/30 text-red-600`} disabled={del.isPending} onClick={() => confirm(`Delete “${scene.title}” and its animations?`) && del.mutate()}>Delete</button>
        </div>
        {[save.error, publish.error, dup.error, del.error].filter(Boolean).map((e, i) => (
          <div key={i} className="text-sm text-red-600" role="alert">
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
  const quizzes = useQuery({ queryKey: ["assessments", chapterId], queryFn: () => api.get<AssessmentSummary[]>(`/chapters/${chapterId}/assessments`) });
  const source = useQuery({ queryKey: ["chapter-source", chapterId], queryFn: () => api.get<ChapterSourceOut>(`/chapters/${chapterId}/source`) });
  const refresh = useRefresh(chapterId);
  const [params, setParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedPart, setSelectedPart] = useState<SceneComponent | null>(null);
  const [adding, setAdding] = useState<string | null>(null);

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
  const lessonList = lessons.data ?? [];
  const quizList = quizzes.data ?? [];
  const totals = items.reduce((a, i) => ({ parts: a.parts + i.parts, explained: a.explained + i.explained }), { parts: 0, explained: 0 });
  const lessonsWith = lessonList.filter((l) => byLesson.has(l.id)).length;

  if (chapter.isPending || board.isPending) return <div className="grid min-h-64 place-items-center text-slate-500">Loading chapter studio…</div>;
  if (chapter.error) return <div className="grid min-h-64 place-items-center text-red-600">{errorMessage(chapter.error)}</div>;
  const ch = chapter.data;

  const done: Record<StepKey, boolean> = {
    source: (source.data?.passages.length ?? 0) > 0,
    lessons: lessonList.length > 0,
    "3d": lessonList.length > 0 && lessonsWith === lessonList.length,
    quiz: quizList.length > 0,
    publish: ch.status === "published",
  };
  const step = (params.get("step") as StepKey | null) ?? (lessonList.length ? "3d" : "source");
  const goTo = (s: StepKey) => setParams((p) => { p.set("step", s); return p; }, { replace: true });
  // Anything students don't have yet: never published, or edited since the last publish.
  const stale = (x: { published_version?: number | null; has_unpublished_changes?: boolean }) => !x.published_version || !!x.has_unpublished_changes;
  const pending: PendingChanges = {
    lessons: lessonList.filter(stale).length,
    scenes: items.filter((i) => stale(i.scene)).length,
    quizzes: quizList.filter(stale).length,
  };
  const checks = [
    { label: "Chapter text", ok: done.source, detail: done.source ? `${source.data?.passages.length} passages from the textbook` : "No textbook pages linked to this chapter", step: "source" as StepKey },
    { label: "Lessons", ok: done.lessons, detail: `${lessonList.length} lesson(s), ${lessonList.filter((l) => l.published_version).length} live`, step: "lessons" as StepKey },
    { label: "3D models", ok: done["3d"], detail: `${lessonsWith}/${lessonList.length} lessons have 3D · ${totals.explained}/${totals.parts} parts explained`, step: "3d" as StepKey },
    { label: "Quiz", ok: done.quiz, detail: quizList.length ? `${quizList.length} quiz(zes)` : "No quiz yet", step: "quiz" as StepKey },
  ];

  return (
    <div className="space-y-5 text-slate-700">
      {/* Studio toolbar, under the app navbar */}
      <header className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-3 px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-widest text-teal-700">Chapter Studio</p>
            <nav aria-label="Breadcrumb" className="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm text-slate-500">
              <Link className="hover:text-slate-900" to="/teacher/courses">Courses</Link><span aria-hidden>›</span>
              {course.data && <><Link className="hover:text-slate-900" to={`/teacher/courses/${course.data.id}`}>{course.data.title}</Link><span aria-hidden>›</span></>}
              <span className="font-semibold text-slate-900">{ch.position}. {ch.title}</span>
            </nav>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <PublishStatus chapter={ch} pending={pending} reviewing={step === "publish"} onReview={() => goTo("publish")} />
            <Link to={course.data ? `/teacher/courses/${course.data.id}` : "/teacher/courses"} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:text-slate-900">Exit studio</Link>
          </div>
        </div>
        <div className="border-t border-slate-200 bg-slate-50/60">
          <StepNav step={step} done={done} onStep={goTo} />
        </div>
      </header>

      <main className="space-y-6">
        {step === "source" && (
          <section>
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-slate-900">① Source &amp; prompt</h2>
              <p className="text-sm text-slate-500">Check the textbook pages the AI will use, tell it how to teach this chapter, or generate everything at once.</p>
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              <SourcePanel chapterId={chapterId} />
              <PromptPanel chapter={ch} />
              <GeneratePanel chapter={ch} />
            </div>
          </section>
        )}

        {step === "lessons" && <LessonsStep chapterId={chapterId} lessons={lessonList} />}

        {step === "3d" && (
          <section>
            <div className="mb-4 flex flex-wrap items-end gap-3">
              <div className="mr-auto">
                <h2 className="text-lg font-semibold text-slate-900">③ 3D models</h2>
                <p className="text-sm text-slate-500">Give each lesson a 3D model: let AI choose, pick one from your 3D library, or generate a new one. Then explain its parts.</p>
              </div>
              <div className={`${panel} flex items-center gap-3 px-4 py-2.5 text-sm`}>
                <Ring size="sm" pct={totals.parts ? Math.round((totals.explained / totals.parts) * 100) : 0} />
                <dl className="grid gap-0.5">
                  <div className="flex items-baseline gap-1.5"><dt className="sr-only">Lessons with 3D</dt><dd className="text-base font-semibold text-slate-900">{lessonsWith}<span className="text-slate-400">/{lessonList.length}</span></dd><span className="text-slate-600">lessons with 3D</span></div>
                  <div className="flex items-baseline gap-1.5"><dt className="sr-only">Parts explained</dt><dd className="text-base font-semibold text-slate-900">{totals.explained}<span className="text-slate-400">/{totals.parts}</span></dd><span className="text-slate-600">parts explained</span></div>
                </dl>
              </div>
            </div>
            <GenerationTray className="mb-4" onOpen={(id) => window.open(`/teacher/assets?open=${id}`, "_blank", "noopener")} />
            <div className="grid gap-4 xl:grid-cols-[1fr_26rem]">
              <div className="space-y-4">
                <section className="relative h-[46vh] min-h-72 overflow-hidden rounded-2xl border border-slate-200 bg-[radial-gradient(ellipse_at_center,#ffffff_0%,#e8edf3_75%)]">
                  {!selected ? (
                    <div className="grid h-full place-items-center p-6 text-center text-slate-500">No 3D yet. Use “Add 3D” on a lesson below.</div>
                  ) : resolved.error ? (
                    <div className="p-6 text-sm text-red-600">{errorMessage(resolved.error)}{details(resolved.error).map((d) => <p key={d}>• {d}</p>)}</div>
                  ) : !resolved.data ? (
                    <p className="p-6 text-slate-500" role="status">Preparing preview…</p>
                  ) : (
                    <Suspense fallback={<p className="p-6 text-slate-500">Loading 3D engine…</p>}>
                      <div className="absolute inset-0">
                        <StudioViewport resolved={resolved.data} selected={selectedPart} onSelect={setSelectedPart} xray={false} zoom={1} tourStep={null} tourPlaying={false} onTourStepComplete={() => {}} resetKey={selected.scene.version} />
                      </div>
                    </Suspense>
                  )}
                  {selected && (
                    <div className="pointer-events-none absolute left-4 top-4 flex flex-wrap items-center gap-2">
                      <span className="rounded-lg bg-white/90 shadow-sm px-2 py-1 text-sm text-slate-900">{selected.scene.title}</span>
                      <span className="text-xs text-slate-500">{selected.lesson_title}{selectedPart ? ` · ${selectedPart.label}` : ""}</span>
                    </div>
                  )}
                </section>

                {lessonList.length === 0 && (
                  <p className={`${panel} p-4 text-sm text-slate-500`}>Create a lesson first (step ②), then add its 3D here.</p>
                )}
                <ol className="space-y-3" aria-label="3D by lesson">
                  {lessonList.map((l) => {
                    const scenes = byLesson.get(l.id) ?? [];
                    return (
                      <li key={l.id} className={`${panel} p-3 ${adding === l.id ? "ring-2 ring-teal-400" : ""}`}>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`grid h-6 w-6 place-items-center rounded-full text-xs font-semibold ${scenes.length ? "bg-[#38b2ac] text-[#0b0d16]" : "bg-slate-100 text-slate-600"}`}>{scenes.length ? "✓" : l.position}</span>
                          <span className="font-medium text-slate-900">{l.title}</span>
                          <span className="text-xs text-slate-500">{scenes.length ? `${scenes.length} scene${scenes.length === 1 ? "" : "s"}` : "no 3D yet"}</span>
                          <button
                            className={`ml-auto ${adding === l.id ? "inline-flex items-center gap-1.5 rounded-lg bg-teal-50 px-3 py-1.5 text-sm font-semibold text-teal-800 ring-1 ring-teal-300" : btnPrimary}`}
                            aria-pressed={adding === l.id}
                            onClick={() => setAdding(adding === l.id ? null : l.id)}
                          >
                            {adding === l.id ? "Adding 3D →" : scenes.length ? "+ Add another 3D" : "+ Add 3D"}
                          </button>
                        </div>
                        {scenes.length > 0 && (
                          <ul className="mt-3 grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
                            {scenes.map((i) => {
                              const pct = i.parts ? Math.round((i.explained / i.parts) * 100) : 0;
                              const active = i.scene.id === selected?.scene.id;
                              return (
                                <li key={i.scene.id}>
                                  <button onClick={() => setSelectedId(i.scene.id)} aria-pressed={active}
                                    className={`w-full rounded-xl border p-3 text-left transition ${active ? "border-[#38b2ac] bg-[#38b2ac]/10" : "border-slate-200 hover:border-slate-400"}`}>
                                    <span className="block truncate font-medium text-slate-900">{i.scene.title}</span>
                                    <span className="mt-1 flex flex-wrap gap-1">
                                      <Chip tone={i.scene.published_version ? (i.scene.has_unpublished_changes ? "amber" : "teal") : "slate"}>{i.scene.published_version ? (i.scene.has_unpublished_changes ? "changed" : "live") : "draft"}</Chip>
                                      {i.scene.origin === "ai" && <Chip tone="violet">AI</Chip>}
                                    </span>
                                    <span className="mt-2 block h-1.5 overflow-hidden rounded bg-slate-100"><span className="block h-full bg-[#38b2ac]" style={{ width: `${pct}%` }} /></span>
                                    <span className="mt-1 block text-xs text-slate-500">{i.explained}/{i.parts} parts explained</span>
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </div>
              <aside className="xl:sticky xl:top-4 xl:self-start">
                {adding && lessonList.some((l) => l.id === adding) ? (
                  <Add3DPanel
                    key={adding}
                    lessonId={adding}
                    lessonTitle={lessonList.find((l) => l.id === adding)?.title ?? "Lesson"}
                    onClose={() => setAdding(null)}
                    onAdded={(sceneId) => { refresh(sceneId); setSelectedId(sceneId); setAdding(null); }}
                  />
                ) : selected ? (
                  <SceneEditor key={selected.scene.id} item={selected} chapterId={chapterId} onDeleted={() => setSelectedId(null)} onDuplicated={(id) => setSelectedId(id)} />
                ) : (
                  <section className={`${panel} p-4 text-sm text-slate-500`}>Select a 3D scene to edit it, or use “+ Add 3D” on a lesson.</section>
                )}
              </aside>
            </div>
          </section>
        )}

        {step === "quiz" && <QuizStep chapterId={chapterId} quizzes={quizList} />}
        {step === "publish" && <ReviewStep chapter={ch} course={course.data} checks={checks} pending={pending} onStep={goTo} />}

        <StepFooter step={step} onStep={goTo} />
      </main>
    </div>
  );
}
