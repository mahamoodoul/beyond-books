/**
 * Chapter studio workflow: read the chapter text, write a chapter prompt, generate all content
 * (lesson → quiz → 3D scenes) in one run, review it on a board, then publish the whole chapter.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link } from "react-router";

import { api, errorMessage } from "@/api/client";
import type {
  AssessmentSummary,
  ChapterDetail,
  ChapterGenerateResult,
  ChapterSourceOut,
  CourseOut,
  JobOut,
  LessonSummary,
  PublishChapterResult,
} from "@/api/generated/schema";

import { Chip, panel } from "./StudioPage";

const btn = "inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:border-[#38b2ac]/60 hover:text-slate-900 disabled:opacity-40";
const btnPrimary = "inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#38b2ac] px-3 py-1.5 text-sm font-semibold text-[#0b0d16] hover:bg-[#4fc7c0] disabled:opacity-40";
const input = "w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 focus:border-[#38b2ac] focus:outline-none";

const TERMINAL = new Set(["completed", "failed", "cancelled"]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitForJob(job: JobOut): Promise<JobOut> {
  let j = job;
  while (!TERMINAL.has(j.status)) {
    await sleep(2000);
    j = await api.get<JobOut>(`/jobs/${j.id}`);
  }
  return j;
}

export function useChapterContent(chapterId: string) {
  const lessons = useQuery({ queryKey: ["lessons", chapterId], queryFn: () => api.get<LessonSummary[]>(`/chapters/${chapterId}/lessons`) });
  const quizzes = useQuery({ queryKey: ["assessments", chapterId], queryFn: () => api.get<AssessmentSummary[]>(`/chapters/${chapterId}/assessments`) });
  return { lessons, quizzes };
}

function useRefreshAll(chapterId: string) {
  const qc = useQueryClient();
  return () => {
    for (const key of [["lessons", chapterId], ["assessments", chapterId], ["chapter-scenes", chapterId], ["chapter", chapterId], ["scenes"], ["course"]]) {
      void qc.invalidateQueries({ queryKey: key });
    }
  };
}

/* ------------------------------------------------------------ chapter text */
export function SourcePanel({ chapterId }: { chapterId: string }) {
  const src = useQuery({ queryKey: ["chapter-source", chapterId], queryFn: () => api.get<ChapterSourceOut>(`/chapters/${chapterId}/source`) });
  const [open, setOpen] = useState(false);
  const d = src.data;
  return (
    <section className={`${panel} p-4`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900">📖 Chapter text</p>
        {d && d.passages.length > 0 && <button className={btn} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Hide" : "Read"}</button>}
      </div>
      {src.isPending && <p className="mt-2 text-sm text-slate-500">Loading text…</p>}
      {src.error && <p className="mt-2 text-sm text-red-600">{errorMessage(src.error)}</p>}
      {d && d.passages.length === 0 && (
        <p className="mt-2 text-sm text-amber-700">No textbook text found for this chapter. Upload the book under the course's <b>Sources &amp; outline</b> tab first — the AI only writes from your source.</p>
      )}
      {d && d.passages.length > 0 && (
        <p className="mt-1 text-xs text-slate-500">
          {d.passages.length} passage{d.passages.length === 1 ? "" : "s"} · {d.characters.toLocaleString()} characters ·{" "}
          {d.strategy === "chapter_page_ranges" ? "from the chapter's pages" : "matched by topic"}
          {d.truncated && " · trimmed to fit the AI limit"}
        </p>
      )}
      {open && d && (
        <div className="mt-3 max-h-72 space-y-3 overflow-auto rounded-lg bg-slate-100 p-3 text-sm leading-relaxed text-slate-600">
          {d.passages.map((p, i) => (
            <div key={i}>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-teal-700">{p.document_title} · p. {p.page_start === p.page_end ? p.page_start : `${p.page_start}–${p.page_end}`}</p>
              <p className="whitespace-pre-line">{p.text}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ---------------------------------------------------------- chapter prompt */
const EXAMPLES = [
  "Grade 8, simple language, short sentences.",
  "Use everyday analogies (sports, cooking).",
  "Focus on how the parts work together.",
];

export function PromptPanel({ chapter }: { chapter: ChapterDetail }) {
  const qc = useQueryClient();
  const [text, setText] = useState(chapter.ai_instructions ?? "");
  useEffect(() => setText(chapter.ai_instructions ?? ""), [chapter.id, chapter.ai_instructions]);
  const save = useMutation({
    mutationFn: () => api.patch<ChapterDetail>(`/chapters/${chapter.id}`, { ai_instructions: text }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chapter", chapter.id] }),
  });
  const dirty = text.trim() !== (chapter.ai_instructions ?? "");
  return (
    <section className={`${panel} p-4`}>
      <label htmlFor="chapter-prompt" className="text-sm font-semibold text-slate-900">✎ Chapter prompt</label>
      <p className="mb-2 mt-1 text-xs text-slate-500">Tell the AI how to teach this chapter. Used for the lesson, quiz and 3D. Facts still come only from the chapter text.</p>
      <textarea id="chapter-prompt" rows={5} maxLength={2000} className={input} value={text} placeholder="e.g. Grade 8 students. Explain with everyday analogies. End each section with one check-your-understanding question." onChange={(e) => setText(e.target.value)} />
      <div className="mt-2 flex flex-wrap gap-1">
        {EXAMPLES.map((x) => (
          <button key={x} type="button" className="rounded-md border border-slate-200 px-2 py-0.5 text-xs text-slate-500 hover:text-slate-900" onClick={() => setText((t) => (t.trim() ? `${t.trim()} ${x}` : x))}>+ {x}</button>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button className={btn} disabled={!dirty || save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : dirty ? "Save prompt" : "Saved"}</button>
        <span className="text-xs text-slate-500">{text.length}/2000</span>
      </div>
      {save.error && <p className="mt-2 text-sm text-red-600">{errorMessage(save.error)}</p>}
    </section>
  );
}

/* ----------------------------------------------------- generate everything */
type StepState = "idle" | "running" | "done" | "failed" | "skipped";
interface Step { state: StepState; note?: string }
const STEPS = [
  { key: "lesson", label: "Lesson", hint: "Writes a new lesson from the chapter text" },
  { key: "quiz", label: "Quiz", hint: "Questions linked to the learning objectives" },
  { key: "scenes", label: "3D scenes", hint: "A 3D scene for each lesson without one" },
] as const;
type StepKey = (typeof STEPS)[number]["key"];

const stateChip: Record<StepState, { tone: "slate" | "teal" | "amber" | "violet"; text: string }> = {
  idle: { tone: "slate", text: "waiting" },
  running: { tone: "violet", text: "working…" },
  done: { tone: "teal", text: "done" },
  failed: { tone: "amber", text: "failed" },
  skipped: { tone: "slate", text: "skipped" },
};

export function GeneratePanel({ chapter }: { chapter: ChapterDetail }) {
  const { lessons, quizzes } = useChapterContent(chapter.id);
  const refresh = useRefreshAll(chapter.id);
  const hasLessons = (lessons.data?.length ?? 0) > 0;
  const hasQuiz = (quizzes.data?.length ?? 0) > 0;
  const [pick, setPick] = useState<Record<StepKey, boolean> | null>(null);
  const chosen = pick ?? { lesson: !hasLessons, quiz: !hasQuiz, scenes: true };
  const [steps, setSteps] = useState<Record<StepKey, Step> | null>(null);
  const [running, setRunning] = useState(false);
  const set = (k: StepKey, s: Step) => setSteps((prev) => ({ ...(prev as Record<StepKey, Step>), [k]: s }));

  const runJob = async (k: StepKey, path: string) => {
    set(k, { state: "running" });
    try {
      const job = await waitForJob(await api.post<JobOut>(path));
      if (job.status === "completed") set(k, { state: "done" });
      else set(k, { state: "failed", note: job.error_message ?? "The AI could not finish this step." });
      return job.status === "completed";
    } catch (e) {
      set(k, { state: "failed", note: errorMessage(e) });
      return false;
    } finally {
      refresh();
    }
  };

  const run = async () => {
    setRunning(true);
    setSteps({
      lesson: { state: chosen.lesson ? "idle" : "skipped" },
      quiz: { state: chosen.quiz ? "idle" : "skipped" },
      scenes: { state: chosen.scenes ? "idle" : "skipped" },
    });
    // The lesson and the quiz both read the chapter text, so they run side by side.
    const lessonRun = chosen.lesson ? runJob("lesson", `/chapters/${chapter.id}/ai/lesson`) : Promise.resolve(true);
    const quizRun = chosen.quiz ? runJob("quiz", `/chapters/${chapter.id}/ai/assessment`) : Promise.resolve(true);
    await lessonRun; // 3D scenes are planned from lesson content, so they wait for the lesson.
    if (chosen.scenes) {
      set("scenes", { state: "running" });
      try {
        const r = await api.post<ChapterGenerateResult>(`/chapters/${chapter.id}/ai/scenes`, { only_missing: true });
        const jobs = await Promise.all(r.items.filter((i) => i.job_id).map((i) => waitForJob({ id: i.job_id as string, status: i.status } as JobOut)));
        const made = jobs.filter((j) => j.status === "completed").length;
        const failed = jobs.length - made;
        const skipped = r.items.filter((i) => !i.job_id).length;
        set("scenes", {
          state: failed && !made ? "failed" : "done",
          note: [made && `${made} planned`, failed && `${failed} failed`, skipped && `${skipped} lesson(s) skipped`].filter(Boolean).join(" · ") || "Nothing to plan",
        });
      } catch (e) {
        set("scenes", { state: "failed", note: errorMessage(e) });
      } finally {
        refresh();
      }
    }
    await quizRun;
    setRunning(false);
  };

  const nothing = !chosen.lesson && !chosen.quiz && !chosen.scenes;
  return (
    <section className={`${panel} p-4`}>
      <p className="text-sm font-semibold text-slate-900">✦ Generate chapter content</p>
      <p className="mb-3 mt-1 text-xs text-slate-500">Everything is created as a draft. Review it, then publish the chapter.</p>
      <ul className="space-y-2">
        {STEPS.map((s, i) => {
          const st = steps?.[s.key];
          return (
            <li key={s.key} className="rounded-lg border border-slate-200 p-2">
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" disabled={running} checked={chosen[s.key]} onChange={(e) => setPick({ ...chosen, [s.key]: e.target.checked })} />
                <span className="flex-1">
                  <span className="text-slate-900">{i + 1}. {s.label}</span>
                  <span className="block text-xs text-slate-500">{s.hint}{s.key === "lesson" && hasLessons ? " (adds another lesson)" : ""}{s.key === "quiz" && hasQuiz ? " (adds another quiz)" : ""}</span>
                </span>
                {st && <Chip tone={stateChip[st.state].tone}>{stateChip[st.state].text}</Chip>}
              </label>
              {st?.note && <p className={`mt-1 pl-6 text-xs ${st.state === "failed" ? "text-red-600" : "text-slate-500"}`} role={st.state === "failed" ? "alert" : undefined}>{st.note}</p>}
            </li>
          );
        })}
      </ul>
      <button className={`${btnPrimary} mt-3 w-full`} disabled={running || nothing} onClick={() => void run()}>
        {running ? "Generating…" : "Generate selected content"}
      </button>
    </section>
  );
}

/* ------------------------------------------------------------ publish bar */
export function PublishBar({ chapter, course }: { chapter: ChapterDetail; course: CourseOut | undefined }) {
  const refresh = useRefreshAll(chapter.id);
  const qc = useQueryClient();
  const courseDraft = course?.status === "draft";
  const [withCourse, setWithCourse] = useState(true);
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<PublishChapterResult | null>(null);
  const publish = useMutation({
    mutationFn: () => api.post<PublishChapterResult>(`/chapters/${chapter.id}/publish`, { include_course: courseDraft && withCourse }),
    onSuccess: (r) => { setResult(r); setOpen(false); refresh(); void qc.invalidateQueries({ queryKey: ["course", chapter.course_id] }); },
  });
  const unpublish = useMutation({
    mutationFn: () => api.patch<ChapterDetail>(`/chapters/${chapter.id}`, { status: "draft" }),
    onSuccess: () => { setResult(null); refresh(); },
  });
  const live = chapter.status === "published";

  return (
    <div className="relative flex flex-wrap items-center gap-2">
      <Chip tone={live ? "teal" : "slate"}>{live ? "chapter live" : "chapter draft"}</Chip>
      <Link to={`/teacher/chapters/${chapter.id}/preview`} className={btn}>👁 Preview</Link>
      <button className={btnPrimary} onClick={() => setOpen(!open)} aria-expanded={open}>{live ? "Publish updates" : "Publish chapter"}</button>
      {live && <button className={btn} disabled={unpublish.isPending} onClick={() => confirm("Hide this chapter from students?") && unpublish.mutate()}>Unpublish</button>}

      {open && (
        <div role="dialog" aria-label="Publish chapter" className={`${panel} absolute right-0 top-11 z-20 w-80 space-y-3 p-4 text-sm shadow-xl`}>
          <p className="font-semibold text-slate-900">Publish “{chapter.title}”</p>
          <p className="text-slate-500">Students enrolled in <b className="text-slate-700">{course?.title}</b> will see this chapter with all its lessons, 3D scenes and quizzes. Items that are not ready (for example an empty lesson) are skipped and listed.</p>
          {courseDraft && (
            <label className="flex items-start gap-2 text-slate-600">
              <input type="checkbox" className="mt-1" checked={withCourse} onChange={(e) => setWithCourse(e.target.checked)} />
              The course is still a draft — publish the course too, so students can open it.
            </label>
          )}
          <div className="flex gap-2">
            <button className={btnPrimary} disabled={publish.isPending} onClick={() => publish.mutate()}>{publish.isPending ? "Publishing…" : "Publish now"}</button>
            <button className={btn} onClick={() => setOpen(false)}>Cancel</button>
          </div>
          {publish.error && <p className="text-red-600" role="alert">{errorMessage(publish.error)}</p>}
        </div>
      )}

      {result && (
        <div role="status" className={`${panel} absolute right-0 top-11 z-10 w-80 p-4 text-sm`}>
          <div className="mb-1 flex items-center justify-between"><p className="font-semibold text-teal-700">✓ Chapter published</p><button className="text-slate-500 hover:text-slate-900" aria-label="Close" onClick={() => setResult(null)}>✕</button></div>
          <p className="text-slate-600">{result.lessons_published} lesson(s) · {result.scenes_published} 3D scene(s) · {result.assessments_published} quiz(zes)</p>
          {result.course_status !== "published" && <p className="mt-1 text-amber-700">The course is still a draft, so students can't open it yet.</p>}
          {result.skipped.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs text-amber-700">
              {result.skipped.map((s) => <li key={s.id}>Skipped {s.kind} “{s.title}”: {s.reason}</li>)}
            </ul>
          )}
          <Link to={`/teacher/chapters/${chapter.id}/preview`} className="mt-2 inline-block text-teal-700 hover:underline">See how students see it →</Link>
        </div>
      )}
    </div>
  );
}
