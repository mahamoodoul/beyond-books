import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import { Link, useParams } from "react-router";

import { api } from "@/api/client";
import type { ChapterDetail, SceneOut } from "@/api/generated/schema";
import { ErrorAlert, Loading } from "@/components/feedback";
import { Icon } from "@/components/ui/Icon";
import { useChapterAssessments } from "@/features/assessments/api";
import { useLesson } from "@/features/lessons/api";
import { InteractiveHeartPanel, usesInteractiveHeart } from "@/features/lessons/InteractiveHeartPanel";
import { LazySceneStudio } from "@/features/three-d/LazySceneStudio";

import { trackEvent, useOutline, useSetProgress } from "./api";

type Progress = "completed" | "in_progress" | "not_started";
const progressOf = (value: string | undefined): Progress =>
  value === "completed" || value === "in_progress" ? value : "not_started";

function LessonStatus({ progress }: { progress: Progress }) {
  return (
    <span aria-hidden="true" className={`path-status path-status-${progress}`}>
      {progress === "completed" ? <Icon name="check" size={12} /> : progress === "in_progress" ? <span className="path-status-half" /> : null}
    </span>
  );
}

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
  const allScenes = scenes.data ?? [];
  const heartScene = allScenes.some(usesInteractiveHeart);
  const otherScenes = allScenes.filter((s) => !usesInteractiveHeart(s));
  const objectives = chapter.data?.objectives ?? [];
  const sections = l.content.sections ?? [];
  const summary = l.content.summary ?? [];
  const percent = o?.total_lessons ? Math.round((o.completed_lessons / o.total_lessons) * 100) : 0;
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

      <header className="lesson-heading">
        <div>
          <div className="eyebrow">
            <span className="eyebrow-dot" />
            {chapter.data && o ? `CHAPTER ${chapter.data.position} OF ${o.chapters.length}` : "LESSON"}
          </div>
          <h1>{l.title}</h1>
          {chapter.data?.description && <p>{chapter.data.description}</p>}
        </div>
        {o && (
          <div className="lesson-heading-progress course-progress">
            <div className="course-progress-label"><span>Course progress</span><strong>{percent}%</strong></div>
            <div aria-label={`${percent}% of the course complete`} aria-valuemax={100} aria-valuemin={0} aria-valuenow={percent} className="course-progress-track" role="progressbar">
              <span style={{ width: `${percent}%` }} />
            </div>
          </div>
        )}
      </header>

      {otherScenes.map((s) => (
        <section aria-label={`3D: ${s.title}`} className="lesson-scene studio-wide" key={s.id}>
          <LazySceneStudio sceneId={s.id} onEvent={(e) => trackEvent({ ...e, lesson_id: lessonId, scene_id: s.id })} />
        </section>
      ))}

      <div className={`lesson-layout${heartScene ? " lesson-layout-has-visual" : ""}`}>
        <article className="lesson-content">
          {objectives.length > 0 && (
            <section aria-labelledby="lesson-objectives" className="lesson-card panel">
              <div className="lesson-card-label"><span className="lesson-card-icon"><Icon name="target" size={17} /></span><span className="eyebrow eyebrow-muted">IN THIS LESSON</span></div>
              <h2 id="lesson-objectives">By the end, you can…</h2>
              <ul className="lesson-objectives">
                {objectives.map((obj) => <li key={obj.id}><Icon name="check" size={15} />{obj.objective_text}</li>)}
              </ul>
            </section>
          )}

          {sections.map((sec, i) => (
            <section aria-labelledby={`lesson-section-${i}`} className="lesson-card panel" key={i}>
              <div className="lesson-card-label">
                <span className={`lesson-card-icon lesson-card-icon-${i % 3}`}><Icon name={i === 0 ? "book" : i % 3 === 1 ? "layers" : "lightbulb"} size={17} /></span>
                <span className="eyebrow eyebrow-muted">PART {i + 1}</span>
              </div>
              <h2 id={`lesson-section-${i}`}>{sec.title}</h2>
              <div className="lesson-prose"><ReactMarkdown skipHtml>{sec.body_markdown}</ReactMarkdown></div>
              {((sec.key_terms ?? []).length > 0 || (sec.source_refs ?? []).length > 0) && (
                <div className="lesson-terms">
                  {(sec.key_terms ?? []).map((k) => <span className="lesson-term" key={k}>{k}</span>)}
                  {(sec.source_refs ?? []).map((r, k) => <span className="lesson-term lesson-term-source" key={k}>Source p. {r.page}</span>)}
                </div>
              )}
            </section>
          ))}

          {summary.length > 0 && (
            <section aria-labelledby="lesson-summary" className="lesson-summary">
              <h2 id="lesson-summary">The short version</h2>
              <ul>{summary.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </section>
          )}

          {(quizzes.data ?? []).map((q) => (
            <Link className="lesson-quiz-cta" key={q.id} to={`/student/assessments/${q.id}`}>
              <span className="lesson-quiz-icon"><Icon name="target" size={18} /></span>
              <span><strong>Wanna take a quick test about what you’ve learned?</strong><small>{q.title} · {q.question_count} {q.question_count === 1 ? "question" : "questions"}</small></span>
              <Icon name="arrow-right" size={17} />
            </Link>
          ))}
        </article>

        {heartScene && (
          <div className="lesson-visual-slot">
            <InteractiveHeartPanel lessonId={lessonId} />
          </div>
        )}

        <aside className="lesson-sidebar">
          {o && (
            <nav aria-label="Course contents" className="lesson-contents panel">
              <div className="lesson-contents-heading">
                <span className="eyebrow eyebrow-muted">YOUR COURSE</span>
                <span>{o.completed_lessons}/{o.total_lessons} DONE</span>
              </div>
              <Link className="lesson-contents-title" to={`/student/courses/${o.course_id}`}>{o.title}</Link>
              <ol>
                {o.chapters.map((c) => (
                  <li key={c.id}>
                    <p>{c.position}. {c.title}</p>
                    <ul>
                      {c.lessons.map((x) => (
                        <li key={x.id}>
                          <Link aria-current={x.id === lessonId ? "page" : undefined} className={`lesson-contents-link${x.id === lessonId ? " is-current" : ""}`} to={`/student/lessons/${x.id}`}>
                            <LessonStatus progress={progressOf(x.progress)} />
                            <span>{x.title}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            </nav>
          )}
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
        </aside>
      </div>

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
