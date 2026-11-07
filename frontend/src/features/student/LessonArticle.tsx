/**
 * The student lesson view, shared by the student lesson page and the teacher's "student preview".
 * One component renders the heading, 3D scenes, objectives, sections, summary and quiz call-to-action;
 * the page around it decides the links, the sidebar and whether progress is tracked.
 */
import { useEffect, useMemo, type ReactNode } from "react";
import { Link } from "react-router";

import type { AssessmentSummary, ChapterDetail, CourseOutline, LessonOut, SceneOut } from "@/api/generated/schema";
import { Icon } from "@/components/ui/Icon";
import { InteractiveHeartPanel, usesInteractiveHeart } from "@/features/lessons/InteractiveHeartPanel";
import type { SceneEvent } from "@/features/three-d/components/SceneViewer";
import { LazySceneStudio } from "@/features/three-d/LazySceneStudio";
import { chunk } from "@/features/three-d/library/speech/chunk";
import { useSpeechPlayer } from "@/features/three-d/library/speech/player";

import { ExplainSelection } from "./ExplainSelection";
import { ListenButton } from "./ListenButton";
import { LessonJourney, LessonPart, Takeaways, TermFlashcards } from "./LessonVisuals";

export type Progress = "completed" | "in_progress" | "not_started";
export const progressOf = (value: string | undefined): Progress =>
  value === "completed" || value === "in_progress" ? value : "not_started";

export function LessonStatus({ progress }: { progress: Progress }) {
  return (
    <span aria-hidden="true" className={`path-status path-status-${progress}`}>
      {progress === "completed" ? <Icon name="check" size={12} /> : progress === "in_progress" ? <span className="path-status-half" /> : null}
    </span>
  );
}

