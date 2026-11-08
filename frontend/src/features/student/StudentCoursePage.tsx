import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router";

import { api } from "@/api/client";
import type { CourseOut, OutlineChapter, OutlineLesson } from "@/api/generated/schema";
import { ErrorAlert, Loading } from "@/components/feedback";
import { Icon } from "@/components/ui/Icon";

import { useChapterAssessments } from "@/features/assessments/api";
import { useChapterLabs } from "@/features/labs/api";

import { useOutline } from "./api";
import { MyInsightsCard } from "./MyInsightsCard";

type Progress = "completed" | "in_progress" | "not_started";
const PROGRESS_LABEL: Record<Progress, string> = {
  completed: "Completed",
  in_progress: "In progress",
  not_started: "Not started",
};
const progressOf = (value: string): Progress =>
  value === "completed" || value === "in_progress" ? value : "not_started";

function StatusDot({ progress, label }: { progress: Progress; label?: string }) {
  return (
    <span aria-label={label ?? PROGRESS_LABEL[progress]} className={`path-status path-status-${progress}`} role="img">
      {progress === "completed" ? <Icon name="check" size={13} /> : progress === "in_progress" ? <span className="path-status-half" /> : null}
    </span>
  );
}

function ChapterQuizzes({ chapterId }: { chapterId: string }) {
  const list = useChapterAssessments(chapterId);
  if (!list.data?.length) return null;
  return (
    <ul className="path-quizzes">
      {list.data.map((a) => (
        <li key={a.id}>
          <Link className="path-row path-row-quiz" to={`/student/assessments/${a.id}`}>
            <span aria-hidden="true" className="path-row-icon"><Icon name="target" size={15} /></span>
            <span className="path-row-title">{a.title}<small>Quiz · {a.question_count} {a.question_count === 1 ? "question" : "questions"}</small></span>
            <span className="path-row-cta">Take quiz <Icon name="arrow-right" size={15} /></span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ChapterLabs({ chapterId }: { chapterId: string }) {
  const list = useChapterLabs(chapterId);
  if (!list.data?.length) return null;
  return (
    <ul className="path-quizzes">
      {list.data.map((lab) => {
        const done = lab.session_status === "completed";
        const cta = done ? "Open again" : lab.session_status ? "Continue" : "Start";
        return (
          <li key={lab.id}>
            <Link className="path-row path-row-quiz" to={`/student/labs/${lab.id}`}>
              <span aria-hidden="true" className="path-row-icon"><Icon name="bolt" size={15} /></span>
              <span className="path-row-title">{lab.title}<small>Lab · {lab.kind === "molecules" ? "build molecules" : lab.kind === "buoyancy" ? "float or sink" : "build the circuit"}{done ? " · goal reached" : ""}</small></span>
              <span className="path-row-cta">{cta} <Icon name="arrow-right" size={15} /></span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function LessonRow({ lesson, isNext }: { lesson: OutlineLesson; isNext: boolean }) {
  const progress = progressOf(lesson.progress);
  const has3D = (lesson.scene_count ?? 0) > 0;
  const cta = progress === "completed" ? "Review" : progress === "in_progress" ? "Continue" : "Start";
  return (
    <li>
      <Link className={`path-row${isNext ? " path-row-next" : ""}`} to={`/student/lessons/${lesson.id}`}>
        <StatusDot progress={progress} />
        <span className="path-row-title">
          {lesson.title}
          <small>
            {isNext ? "Up next" : PROGRESS_LABEL[progress]}
            {has3D && <span className="path-badge-3d"><Icon name="layers" size={12} /> 3D model</span>}
          </small>
        </span>
        <span className="path-row-cta">{cta} <Icon name="arrow-right" size={15} /></span>
      </Link>
    </li>
  );
}

function ChapterStep({ chapter, nextLessonId }: { chapter: OutlineChapter; nextLessonId: string | null }) {
  const progress = progressOf(chapter.progress);
  const done = chapter.lessons.filter((l) => l.progress === "completed").length;
  return (
    <li className={`path-chapter path-chapter-${progress}`}>
      <div aria-hidden="true" className="path-chapter-marker">
        {progress === "completed" ? <Icon name="check" size={16} /> : chapter.position}
      </div>
      <section aria-labelledby={`chapter-${chapter.id}`} className="path-chapter-card panel">
        <header className="path-chapter-heading">
          <div>
            <span className="eyebrow eyebrow-muted">CHAPTER {chapter.position}</span>
            <h3 id={`chapter-${chapter.id}`}>{chapter.title}</h3>
            {chapter.description && <p>{chapter.description}</p>}
          </div>
          <span className={`course-status-chip course-status-${progress}`}>
            {progress === "completed" && <Icon name="check" size={13} />}
            {progress === "completed" ? "Completed" : `${done}/${chapter.lessons.length} lessons`}
          </span>
        </header>
        <ul className="path-lessons">
          {chapter.lessons.map((l) => <LessonRow isNext={l.id === nextLessonId} key={l.id} lesson={l} />)}
        </ul>
        <ChapterQuizzes chapterId={chapter.id} />
        <ChapterLabs chapterId={chapter.id} />
      </section>
    </li>
  );
}

export function StudentCoursePage() {
  const { courseId } = useParams();
  const outline = useOutline(courseId);
  const course = useQuery({
    queryKey: ["course", courseId],
    queryFn: () => api.get<CourseOut>(`/courses/${courseId}`),
    enabled: !!courseId,
  });
  if (outline.isPending) return <Loading />;
  if (outline.error) return <ErrorAlert error={outline.error} />;
  const o = outline.data;
  const meta = course.data;
  const value = o.total_lessons ? Math.round((o.completed_lessons / o.total_lessons) * 100) : 0;
  const lessons = o.chapters.flatMap((ch) => ch.lessons);
  const next = lessons.find((l) => l.id === o.next_lesson_id);
  const with3D = lessons.filter((l) => (l.scene_count ?? 0) > 0).length;
  const finished = o.total_lessons > 0 && o.completed_lessons >= o.total_lessons;
  const started = lessons.some((l) => l.progress !== "not_started");

  return (
    <div className="student-course-page">
      <nav aria-label="Breadcrumb" className="course-breadcrumb">
        <Link to="/student/courses"><Icon name="arrow-left" size={15} /> My courses</Link>
      </nav>

      <header className="course-hero panel">
        <div className="course-hero-copy">
          <div className="catalog-course-meta">
            {meta?.subject && <span>{meta.subject}</span>}
            {meta?.grade_level && <span>{meta.grade_level}</span>}
          </div>
          <h1>{o.title}</h1>
          {meta?.description && <p>{meta.description}</p>}
          <ul aria-label="Course contents" className="course-hero-facts">
            <li><Icon name="book" size={15} /> {o.chapters.length} {o.chapters.length === 1 ? "chapter" : "chapters"}</li>
            <li><Icon name="file" size={15} /> {o.total_lessons} {o.total_lessons === 1 ? "lesson" : "lessons"}</li>
            {with3D > 0 && <li><Icon name="layers" size={15} /> {with3D} with 3D models</li>}
          </ul>
        </div>
        <div className="course-hero-progress">
          <div className="course-progress">
            <div className="course-progress-label">
              <span>Your progress · {o.completed_lessons} of {o.total_lessons} lessons</span>
              <strong>{value}%</strong>
            </div>
            <div aria-label={`${value}% complete`} aria-valuemax={100} aria-valuemin={0} aria-valuenow={value} className="course-progress-track" role="progressbar">
              <span style={{ width: `${value}%` }} />
            </div>
          </div>
          {next ? (
            <Link className="button button-primary course-hero-cta" to={`/student/lessons/${next.id}`}>
              <span>{started ? "Continue" : "Start course"}<small>{next.title}</small></span>
              <Icon name="arrow-right" size={17} />
            </Link>
          ) : finished ? (
            <p className="course-hero-done"><Icon name="check" size={16} /> You’ve finished every lesson. Revisit any of them below.</p>
          ) : null}
        </div>
      </header>

      {courseId && <MyInsightsCard courseId={courseId} />}

      <section aria-labelledby="course-path-title" className="course-path">
        <h2 id="course-path-title">Course path</h2>
        {o.chapters.length === 0 ? (
          <div className="catalog-message panel">
            <Icon name="book" size={24} />
            <h2>Nothing here yet</h2>
            <p>Your teacher hasn’t published any chapters yet. Check back soon.</p>
          </div>
        ) : (
          <ol className="path-chapters">
            {o.chapters.map((ch) => <ChapterStep chapter={ch} key={ch.id} nextLessonId={o.next_lesson_id ?? null} />)}
          </ol>
        )}
      </section>
    </div>
  );
}
