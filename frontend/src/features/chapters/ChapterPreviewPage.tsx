/**
 * Teacher preview of a chapter, laid out the way students see it under the course:
 * course › chapter › lessons (3D scenes + text) and quizzes. Shows drafts too, clearly marked.
 */
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Link, useParams } from "react-router";

import { api } from "@/api/client";
import type { CourseOut, SceneOut, TeacherAssessment } from "@/api/generated/schema";
import { EmptyState, ErrorAlert, Loading } from "@/components/feedback";
import { Badge, Button, Card } from "@/components/ui";
import { useChapterAssessments } from "@/features/assessments/api";
import { useLesson, useLessons } from "@/features/lessons/api";
import { InteractiveHeartPanel, usesInteractiveHeart } from "@/features/lessons/InteractiveHeartPanel";
import { LazySceneViewer } from "@/features/three-d/LazySceneViewer";

import { useChapter } from "./api";

const md = "prose-sm max-w-none space-y-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_strong]:font-semibold";

function LiveBadge({ live, changed }: { live: boolean; changed?: boolean }) {
  if (!live) return <Badge>draft · hidden from students</Badge>;
  return changed ? <Badge tone="amber">live · newer draft not published</Badge> : <Badge tone="green">live</Badge>;
}

function LessonPreview({ lessonId }: { lessonId: string }) {
  const lesson = useLesson(lessonId);
  const scenes = useQuery({ queryKey: ["scenes", lessonId], queryFn: () => api.get<SceneOut[]>(`/lessons/${lessonId}/scenes`) });
  if (lesson.isPending) return <Loading />;
  if (lesson.error) return <ErrorAlert error={lesson.error} />;
  const l = lesson.data;
  return (
    <article className="space-y-5">
      <header className="flex flex-wrap items-center gap-2">
        <h2 className="text-2xl font-semibold text-navy-950">{l.title}</h2>
        <LiveBadge live={!!l.published_version} changed={l.has_unpublished_changes} />
      </header>
      {(scenes.data ?? []).map((s) => (
        <section key={s.id} aria-label={`3D: ${s.title}`} className="space-y-1">
          <div className="flex items-center gap-2 text-sm text-slate-600"><span className="font-medium">3D · {s.title}</span><LiveBadge live={!!s.published_version} changed={s.has_unpublished_changes} /></div>
          <LazySceneViewer sceneId={s.id} />
          {usesInteractiveHeart(s) && <InteractiveHeartPanel lessonId={lessonId} />}
        </section>
      ))}
      {(l.content.sections ?? []).length === 0 && <EmptyState title="This lesson has no content yet" />}
      {(l.content.sections ?? []).map((sec, i) => (
        <Card key={i}>
          <h3 className="mb-2 text-lg font-semibold">{sec.title}</h3>
          <div className={md}><ReactMarkdown skipHtml>{sec.body_markdown}</ReactMarkdown></div>
          <div className="mt-3 flex flex-wrap gap-1">
            {(sec.key_terms ?? []).map((k) => <Badge key={k} tone="blue">{k}</Badge>)}
            {(sec.source_refs ?? []).map((r, k) => <Badge key={k}>source p. {r.page}</Badge>)}
          </div>
        </Card>
      ))}
      {(l.content.summary ?? []).length > 0 && (
        <Card>
          <h3 className="mb-2 font-semibold">Summary</h3>
          <ul className="list-disc space-y-1 pl-5 text-sm">{l.content.summary?.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </Card>
      )}
    </article>
  );
}

function QuizPreview({ assessmentId }: { assessmentId: string }) {
  const quiz = useQuery({ queryKey: ["assessment", assessmentId], queryFn: () => api.get<TeacherAssessment>(`/assessments/${assessmentId}`) });
  const [answers, setAnswers] = useState(false);
  if (quiz.isPending) return <Loading />;
  if (quiz.error) return <ErrorAlert error={quiz.error} />;
  const a = quiz.data;
  return (
    <article className="space-y-4">
      <header className="flex flex-wrap items-center gap-2">
        <h2 className="text-2xl font-semibold text-navy-950">{a.title}</h2>
        <LiveBadge live={!!a.published_version} changed={a.has_unpublished_changes} />
        <Button variant="secondary" className="ml-auto" onClick={() => setAnswers(!answers)}>{answers ? "Hide answers" : "Show answers"}</Button>
      </header>
      <p className="text-sm text-slate-600">{a.question_count} questions · pass at {Math.round(a.passing_score)}% · {a.max_attempts} attempts</p>
      <ol className="space-y-3">
        {(a.content.questions ?? []).map((q, i) => (
          <li key={i}>
            <Card>
              <p className="font-medium">{i + 1}. {q.question_text}</p>
              {q.question_type === "mcq" ? (
                <ul className="mt-2 space-y-1">
                  {(q.options ?? []).map((o, k) => (
                    <li key={k} className={`rounded border px-3 py-1.5 text-sm ${answers && o.is_correct ? "border-green-500 bg-green-50 font-medium" : "border-slate-200"}`}>
                      {o.text}{answers && o.is_correct ? " ✓" : ""}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mt-2 rounded border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-400">Student writes a short answer</div>
              )}
              {answers && (q.model_answer || q.explanation_general) && (
                <p className="mt-2 text-sm text-slate-600">{q.model_answer && <><b>Model answer:</b> {q.model_answer} </>}{q.explanation_general}</p>
              )}
            </Card>
          </li>
        ))}
      </ol>
    </article>
  );
}

type View = { kind: "lesson" | "quiz"; id: string };

export function ChapterPreviewPage() {
  const { chapterId = "" } = useParams();
  const chapter = useChapter(chapterId);
  const course = useQuery({
    queryKey: ["course", chapter.data?.course_id],
    queryFn: () => api.get<CourseOut>(`/courses/${chapter.data?.course_id}`),
    enabled: !!chapter.data,
  });
  const lessons = useLessons(chapterId);
  const quizzes = useChapterAssessments(chapterId);
  const [view, setView] = useState<View | null>(null);
  useEffect(() => {
    const first = lessons.data?.[0];
    if (!view && first) setView({ kind: "lesson", id: first.id });
    else if (!view && lessons.data?.length === 0 && quizzes.data?.[0]) setView({ kind: "quiz", id: quizzes.data[0].id });
  }, [lessons.data, quizzes.data, view]);

  if (chapter.isPending) return <Loading />;
  if (chapter.error) return <ErrorAlert error={chapter.error} />;
  const ch = chapter.data;
  const chapterLive = ch.status === "published";
  const courseLive = course.data?.status === "published";
  const navItem = (active: boolean) => `block w-full rounded px-2 py-1.5 text-left text-sm ${active ? "bg-navy-900 text-white" : "hover:bg-slate-100"}`;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900" role="note">
        <span className="font-semibold">Student preview</span>
        <span>{chapterLive && courseLive ? "Students enrolled in this course can see the live items." : "Students can't see this chapter yet — publish it from the studio."}</span>
        <Link to={`/teacher/chapters/${chapterId}/studio`} className="ml-auto rounded-md bg-navy-900 px-3 py-1.5 font-medium text-white">← Back to studio</Link>
      </div>

      <nav aria-label="Breadcrumb" className="mb-2 text-sm text-slate-500">
        {course.data && <><Link to={`/teacher/courses/${course.data.id}`} className="hover:underline">{course.data.title}</Link> › </>}
        Chapter {ch.position}
      </nav>
      <header className="mb-6 rounded-xl bg-gradient-to-r from-navy-900 to-navy-700 p-6 text-white">
        <p className="text-xs uppercase tracking-widest text-white/60">Chapter {ch.position}</p>
        <h1 className="mt-1 text-3xl font-semibold">{ch.title}</h1>
        {ch.description && <p className="mt-2 max-w-3xl text-white/80">{ch.description}</p>}
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded bg-white/15 px-2 py-0.5">{lessons.data?.length ?? 0} lessons</span>
          <span className="rounded bg-white/15 px-2 py-0.5">{quizzes.data?.length ?? 0} quizzes</span>
          <span className={`rounded px-2 py-0.5 ${chapterLive ? "bg-green-500/30" : "bg-white/15"}`}>{chapterLive ? "chapter live" : "chapter draft"}</span>
          {course.data && <span className={`rounded px-2 py-0.5 ${courseLive ? "bg-green-500/30" : "bg-amber-500/30"}`}>{courseLive ? "course live" : "course draft"}</span>}
        </div>
        {(ch.objectives ?? []).length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-white/60">You will learn</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-white/90">{ch.objectives?.map((o) => <li key={o.id}>{o.objective_text}</li>)}</ul>
          </div>
        )}
      </header>

      <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
        <nav aria-label="Chapter contents" className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Lessons</p>
            {lessons.data?.length === 0 && <p className="text-sm text-slate-500">No lessons yet.</p>}
            <ul>
              {lessons.data?.map((l) => (
                <li key={l.id}>
                  <button className={navItem(view?.kind === "lesson" && view.id === l.id)} aria-current={view?.id === l.id ? "page" : undefined} onClick={() => setView({ kind: "lesson", id: l.id })}>
                    {l.position}. {l.title}{!l.published_version && <span className="ml-1 text-xs opacity-70">(draft)</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
          {(quizzes.data?.length ?? 0) > 0 && (
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Quizzes</p>
              <ul>
                {quizzes.data?.map((a) => (
                  <li key={a.id}>
                    <button className={navItem(view?.kind === "quiz" && view.id === a.id)} onClick={() => setView({ kind: "quiz", id: a.id })}>
                      ✎ {a.title}{!a.published_version && <span className="ml-1 text-xs opacity-70">(draft)</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </nav>
        <div>
          {!view && <EmptyState title="Nothing to preview yet">Generate a lesson in the chapter studio first.</EmptyState>}
          {view?.kind === "lesson" && <LessonPreview key={view.id} lessonId={view.id} />}
          {view?.kind === "quiz" && <QuizPreview key={view.id} assessmentId={view.id} />}
        </div>
      </div>
    </>
  );
}