export function LessonArticle({
  lesson,
  chapter,
  outline,
  scenes,
  quizzes,
  quizHref,
  showProgress = true,
  badge,
  onSceneEvent,
  sidebar,
}: {
  lesson: LessonOut;
  chapter?: ChapterDetail;
  outline?: CourseOutline;
  scenes: SceneOut[];
  quizzes: AssessmentSummary[];
  quizHref: (quizId: string) => string;
  /** Course progress bar in the heading (students only). */
  showProgress?: boolean;
  /** Optional status marker shown next to the lesson title and each 3D scene (teacher preview uses this for drafts). */
  badge?: (item: { published_version?: number | null; has_unpublished_changes?: boolean }) => ReactNode;
  onSceneEvent?: (e: SceneEvent, sceneId: string) => void;
  sidebar?: ReactNode;
}) {
  const heartScene = scenes.some(usesInteractiveHeart);
  const otherScenes = scenes.filter((s) => !usesInteractiveHeart(s));
  const objectives = chapter?.objectives ?? [];
  const sections = lesson.content.sections ?? [];
  const summary = lesson.content.summary ?? [];
  const partIds = useMemo(() => sections.map((_, i) => `lesson-part-${i}`), [sections]);
  const percent = outline?.total_lessons ? Math.round((outline.completed_lessons / outline.total_lessons) * 100) : 0;

  // Voice: "Listen to this lesson" reads the title and goals, every part, then the takeaways.
  // Each part and the takeaways can also be read on their own. One shared player, so a new
  // reading stops the previous one.
  const lessonVoice = `lesson:${lesson.id}`;
  const partVoice = (i: number) => `${lessonVoice}:part${i}`;
  const summaryVoice = `${lessonVoice}:summary`;
  const introTexts = useMemo(
    () => chunk(objectives.length ? `${lesson.title}. By the end, you can: ${objectives.map((o) => o.objective_text).join("; ")}.` : lesson.title),
    [lesson.title, objectives],
  );
  const partTexts = useMemo(() => sections.map((sec, i) => chunk(`Part ${i + 1}. ${sec.title}. ${sec.body_markdown}`)), [sections]);
  const summaryTexts = useMemo(() => (summary.length ? chunk(`The short version. ${summary.join(". ")}`) : []), [summary]);
  const lessonTexts = useMemo(() => [...introTexts, ...partTexts.flat(), ...summaryTexts], [introTexts, partTexts, summaryTexts]);
  const speech = useSpeechPlayer();
  /** Which card the voice is on right now: a part index, "summary", or null. */
  const readingPart = useMemo<number | "summary" | null>(() => {
    if (speech.owner === null) return null;
    if (speech.owner === summaryVoice) return "summary";
    const own = sections.findIndex((_, i) => speech.owner === partVoice(i));
    if (own >= 0) return own;
    if (speech.owner !== lessonVoice) return null;
    let at = speech.index - introTexts.length;
    if (at < 0) return null;
    for (let i = 0; i < partTexts.length; i++) {
      if (at < partTexts[i]!.length) return i;
      at -= partTexts[i]!.length;
    }
    return summaryTexts.length ? "summary" : null;
  }, [speech.owner, speech.index]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (speech.owner !== lessonVoice || readingPart === null) return;
    const el = document.getElementById(readingPart === "summary" ? "lesson-summary" : (partIds[readingPart] ?? ""));
    el?.closest("section")?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [readingPart, speech.owner, lessonVoice, partIds]);

  return (
    <>
      <header className="lesson-heading">
        <div>
          <div className="eyebrow">
            <span className="eyebrow-dot" />
            {chapter && outline ? `CHAPTER ${chapter.position} OF ${outline.chapters.length}` : "LESSON"}
          </div>
          <h1 className="flex flex-wrap items-center gap-3">{lesson.title}{badge?.(lesson)}</h1>
          {chapter?.description && <p>{chapter.description}</p>}
          {sections.length > 0 && (
            <div className="mt-3">
              <ListenButton id={lessonVoice} texts={lessonTexts} label="Listen to this lesson" />
            </div>
          )}
        </div>
        {showProgress && outline && (
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
          {badge && <div className="mb-2 flex items-center gap-2 text-sm text-slate-600"><span className="font-medium">3D · {s.title}</span>{badge(s)}</div>}
          <LazySceneStudio sceneId={s.id} onEvent={onSceneEvent ? (e) => onSceneEvent(e, s.id) : undefined} />
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

          {sections.length === 0 && (
            <section className="lesson-card panel">
              <h2>This lesson has no content yet</h2>
              <p className="lesson-prose">The lesson text hasn't been written. Generate or write it in the chapter studio.</p>
            </section>
          )}

          <LessonJourney sections={sections} ids={partIds} />

          <ExplainSelection lessonId={lesson.id}>
            {sections.map((sec, i) => (
              <LessonPart
                key={i}
                section={sec}
                index={i}
                id={partIds[i] ?? `lesson-part-${i}`}
                sourceRefs={sec.source_refs ?? []}
                reading={readingPart === i}
                headerExtra={<ListenButton id={partVoice(i)} texts={partTexts[i] ?? []} compact />}
              />
            ))}
          </ExplainSelection>

          <Takeaways points={summary} reading={readingPart === "summary"} headerExtra={<ListenButton id={summaryVoice} texts={summaryTexts} compact />} />
          <TermFlashcards sections={sections} />

          {quizzes.map((q) => (
            <Link className="lesson-quiz-cta" key={q.id} to={quizHref(q.id)}>
              <span className="lesson-quiz-icon"><Icon name="target" size={18} /></span>
              <span>
                <strong>Wanna take a quick test about what you’ve learned?</strong>
                <small>{q.title} · {q.question_count} {q.question_count === 1 ? "question" : "questions"}{badge && !q.published_version ? " · draft" : ""}</small>
              </span>
              <Icon name="arrow-right" size={17} />
            </Link>
          ))}
        </article>

        {heartScene && (
          <div className="lesson-visual-slot">
            <InteractiveHeartPanel lessonId={lesson.id} />
          </div>
        )}

        {sidebar && <aside className="lesson-sidebar">{sidebar}</aside>}
      </div>
    </>
  );
}

/** "Your course" contents list from the sidebar: every chapter and lesson, the current one highlighted. */
export function LessonContents({
  outline,
  currentLessonId,
  lessonHref,
  courseHref,
  showProgress = true,
  showDrafts = false,
}: {
  outline: CourseOutline;
  currentLessonId: string;
  lessonHref: (lessonId: string, chapterId: string) => string;
  courseHref: string;
  showProgress?: boolean;
  /** Mark unpublished chapters and lessons (teacher preview). */
  showDrafts?: boolean;
}) {
  return (
    <nav aria-label="Course contents" className="lesson-contents panel">
      <div className="lesson-contents-heading">
        <span className="eyebrow eyebrow-muted">YOUR COURSE</span>
        {showProgress ? <span>{outline.completed_lessons}/{outline.total_lessons} DONE</span> : <span>{outline.total_lessons} LESSONS</span>}
      </div>
      <Link className="lesson-contents-title" to={courseHref}>{outline.title}</Link>
      <ol>
        {outline.chapters.map((c) => (
          <li key={c.id}>
            <p>{c.position}. {c.title}{showDrafts && !c.published && <span className="ml-1 text-xs font-normal opacity-60">(draft)</span>}</p>
            <ul>
              {c.lessons.map((x) => (
                <li key={x.id}>
                  <Link aria-current={x.id === currentLessonId ? "page" : undefined} className={`lesson-contents-link${x.id === currentLessonId ? " is-current" : ""}`} to={lessonHref(x.id, c.id)}>
                    <LessonStatus progress={showProgress ? progressOf(x.progress) : "not_started"} />
                    <span>{x.title}{showDrafts && !x.published && <span className="ml-1 text-xs opacity-60">(draft)</span>}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </nav>
  );
}
