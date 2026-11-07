import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { Link, useParams } from "react-router";

import { api } from "@/api/client";
import type { ChapterDetail, SceneOut } from "@/api/generated/schema";
import { ErrorAlert, Loading } from "@/components/feedback";
import { Icon } from "@/components/ui/Icon";
import { useChapterAssessments } from "@/features/assessments/api";
import { useLesson } from "@/features/lessons/api";

import { trackEvent, useOutline, useSetProgress } from "./api";
import { LessonArticle, LessonContents } from "./LessonArticle";

export function LessonViewerPage() {
  const { lessonId = "" } = useParams();
  const lesson = useLesson(lessonId);
  const chapter = useQuery({
    queryKey: ["chapter", lesson.data?.chapter_id],
    queryFn: () => api.get<ChapterDetail>(`/chapters/${lesson.data?.chapter_id}`),
    enabled: !!lesson.data,
  });
  const courseId = chapter.data?.course_id;
  const outline = useOutline(courseId);
  const scenes = useQuery({ queryKey: ["scenes", lessonId], queryFn: () => api.get<SceneOut[]>(`/lessons/${lessonId}/scenes`) });
  const quizzes = useChapterAssessments(lesson.data?.chapter_id);
  const setProgress = useSetProgress(courseId);

  const flat = useMemo(() => outline.data?.chapters.flatMap((c) => c.lessons) ?? [], [outline.data]);
  const pos = flat.findIndex((l) => l.id === lessonId);
  const prev = pos > 0 ? flat[pos - 1] : undefined;
  const next = pos >= 0 ? flat[pos + 1] : undefined;
  const status = flat[pos]?.progress;

  useEffect(() => {
    if (!lesson.data || !courseId) return;
    trackEvent({ event_type: "lesson_opened", lesson_id: lessonId });
    if (status === "not_started") setProgress.mutate({ lessonId, status: "in_progress" });
  }, [lessonId, !!lesson.data, courseId]);

  if (lesson.isPending) return <Loading />;
  if (lesson.error) return <ErrorAlert error={lesson.error} />;
  const l = lesson.data;
  const o = outline.data;
  const completed = status === "completed";

  return (
    <div className="lesson-page">
      <nav aria-label="Breadcrumb" className="lesson-breadcrumb">
        <Link to="/student/courses">My courses</Link>
        <Icon name="chevron-right" size={14} />
        {courseId ? <Link to={`/student/courses/${courseId}`}>{o?.title ?? "Course"}</Link> : <span>Course</span>}
        <Icon name="chevron-right" size={14} />
        <strong>{chapter.data?.title ?? "Chapter"}</strong>
      </nav>

      <LessonArticle
        lesson={l}
        chapter={chapter.data}
        outline={o}
        scenes={scenes.data ?? []}
        quizzes={quizzes.data ?? []}
        quizHref={(id) => `/student/assessments/${id}`}
        onSceneEvent={(e, sceneId) => trackEvent({ ...e, lesson_id: lessonId, scene_id: sceneId })}
        sidebar={
          <>
            {o && <LessonContents outline={o} currentLessonId={lessonId} lessonHref={(id) => `/student/lessons/${id}`} courseHref={`/student/courses/${o.course_id}`} />}
            <div className="lesson-complete">
              {completed ? (
                <p className="lesson-complete-done"><Icon name="check" size={16} /> Lesson complete</p>
              ) : (
                <button className="button button-primary" disabled={setProgress.isPending || !courseId} onClick={() => setProgress.mutate({ lessonId, status: "completed" })} type="button">
                  <Icon name="check" size={16} /> Mark lesson complete
                </button>
              )}
              <ErrorAlert error={setProgress.error} />
            </div>
          </>
        }
      />

      <nav aria-label="Lesson navigation" className="lesson-pager">
        {prev ? (
          <Link className="button button-secondary" to={`/student/lessons/${prev.id}`}><Icon name="arrow-left" size={16} /><span>Previous<small>{prev.title}</small></span></Link>
        ) : <span />}
        {next ? (
          <Link className="button button-primary" to={`/student/lessons/${next.id}`}><span>Next lesson<small>{next.title}</small></span><Icon name="arrow-right" size={16} /></Link>
        ) : courseId ? (
          <Link className="button button-primary" to={`/student/courses/${courseId}`}><span>Back to course<small>{o?.title}</small></span><Icon name="arrow-right" size={16} /></Link>
        ) : null}
      </nav>
    </div>
  );
}
