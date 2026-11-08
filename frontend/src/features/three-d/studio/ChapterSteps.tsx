/**
 * Chapter Studio steps: ① Source & prompt → ② Lessons → ③ 3D models → ④ Quiz → ⑤ Review & publish.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router";

import { api, errorMessage } from "@/api/client";
import type { AssessmentSummary, ChapterDetail, CourseOut, JobOut, LessonOut, LessonSummary } from "@/api/generated/schema";
import { useJob } from "@/features/jobs/useJob";

import { BuildingBadge } from "../GenerationTray";
import { type PendingChanges, PublishPanel } from "./ChapterWorkflow";
import { Chip, panel } from "./StudioPage";

export const STEPS = [
  { key: "source", label: "Source & prompt" },
  { key: "lessons", label: "Lessons" },
  { key: "3d", label: "3D models" },
  { key: "quiz", label: "Quiz" },
  { key: "publish", label: "Review & publish" },
] as const;
export type StepKey = (typeof STEPS)[number]["key"];

const btn = "inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:border-[#38b2ac]/60 hover:text-slate-900 disabled:opacity-40";
const btnPrimary = "inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#38b2ac] px-3 py-1.5 text-sm font-semibold text-[#0b0d16] hover:bg-[#4fc7c0] disabled:opacity-40";

export function StepNav({ step, done, onStep }: { step: StepKey; done: Record<StepKey, boolean>; onStep: (s: StepKey) => void }) {
  return (
    <nav aria-label="Chapter steps" className="px-5 py-3">
      <ol className="flex flex-wrap items-center gap-2">
        {STEPS.map((s, i) => {
          const active = s.key === step;
          return (
            <li key={s.key} className="flex items-center gap-2">
              <button
                type="button"
                aria-current={active ? "step" : undefined}
                onClick={() => onStep(s.key)}
                className={`flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm transition ${active ? "bg-[#38b2ac]/15 text-slate-900 ring-1 ring-[#38b2ac]" : "text-slate-500 hover:text-slate-900"}`}
              >
                <span className={`grid h-6 w-6 place-items-center rounded-full text-xs font-semibold ${done[s.key] ? "bg-[#38b2ac] text-[#0b0d16]" : active ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}>
                  {done[s.key] ? "✓" : i + 1}
                </span>
                {s.label}
                {s.key === "3d" && <BuildingBadge />}
              </button>
              {i < STEPS.length - 1 && <span aria-hidden className="h-px w-5 bg-slate-200" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function StepFooter({ step, onStep }: { step: StepKey; onStep: (s: StepKey) => void }) {
  const i = STEPS.findIndex((s) => s.key === step);
  const prev = STEPS[i - 1];
  const next = STEPS[i + 1];
  return (
    <div className="flex items-center justify-between border-t border-slate-200 pt-4">
      {prev ? <button className={btn} onClick={() => onStep(prev.key)}>← {prev.label}</button> : <span />}
      {next && <button className={btnPrimary} onClick={() => onStep(next.key)}>Next: {next.label} →</button>}
    </div>
  );
}

/** Start an AI job for the chapter and report when it's done. */
function useChapterJob(path: string, onDone: () => void) {
  const [jobId, setJobId] = useState<string | null>(null);
  const job = useJob(jobId);
  const start = useMutation({ mutationFn: () => api.post<JobOut>(path), onSuccess: (j) => setJobId(j.id) });
  const status = job.data?.status;
  const running = start.isPending || (!!jobId && !["completed", "failed"].includes(status ?? ""));
  useEffect(() => {
    if (status !== "completed") return;
    onDone();
    setJobId(null);
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps
  const error = start.error ? errorMessage(start.error) : status === "failed" ? job.data?.error_message : null;
  return { start: () => start.mutate(), running, error };
}

function StepIntro({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-4">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <p className="text-sm text-slate-500">{children}</p>
    </div>
  );
}

const status = (published: unknown, changed: boolean) =>
  published ? (changed ? <Chip tone="amber">changed</Chip> : <Chip tone="teal">live</Chip>) : <Chip>draft</Chip>;

/* ------------------------------------------------------------------ lessons */
export function LessonsStep({ chapterId, lessons }: { chapterId: string; lessons: LessonSummary[] }) {
  const qc = useQueryClient();
  const refresh = () => void qc.invalidateQueries({ queryKey: ["lessons", chapterId] });
  const gen = useChapterJob(`/chapters/${chapterId}/ai/lesson`, refresh);
  const blank = useMutation({ mutationFn: () => api.post<LessonOut>(`/chapters/${chapterId}/lessons`, { title: "New lesson" }), onSuccess: refresh });
  return (
    <section>
      <StepIntro title="② Lessons">The AI writes a lesson from the chapter text and your prompt. Edit any lesson before publishing.</StepIntro>
      <div className="mb-3 flex flex-wrap gap-2">
        <button className={btnPrimary} disabled={gen.running} onClick={gen.start}>{gen.running ? "Writing a lesson…" : "✦ Generate a lesson with AI"}</button>
        <button className={btn} disabled={blank.isPending} onClick={() => blank.mutate()}>+ Blank lesson</button>
      </div>
      {gen.error && <p role="alert" className="mb-2 text-sm text-red-600">{gen.error}</p>}
      {lessons.length === 0 ? (
        <p className={`${panel} p-4 text-sm text-slate-500`}>No lessons yet. Generate one from the chapter text.</p>
      ) : (
        <ul className="space-y-2">
          {lessons.map((l) => (
            <li key={l.id} className={`${panel} flex flex-wrap items-center gap-3 px-4 py-3`}>
              <span className="text-xs text-slate-500">Lesson {l.position}</span>
              <span className="min-w-0 flex-1 truncate font-medium text-slate-900">{l.title}</span>
              {l.origin === "ai" && <Chip tone="violet">AI</Chip>}
              {status(l.published_version, l.has_unpublished_changes)}
              <Link className={btn} to={`/teacher/lessons/${l.id}`}>Edit</Link>
              <Link className={btn} to={`/teacher/lessons/${l.id}/studio`}>Lesson studio</Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* --------------------------------------------------------------------- quiz */
export function QuizStep({ chapterId, quizzes }: { chapterId: string; quizzes: AssessmentSummary[] }) {
  const qc = useQueryClient();
  const gen = useChapterJob(`/chapters/${chapterId}/ai/assessment`, () => void qc.invalidateQueries({ queryKey: ["assessments", chapterId] }));
  return (
    <section>
      <StepIntro title="④ Quiz">Questions are written from the chapter text and linked to its learning objectives.</StepIntro>
      <div className="mb-3">
        <button className={btnPrimary} disabled={gen.running} onClick={gen.start}>{gen.running ? "Writing questions…" : quizzes.length ? "✦ Generate another quiz" : "✦ Generate a quiz with AI"}</button>
      </div>
      {gen.error && <p role="alert" className="mb-2 text-sm text-red-600">{gen.error}</p>}
      {quizzes.length === 0 ? (
        <p className={`${panel} p-4 text-sm text-slate-500`}>No quiz yet.</p>
      ) : (
        <ul className="space-y-2">
          {quizzes.map((a) => (
            <li key={a.id} className={`${panel} flex flex-wrap items-center gap-3 px-4 py-3`}>
              <span className="min-w-0 flex-1 truncate font-medium text-slate-900">{a.title}</span>
              <span className="text-xs text-slate-500">{a.question_count} questions</span>
              {a.origin === "ai" && <Chip tone="violet">AI</Chip>}
              {status(a.published_version, a.has_unpublished_changes)}
              <Link className={btn} to={`/teacher/assessments/${a.id}`}>Edit</Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ---------------------------------------------------------- review & publish */
export function ReviewStep({
  chapter,
  course,
  checks,
  pending,
  onStep,
}: {
  chapter: ChapterDetail;
  course?: CourseOut;
  checks: { label: string; ok: boolean; detail: string; step: StepKey }[];
  pending: PendingChanges;
  onStep: (s: StepKey) => void;
}) {
  const ready = checks.every((c) => c.ok);
  return (
    <section className="max-w-3xl">
      <StepIntro title="⑤ Review & publish">Check the list, preview it as a student if you like, then publish once with the button below.</StepIntro>
      <ul className={`${panel} divide-y divide-slate-100`}>
        {checks.map((c) => (
          <li key={c.label} className="flex items-center gap-3 px-4 py-3">
            <span className={`grid h-6 w-6 place-items-center rounded-full text-xs font-bold ${c.ok ? "bg-[#38b2ac] text-[#0b0d16]" : "bg-amber-400/20 text-amber-700"}`}>{c.ok ? "✓" : "!"}</span>
            <span className="flex-1">
              <span className="block text-sm font-medium text-slate-900">{c.label}</span>
              <span className="block text-xs text-slate-500">{c.detail}</span>
            </span>
            {!c.ok && <button className={btn} onClick={() => onStep(c.step)}>Fix</button>}
          </li>
        ))}
      </ul>
      <div className="mt-4">
        <PublishPanel chapter={chapter} course={course} ready={ready} pending={pending} />
      </div>
    </section>
  );
}
