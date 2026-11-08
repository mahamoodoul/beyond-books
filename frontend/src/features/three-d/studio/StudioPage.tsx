import { useMutation } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router";

import { errorMessage } from "@/api/client";
import type { SceneComponent, SceneOut, SceneSpec } from "@/api/generated/schema";
import { PlanSceneButton } from "@/features/three-d/PlanSceneButton";
import { useJob } from "@/features/jobs/useJob";

import {
  addQuestionToChapterQuiz,
  startInsight,
  usePublishScene,
  useResolved,
  useSaveSpec,
  useStudioData,
  type InsightAction,
  type QuizQuestion,
} from "./useStudio";

const StudioViewport = lazy(() => import("./StudioViewport"));

/* ---------- small dark-theme primitives (studio only) ---------- */
export const panel = "rounded-2xl border border-slate-200 bg-white shadow-sm";
export function ToolButton({ label, active, onClick, children }: { label: string; active?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={onClick}
      className={`grid h-11 w-11 place-items-center rounded-xl border text-lg transition ${active ? "border-[#38b2ac] bg-[#38b2ac]/20 text-slate-900" : "border-slate-200 bg-white text-slate-600 hover:text-slate-900"}`}
    >
      {children}
    </button>
  );
}
export function Chip({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "teal" | "amber" | "violet" }) {
  const t = { slate: "bg-slate-100 text-slate-600", teal: "bg-teal-50 text-teal-700 ring-1 ring-teal-200", amber: "bg-amber-50 text-amber-700 ring-1 ring-amber-200", violet: "bg-violet-50 text-violet-700 ring-1 ring-violet-200" };
  return <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${t[tone]}`}>{children}</span>;
}
/** Progress ring: teal when complete, amber while in progress; track and label follow the theme. */
export function Ring({ pct, size = "md" }: { pct: number; size?: "sm" | "md" }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const done = pct >= 100;
  return (
    <svg viewBox="0 0 100 100" className={size === "sm" ? "h-16 w-16" : "h-24 w-24"} role="img" aria-label={`${pct}% of parts explained`}>
      <circle cx="50" cy="50" r={r} fill="none" style={{ stroke: "var(--line-strong)" }} strokeWidth="9" />
      <circle cx="50" cy="50" r={r} fill="none" stroke={done ? "#38b2ac" : "#f59e0b"} strokeWidth="9" strokeLinecap="round"
        strokeDasharray={`${(pct / 100) * c} ${c}`} transform="rotate(-90 50 50)" />
      <text x="50" y="50" dominantBaseline="central" textAnchor="middle" style={{ fill: "var(--ink)" }} fontSize={size === "sm" ? 24 : 22} fontWeight="600">{pct}%</text>
    </svg>
  );
}

/* ---------- AI actions ---------- */
function AIActions({ scene, part, parts, chapterId, onUse }: {
  scene: SceneOut;
  part: SceneComponent;
  parts: SceneComponent[];
  chapterId: string;
  onUse: (text: string, mode: "replace" | "append") => void;
}) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [compareWith, setCompareWith] = useState("");
  const job = useJob(jobId);
  const start = useMutation({
    mutationFn: (action: InsightAction) =>
      startInsight(scene.id, { component_id: part.component_id, action, ...(action === "compare" ? { compare_with: compareWith } : {}) }),
    onSuccess: (j) => setJobId(j.id),
  });
  const addQuiz = useMutation({ mutationFn: (q: QuizQuestion) => addQuestionToChapterQuiz(chapterId, q) });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- clear the result when the part changes
  useEffect(() => { setJobId(null); addQuiz.reset(); }, [part.component_id]);
  const running = start.isPending || (!!job.data && !["completed", "failed"].includes(job.data.status));
  const result = job.data?.status === "completed" ? (job.data.result as { text: string; question?: QuizQuestion }) : null;
  const others = parts.filter((p) => p.component_id !== part.component_id);
  const btn = "inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:border-[#38b2ac]/60 hover:text-slate-900 disabled:opacity-40";

  return (
    <div className="rounded-xl border border-amber-300/30 bg-amber-300/[0.04] p-3">
      <p className="mb-2 text-sm font-semibold text-amber-700">✦ AI Actions</p>
      <div className="flex flex-wrap gap-2">
        <button className={btn} disabled={running} onClick={() => start.mutate("explain_deeper")}>📖 Explain in depth</button>
        <button className={btn} disabled={running} onClick={() => start.mutate("simplify")}>🧒 Simplify</button>
        <button className={btn} disabled={running} onClick={() => start.mutate("quiz_question")}>❓ Quiz question</button>
      </div>
      <div className="mt-2 flex gap-2">
        <select aria-label="Compare with part" value={compareWith} onChange={(e) => setCompareWith(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-700">
          <option value="">Compare with…</option>
          {others.map((o) => <option key={o.component_id} value={o.component_id}>{o.label}</option>)}
        </select>
        <button className={btn} disabled={running || !compareWith} onClick={() => start.mutate("compare")}>⇄ Compare</button>
      </div>
      {running && <p className="mt-3 text-sm text-slate-500" role="status">Thinking…</p>}
      {(start.error || job.data?.status === "failed") && (
        <p className="mt-3 text-sm text-red-600" role="alert">{start.error ? errorMessage(start.error) : job.data?.error_message}</p>
      )}
      {result && (
        <div className="mt-3 space-y-2 rounded-lg bg-white/80 p-3 text-sm text-slate-700" aria-live="polite">
          {result.question ? (
            <>
              <p className="font-medium text-slate-900">{result.question.question_text}</p>
              <ol className="list-[upper-alpha] space-y-0.5 pl-5">
                {result.question.options.map((o, i) => (
                  <li key={i} className={i === result.question!.correct_index ? "text-teal-700" : ""}>{o}{i === result.question!.correct_index && " ✓"}</li>
                ))}
              </ol>
              {result.question.explanation && <p className="text-slate-500">{result.question.explanation}</p>}
              <button className={btn} disabled={addQuiz.isPending || addQuiz.isSuccess} onClick={() => addQuiz.mutate(result.question!)}>
                {addQuiz.isSuccess ? "Added to chapter quiz ✓" : "+ Add to chapter quiz"}
              </button>
              {addQuiz.error && <p className="text-red-600">{errorMessage(addQuiz.error)}</p>}
            </>
          ) : (
            <>
              <p className="whitespace-pre-line">{result.text}</p>
              <div className="flex gap-2">
                <button className={btn} onClick={() => onUse(result.text, "replace")}>Use as explanation</button>
                <button className={btn} onClick={() => onUse(result.text, "append")}>Append</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- page ---------- */
export default function StudioPage() {
  const { lessonId = "" } = useParams();
  const { lesson, chapter, course, outline, scenes } = useStudioData(lessonId);
  const [sceneIdx, setSceneIdx] = useState(0);
  const scene = scenes.data?.[sceneIdx];
  const resolved = useResolved(scene?.id);
  const save = useSaveSpec(lessonId);
  const publish = usePublishScene(lessonId);
  const [selected, setSelected] = useState<SceneComponent | null>(null);
  const [xray, setXray] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [resetKey, setResetKey] = useState(0);
  const [showParts, setShowParts] = useState(true);
  const [tour, setTour] = useState<{ step: number; playing: boolean } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [openChapter, setOpenChapter] = useState<string | null>(null);

  const spec = scene?.spec;
  const parts = useMemo(() => spec?.components ?? [], [spec]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- reset selection only when the scene changes
  useEffect(() => { setSelected(parts[0] ?? null); setTour(null); }, [scene?.id]);
  useEffect(() => { if (chapter.data) setOpenChapter(chapter.data.id); }, [chapter.data]);

  const explanationOf = (c: SceneComponent | null) => (c?.explanation_ref ? spec?.explanations?.[c.explanation_ref] : undefined);
  const explained = parts.filter((c) => !!explanationOf(c)).length;
  const readiness = parts.length ? Math.round((explained / parts.length) * 100) : 0;
  const allLessons = outline.data?.chapters.flatMap((c) => c.lessons) ?? [];
  const published = allLessons.filter((l) => l.published).length;
  const nextLesson = allLessons[allLessons.findIndex((l) => l.id === lessonId) + 1];
  const animation = resolved.data?.animations?.[0];

  const saveExplanation = (c: SceneComponent, text: string) => {
    if (!scene || !spec) return;
    const ref = c.explanation_ref ?? `exp_${c.component_id}`.slice(0, 64);
    const next: SceneSpec = {
      ...spec,
      components: (spec.components ?? []).map((x) => (x.component_id === c.component_id ? { ...x, explanation_ref: ref } : x)),
      explanations: { ...(spec.explanations ?? {}), [ref]: text },
    };
    save.mutate({ scene, spec: next }, { onSuccess: () => setEditing(null) });
  };
  const nextPart = () => {
    if (!parts.length) return;
    const i = parts.findIndex((p) => p.component_id === selected?.component_id);
    setSelected(parts[(i + 1) % parts.length] ?? null);
  };

  if (lesson.isPending || scenes.isPending) return <div className="grid min-h-screen place-items-center bg-slate-50 text-slate-500">Loading 3D Studio…</div>;
  if (lesson.error) return <div className="grid min-h-screen place-items-center bg-slate-50 text-red-600">{errorMessage(lesson.error)}</div>;
  const l = lesson.data;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-700">
      {/* top bar */}
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-5 py-3">
        <Link to={`/teacher/lessons/${lessonId}`} className="text-lg font-semibold text-slate-900">Beyond Books <span className="text-teal-700">Studio</span></Link>
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
          <Link className="hover:text-slate-900" to="/teacher">Courses</Link><span>›</span>
          {course.data && <><Link className="hover:text-slate-900" to={`/teacher/courses/${course.data.id}`}>{course.data.title}</Link><span>›</span></>}
          {chapter.data && <><Link className="hover:text-slate-900" to={`/teacher/chapters/${chapter.data.id}`}>{chapter.data.title}</Link><span>›</span></>}
          <span className="text-slate-900">{l.title}</span>
        </nav>
        <div className="ml-auto flex gap-2">
          {(scenes.data?.length ?? 0) > 1 && scenes.data!.map((s, i) => (
            <button key={s.id} onClick={() => setSceneIdx(i)} className={`rounded-lg px-3 py-1.5 text-sm ${i === sceneIdx ? "bg-[#38b2ac]/20 text-slate-900" : "text-slate-500 hover:text-slate-900"}`}>{s.title}</button>
          ))}
          <Link to={`/teacher/lessons/${lessonId}`} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:text-slate-900">Exit studio</Link>
        </div>
      </header>

      <div className="grid gap-4 p-4 lg:grid-cols-[19rem_1fr_23rem]">
        {/* left: course + chapters */}
        <aside className="space-y-4">
          <section className={`${panel} p-4`}>
            <p className="text-xs uppercase tracking-wider text-slate-500">Course</p>
            <h1 className="mt-1 text-xl font-semibold text-slate-900">{course.data?.title ?? "…"}</h1>
            <p className="text-sm text-slate-500">{[course.data?.subject, course.data?.grade_level].filter(Boolean).join(" · ") || "—"}</p>
            <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-3">
              <div className="mb-2 flex justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">
                <span>Published</span><span>{published}/{allLessons.length} lessons</span>
              </div>
              <div className="flex gap-1">
                {(outline.data?.chapters ?? []).map((c) => {
                  const done = c.lessons.filter((x) => x.published).length;
                  return <span key={c.id} className="h-1.5 flex-1 overflow-hidden rounded bg-slate-100"><span className="block h-full bg-[#38b2ac]" style={{ width: `${c.lessons.length ? (done / c.lessons.length) * 100 : 0}%` }} /></span>;
                })}
              </div>
            </div>
            <dl className="mt-4 space-y-2 text-sm">
              {[
                ["Chapters", String(outline.data?.chapters.length ?? "—")],
                ["Lessons", String(allLessons.length)],
                ["3D scenes here", String(scenes.data?.length ?? 0)],
                ["AI generated", l.origin === "ai" ? "Yes" : "No"],
                ["Course status", course.data?.status ?? "—"],
              ].map(([k, v]) => <div key={k} className="flex justify-between"><dt className="text-slate-500">{k}</dt><dd className="text-slate-900">{v}</dd></div>)}
            </dl>
          </section>
          <section className={`${panel} p-3`}>
            <p className="mb-2 px-1 text-sm font-semibold text-slate-900">{outline.data?.chapters.length ?? 0} Chapters</p>
            <ul className="space-y-2">
              {(outline.data?.chapters ?? []).map((c) => {
                const open = openChapter === c.id;
                const done = c.lessons.filter((x) => x.published).length;
                const pct = c.lessons.length ? Math.round((done / c.lessons.length) * 100) : 0;
                return (
                  <li key={c.id} className={`rounded-xl border ${open ? "border-[#38b2ac]/60 bg-[#38b2ac]/[0.06]" : "border-slate-200"}`}>
                    <button className="flex w-full items-center gap-3 p-3 text-left" aria-expanded={open} onClick={() => setOpenChapter(open ? null : c.id)}>
                      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border text-[11px] font-semibold ${pct === 100 ? "border-[#38b2ac] bg-[#38b2ac] text-[#0b0d16]" : "border-slate-300 text-slate-600"}`}>{pct === 100 ? "✓" : `${pct}%`}</span>
                      <span className="min-w-0 flex-1"><span className="block text-xs text-slate-500">Chapter {c.position}</span><span className="block truncate text-sm font-medium text-slate-900">{c.title}</span></span>
                      <span className="text-slate-500">{open ? "▴" : "▾"}</span>
                    </button>
                    {open && (
                      <ul className="space-y-1 border-t border-slate-200 p-2">
                        {c.lessons.map((x) => (
                          <li key={x.id}>
                            <Link to={`/teacher/lessons/${x.id}/studio`} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${x.id === lessonId ? "bg-slate-100 text-slate-900" : "text-slate-600 hover:bg-slate-50"}`}>
                              <span aria-hidden>{x.id === lessonId ? "▶" : x.published ? "●" : "○"}</span>
                              <span className="min-w-0 flex-1 truncate">{x.title}</span>
                              <Chip tone={x.published ? "teal" : "slate"}>{x.published ? "Live" : "Draft"}</Chip>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        </aside>

        {/* centre: viewport */}
        <main id="main-content" tabIndex={-1} aria-label="3D viewport" className="relative min-h-[70vh] overflow-hidden rounded-2xl border border-slate-200 bg-[radial-gradient(ellipse_at_center,#ffffff_0%,#e8edf3_75%)]">
          {!scene ? (
            <div className="grid h-full min-h-[70vh] place-items-center p-8 text-center">
              <div className="max-w-sm space-y-3">
                <p className="text-lg font-semibold text-slate-900">No 3D scene for this lesson yet</p>
                <p className="text-sm text-slate-500">Let AI pick a model or generator from the lesson content, then explore and refine it here.</p>
                <div className="rounded-xl bg-white p-3 text-left text-slate-900"><PlanSceneButton lessonId={lessonId} /></div>
              </div>
            </div>
          ) : resolved.error ? (
            <p className="p-6 text-red-600">{errorMessage(resolved.error)}</p>
          ) : !resolved.data ? (
            <p className="p-6 text-slate-500" role="status">Preparing 3D scene…</p>
          ) : (
            <Suspense fallback={<p className="p-6 text-slate-500">Loading 3D engine…</p>}>
              <div className="absolute inset-0">
                <StudioViewport
                  resolved={resolved.data}
                  selected={selected}
                  onSelect={(c) => { setSelected(c); setEditing(null); }}
                  xray={xray}
                  zoom={zoom}
                  tourStep={tour?.step ?? null}
                  tourPlaying={!!tour?.playing}
                  onTourStepComplete={() => setTour((t) => t && animation && t.step < animation.steps.length - 1 ? { ...t, step: t.step + 1 } : t && { ...t, playing: false })}
                  resetKey={resetKey}
                />
              </div>
            </Suspense>
          )}
          {scene && (
            <>
              <div className="absolute left-4 top-4 flex flex-wrap items-center gap-2">
                <Chip tone={scene.published_version ? "teal" : "amber"}>{scene.published_version ? (scene.has_unpublished_changes ? "Unpublished changes" : "Published") : "Draft"}</Chip>
                {scene.origin === "ai" && <Chip tone="violet">AI planned</Chip>}
                <span className="text-sm text-slate-500">{scene.title}</span>
              </div>
              {showParts && parts.length > 0 && (
                <ul className={`${panel} absolute left-4 top-14 max-h-[55%] w-52 space-y-0.5 overflow-auto p-2`} aria-label="Parts">
                  {parts.map((c) => (
                    <li key={c.component_id}>
                      <button onClick={() => setSelected(c)} className={`w-full truncate rounded-lg px-2 py-1 text-left text-sm ${selected?.component_id === c.component_id ? "bg-[#38b2ac]/25 text-slate-900" : "text-slate-600 hover:bg-slate-50"}`}>
                        {explanationOf(c) ? "● " : "○ "}{c.label}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {tour && animation && (
                <div className={`${panel} absolute bottom-20 left-1/2 w-[min(32rem,90%)] -translate-x-1/2 p-3 text-sm`} aria-live="polite">
                  <p className="text-xs text-slate-500">Guided tour · step {tour.step + 1}/{animation.steps.length}</p>
                  <p className="text-slate-900">{animation.steps[tour.step]?.explanation ?? "…"}</p>
                </div>
              )}
              <div className="absolute bottom-4 left-4 flex gap-2">
                <ToolButton label="Parts list" active={showParts} onClick={() => setShowParts((v) => !v)}>☰</ToolButton>
                <ToolButton label="X-ray (fade other parts)" active={xray} onClick={() => setXray((v) => !v)}>◎</ToolButton>
                {animation && (
                  <ToolButton label={tour?.playing ? "Pause tour" : "Play guided tour"} active={!!tour} onClick={() => setTour((t) => (t ? { ...t, playing: !t.playing } : { step: 0, playing: true }))}>{tour?.playing ? "❚❚" : "▶"}</ToolButton>
                )}
                <ToolButton label="Reset view" onClick={() => { setResetKey((k) => k + 1); setZoom(1); setTour(null); }}>⟳</ToolButton>
              </div>
              <div className="absolute bottom-4 right-4 flex items-center gap-2">
                <ToolButton label="Zoom out" onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.1).toFixed(2)))}>−</ToolButton>
                <span className={`${panel} grid h-11 min-w-16 place-items-center px-3 text-sm tabular-nums text-slate-900`}>{Math.round(zoom * 100)}%</span>
                <ToolButton label="Zoom in" onClick={() => setZoom((z) => Math.min(3, +(z + 0.1).toFixed(2)))}>+</ToolButton>
              </div>
            </>
          )}
        </main>

        {/* right: part details + AI + readiness */}
        <aside className="space-y-4">
          <section className={`${panel} space-y-3 p-4`}>
            {selected ? (
              <>
                <div>
                  <h2 className="text-2xl font-semibold text-slate-900">{selected.label}</h2>
                  <p className="text-sm text-slate-500">{spec?.title}</p>
                </div>
                <div className="flex gap-1.5 overflow-x-auto pb-1" aria-label="Quick select part">
                  {parts.map((c) => (
                    <button key={c.component_id} onClick={() => setSelected(c)} title={c.label}
                      className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-xs ${c.component_id === selected.component_id ? "border-[#38b2ac] bg-[#38b2ac]/15 text-slate-900" : "border-slate-200 text-slate-500 hover:text-slate-900"}`}>
                      {c.label}
                    </button>
                  ))}
                </div>
                {editing !== null ? (
                  <div className="space-y-2">
                    <textarea aria-label="Explanation" rows={6} value={editing} onChange={(e) => setEditing(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white p-2 text-sm text-slate-900 focus:border-[#38b2ac] focus:outline-none" />
                    <div className="flex gap-2">
                      <button className="rounded-lg bg-[#38b2ac] px-3 py-1.5 text-sm font-semibold text-[#0b0d16] disabled:opacity-50" disabled={save.isPending || !editing.trim()} onClick={() => saveExplanation(selected, editing.trim())}>Save</button>
                      <button className="rounded-lg px-3 py-1.5 text-sm text-slate-500 hover:text-slate-900" onClick={() => setEditing(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="text-[15px] leading-relaxed text-slate-700">{explanationOf(selected) ?? <span className="italic text-slate-500">No explanation yet — write one or use an AI action.</span>}</p>
                    <button className="mt-2 text-sm text-teal-700 hover:underline" onClick={() => setEditing(explanationOf(selected) ?? "")}>✎ Edit explanation</button>
                  </div>
                )}
                {save.error && <p className="text-sm text-red-600" role="alert">{errorMessage(save.error)}</p>}
                {scene && chapter.data && (
                  <AIActions scene={scene} part={selected} parts={parts} chapterId={chapter.data.id}
                    onUse={(text, mode) => saveExplanation(selected, mode === "append" && explanationOf(selected) ? `${explanationOf(selected)}\n\n${text}` : text)} />
                )}
                <button className="w-full rounded-xl bg-[#38b2ac] py-2.5 text-sm font-bold uppercase tracking-wide text-[#0b0d16] hover:bg-[#4fc7c0]" onClick={nextPart}>Continue → next part</button>
              </>
            ) : (
              <p className="text-sm text-slate-500">Select a part in the model to see and edit its explanation.</p>
            )}
          </section>
          {scene && (
            <section className={`${panel} p-4`}>
              <p className="mb-2 text-sm font-semibold text-slate-900">◎ Scene readiness</p>
              <div className="flex items-center gap-4">
                <Ring pct={readiness} />
                <div className="space-y-1 text-sm">
                  <Chip tone={readiness === 100 ? "teal" : "amber"}>{readiness === 100 ? "Ready" : "Almost there"}</Chip>
                  <p className="text-2xl font-semibold text-slate-900">{explained} / {parts.length} <span className="text-sm font-normal text-slate-500">parts explained</span></p>
                  <button className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:border-[#38b2ac] disabled:opacity-40" disabled={publish.isPending || (!!scene.published_version && !scene.has_unpublished_changes)} onClick={() => publish.mutate(scene.id)}>
                    {scene.published_version && !scene.has_unpublished_changes ? "Published ✓" : "Publish scene"}
                  </button>
                  {publish.error && <p className="text-red-600">{errorMessage(publish.error)}</p>}
                </div>
              </div>
            </section>
          )}
          <section className={`${panel} p-4`}>
            <p className="mb-2 text-sm font-semibold text-slate-900">⇥ Next lesson</p>
            {nextLesson ? (
              <Link to={`/teacher/lessons/${nextLesson.id}/studio`} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5 hover:border-[#38b2ac]">
                <span className="truncate text-slate-900">{nextLesson.title}</span>
                <Chip tone={nextLesson.published ? "teal" : "slate"}>{nextLesson.published ? "Live" : "Draft"}</Chip>
              </Link>
            ) : <p className="text-sm text-slate-500">This is the last lesson.</p>}
          </section>
        </aside>
      </div>
    </div>
  );
}
