/**
 * Teacher preview of a chapter, rendered with the same components students use
 * (LessonArticle + LessonContents from the student lesson page). Drafts are shown too, clearly marked.
 * ?lesson=<id> previews a lesson, ?quiz=<id> previews a quiz with its answers.
 */
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";

import { api } from "@/api/client";
import type { CourseOut, SceneOut, TeacherAssessment } from "@/api/generated/schema";
import { EmptyState, ErrorAlert, Loading } from "@/components/feedback";
import { Badge, Button, Card } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { useChapterAssessments } from "@/features/assessments/api";
import { useLesson, useLessons } from "@/features/lessons/api";
import { useOutline } from "@/features/student/api";
import { LessonArticle, LessonContents } from "@/features/student/LessonArticle";

import { useChapter } from "./api";

function LiveBadge({ published_version, has_unpublished_changes }: { published_version?: number | null; has_unpublished_changes?: boolean }) {
  if (!published_version) return <Badge>draft · hidden from students</Badge>;
  return has_unpublished_changes ? <Badge tone="amber">live · newer draft not published</Badge> : <Badge tone="green">live</Badge>;
}

function QuizPreview({ assessmentId, onBack }: { assessmentId: string; onBack: () => void }) {
  const quiz = useQuery({ queryKey: ["assessment", assessmentId], queryFn: () => api.get<TeacherAssessment>(`/assessments/${assessmentId}`) });
  const [answers, setAnswers] = useState(false);
  if (quiz.isPending) return <Loading />;
  if (quiz.error) return <ErrorAlert error={quiz.error} />;
  const a = quiz.data;
  return (
    <article className="space-y-4">
      <header className="lesson-heading">
        <div>
          <div className="eyebrow"><span className="eyebrow-dot" />QUIZ</div>
          <h1 className="flex flex-wrap items-center gap-3">{a.title}<LiveBadge {...a} /></h1>
          <p>{a.question_count} questions · pass at {Math.round(a.passing_score)}% · {a.max_attempts} attempts</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onBack}>← Lesson</Button>
          <Button variant="secondary" onClick={() => setAnswers(!answers)}>{answers ? "Hide answers" : "Show answers"}</Button>
        </div>
      </header>
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

function LessonPreview({ lessonId, chapterId, sidebar }: { lessonId: string; chapterId: string; sidebar: React.ReactNode }) {
  const lesson = useLesson(lessonId);
  const chapter = useChapter(chapterId);
  const outline = useOutline(chapter.data?.course_id);
  const scenes = useQuery({ queryKey: ["scenes", lessonId], queryFn: () => api.get<SceneOut[]>(`/lessons/${lessonId}/scenes`) });
  const quizzes = useChapterAssessments(chapterId);
  if (lesson.isPending) return <Loading />;
  if (lesson.error) return <ErrorAlert error={lesson.error} />;
  return (
    <LessonArticle
      lesson={lesson.data}
      chapter={chapter.data}
      outline={outline.data}
      scenes={scenes.data ?? []}
      quizzes={quizzes.data ?? []}
      quizHref={(id) => `/teacher/chapters/${chapterId}/preview?quiz=${id}`}
      showProgress={false}
      badge={(item) => <LiveBadge {...item} />}
      sidebar={sidebar}
    />
  );
}

export function ChapterPreviewPage() {
  const { chapterId = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const chapter = useChapter(chapterId);
  const course = useQuery({
    queryKey: ["course", chapter.data?.course_id],
    queryFn: () => api.get<CourseOut>(`/courses/${chapter.data?.course_id}`),
    enabled: !!chapter.data,
  });
  const outline = useOutline(chapter.data?.course_id);
  const lessons = useLessons(chapterId);
  const quizzes = useChapterAssessments(chapterId);

  const quizId = params.get("quiz");
  const lessonId = params.get("lesson") ?? lessons.data?.[0]?.id ?? null;
  const show = (next: { lesson?: string; quiz?: string }) =>
    setParams((p) => { p.delete("quiz"); p.delete("lesson"); if (next.lesson) p.set("lesson", next.lesson); if (next.quiz) p.set("quiz", next.quiz); return p; }, { replace: true });

  // When the chapter has no lessons but has a quiz, open the quiz.
  useEffect(() => {
    if (!quizId && !params.get("lesson") && lessons.data?.length === 0 && quizzes.data?.[0]) show({ quiz: quizzes.data[0].id });
  }, [lessons.data, quizzes.data]); // eslint-disable-line react-hooks/exhaustive-deps

  if (chapter.isPending) return <Loading />;
  if (chapter.error) return <ErrorAlert error={chapter.error} />;
  const ch = chapter.data;
  const chapterLive = ch.status === "published";
  const courseLive = course.data?.status === "published";
  const o = outline.data;

  const sidebar = (
    <>
      {o && (
        <LessonContents
          outline={o}
          currentLessonId={lessonId ?? ""}
          lessonHref={(id, chId) => `/teacher/chapters/${chId}/preview?lesson=${id}`}
          courseHref={`/teacher/courses/${o.course_id}`}
          showProgress={false}
          showDrafts
        />
      )}
      {(quizzes.data?.length ?? 0) > 0 && (
        <nav aria-label="Chapter quizzes" className="lesson-contents panel">
          <div className="lesson-contents-heading"><span className="eyebrow eyebrow-muted">QUIZZES IN THIS CHAPTER</span></div>
          <ul>
            {quizzes.data?.map((a) => (
              <li key={a.id}>
                <Link aria-current={quizId === a.id ? "page" : undefined} className={`lesson-contents-link${quizId === a.id ? " is-current" : ""}`} to={`/teacher/chapters/${chapterId}/preview?quiz=${a.id}`}>
                  <Icon name="target" size={14} />
                  <span>{a.title}{!a.published_version && <span className="ml-1 text-xs opacity-60">(draft)</span>}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
      <div className="lesson-complete">
        <p className="text-sm text-slate-500">Students see a “Mark lesson complete” button here.</p>
      </div>
    </>
  );

  return (
    <div className="lesson-page">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900" role="note">
        <span className="font-semibold">Student preview</span>
        <span>
          {chapterLive && courseLive
            ? "This is what enrolled students see. Items marked draft are only visible to you."
            : "Students can't see this chapter yet — publish it from the studio. Items marked draft are only visible to you."}
        </span>
        <Link to={`/teacher/chapters/${chapterId}/studio?step=publish`} className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-[#38b2ac] px-3.5 py-1.5 text-sm font-semibold !text-[#0b0d16] no-underline shadow-sm hover:bg-[#4fc7c0]" style={{ color: "#0b0d16" }}>← Back to studio</Link>
      </div>

      <nav aria-label="Breadcrumb" className="lesson-breadcrumb">
        <Link to="/teacher/courses">My courses</Link>
        <Icon name="chevron-right" size={14} />
        {course.data ? <Link to={`/teacher/courses/${course.data.id}`}>{course.data.title}</Link> : <span>Course</span>}
        <Icon name="chevron-right" size={14} />
        <strong>{ch.title}</strong>
      </nav>

      {quizId ? (
        <div className="lesson-layout">
          <div className="lesson-content"><QuizPreview key={quizId} assessmentId={quizId} onBack={() => show(lessonId ? { lesson: lessonId } : {})} /></div>
          <aside className="lesson-sidebar">{sidebar}</aside>
        </div>
      ) : lessonId ? (
        <LessonPreview key={lessonId} lessonId={lessonId} chapterId={chapterId} sidebar={sidebar} />
      ) : lessons.isPending ? (
        <Loading />
      ) : (
        <EmptyState title="Nothing to preview yet">Generate a lesson in the chapter studio first.</EmptyState>
      )}
    </div>
  );
}
