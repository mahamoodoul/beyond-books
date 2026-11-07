import { lazy, Suspense, useState } from "react";
import { Link, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";

import { Icon } from "@/components/ui/Icon";
import { getCourse } from "@/lib/api";
import type { Chapter } from "@/lib/types";

const CardiacViewer = lazy(() =>
  import("@/features/lessons/CardiacViewer").then((module) => ({ default: module.CardiacViewer })),
);

function ViewerSkeleton() {
  return (
    <div aria-label="Loading interactive heart model" className="viewer-skeleton" role="status">
      <span className="skeleton-heart" />
      <span>Preparing the heart model…</span>
    </div>
  );
}

export function HeartLessonPage() {
  const { courseId = "circulatory-system", lessonId = "heart-structure" } = useParams();
  const [completed, setCompleted] = useState(() => localStorage.getItem(`completed-${lessonId}`) === "true");
  const courseQuery = useQuery({ queryKey: ["course", courseId], queryFn: () => getCourse(courseId) });
  if (courseQuery.isError) throw courseQuery.error;
  if (courseQuery.isPending) return <p className="page-loading" role="status">Loading your biology lesson…</p>;

  const course = courseQuery.data;
  const chapter = course.chapters.find((item) => item.id === lessonId) ?? course.chapters[0];
  if (!chapter) throw new Error(`The requested lesson "${lessonId}" is not available.`);
  const activeChapterId = chapter.id;
  const chapterIndex = course.chapters.findIndex((item) => item.id === activeChapterId);
  const previousChapter = course.chapters[chapterIndex - 1];
  const nextChapter = course.chapters[chapterIndex + 1];

  function markComplete() {
    localStorage.setItem(`completed-${activeChapterId}`, "true");
    setCompleted(true);
  }

  function renderChapter(chapterItem: Chapter) {
    return (
      <Link
        aria-current={chapterItem.id === activeChapterId ? "step" : undefined}
        className={`heart-chapter-link${chapterItem.id === activeChapterId ? " heart-chapter-active" : ""}${localStorage.getItem(`completed-${chapterItem.id}`) === "true" ? " heart-chapter-complete" : ""}`}
        key={chapterItem.id}
        to={`/student/courses/${course.id}/lessons/${chapterItem.id}`}
      >
        <span className="chapter-check">{localStorage.getItem(`completed-${chapterItem.id}`) === "true" ? <Icon name="check" size={13} /> : <span>{String(course.chapters.indexOf(chapterItem) + 1).padStart(2, "0")}</span>}</span>
        <span>{chapterItem.title}</span>
      </Link>
    );
  }

  return (
    <div className="heart-lesson-page">
      <div className="heart-lesson-breadcrumb">
        <Link to="/student">My learning</Link><Icon name="chevron-right" size={14} />
        <span>{course.title}</span><Icon name="chevron-right" size={14} /><strong>{chapter.title}</strong>
      </div>
      <header className="heart-lesson-heading">
        <div>
          <div className="eyebrow"><span className="eyebrow-dot" /> {course.grade.toUpperCase()} BIOLOGY <span className="eyebrow-separator">·</span> CHAPTER {chapterIndex + 1} OF {course.chapters.length}</div>
          <h1>{chapter.lesson.title}<span>.</span></h1>
          <p>Let’s explore {chapter.title.toLowerCase()} and see how the parts work together.</p>
        </div>
        <div aria-label={`${Math.round(((chapterIndex + Number(completed)) / course.chapters.length) * 100)}% course progress`} className="heart-progress">
          <span>COURSE PROGRESS <strong>{Math.round(((chapterIndex + Number(completed)) / course.chapters.length) * 100)}%</strong></span>
          <div className="progress-track"><span style={{ width: `${((chapterIndex + Number(completed)) / course.chapters.length) * 100}%` }} /></div>
        </div>
      </header>

      <div className="heart-learning-grid">
        <article className="heart-lesson-copy">
          <section aria-labelledby="objectives-title" className="heart-objectives panel">
            <div className="heart-copy-label"><span className="heart-copy-icon"><Icon name="target" size={17} /></span><span className="eyebrow eyebrow-muted">IN THIS CHAPTER</span></div>
            <h2 id="objectives-title">By the end, you can…</h2>
            <ul>{chapter.lesson.objectives.map((objective) => <li key={objective}><Icon name="check" size={15} />{objective}</li>)}</ul>
          </section>

          <section aria-labelledby="explanation-title" className="heart-explanation panel">
            <div className="heart-copy-label"><span className="heart-copy-icon heart-copy-icon-mint"><Icon name="book" size={17} /></span><span className="eyebrow eyebrow-muted">THE BIG IDEA</span></div>
            <h2 id="explanation-title">{chapter.lesson.title}</h2>
            <p>{chapter.lesson.explanation}</p>
            <div className="heart-example"><span><Icon name="lightbulb" size={15} /> THINK ABOUT IT</span><p>{chapter.lesson.examples[0]}</p></div>
            <div className="heart-summary"><strong>The short version</strong><p>{chapter.lesson.summary}</p></div>
          </section>

          <section aria-labelledby="terms-title" className="heart-terms panel">
            <div className="heart-copy-label"><span className="heart-copy-icon heart-copy-icon-amber"><Icon name="layers" size={17} /></span><span className="eyebrow eyebrow-muted">WORDS TO KNOW</span></div>
            <h2 id="terms-title">A few useful words</h2>
            <dl>{chapter.lesson.keyTerms.map((term) => <div key={term.id}><dt>{term.term}</dt><dd>{term.definition}</dd></div>)}</dl>
          </section>
          <Link className="heart-assessment-cta" to={`/student/courses/${course.id}/assessment`}>
            <span className="heart-assessment-icon"><Icon name="target" size={17} /></span>
            <span><strong>Ready to check what clicked?</strong><small>Try a few quick questions about this course.</small></span>
            <Icon name="arrow-right" size={17} />
          </Link>
        </article>

        <aside className="heart-viewer-column">
          <Suspense fallback={<ViewerSkeleton />}>
            <CardiacViewer model={chapter.model} />
          </Suspense>
          <section aria-label="Augmented reality heart model" className="heart-ar-launch panel">
            <span className="heart-ar-launch-icon"><Icon name="eye" size={18} /></span>
            <div className="heart-ar-launch-copy">
              <strong>Bring the heart into your space</strong>
              <p>Use your camera to place the interactive 3D heart on the printable page.</p>
            </div>
            <Link
              className="button button-primary heart-ar-launch-button"
              to={`/student/courses/${course.id}/lessons/${activeChapterId}/ar`}
            >
              Start AR <Icon name="arrow-up-right" size={15} />
            </Link>
            <a
              aria-label="Open or print the heart tracking page in a new tab"
              className="heart-ar-print-link"
              href={`${import.meta.env.BASE_URL}targets/heart-page.png`}
              rel="noreferrer"
              target="_blank"
            >
              Print or open the heart tracking page
            </a>
          </section>
          <nav aria-label="Course chapters" className="heart-chapter-panel panel">
            <div className="heart-chapter-panel-heading"><span className="eyebrow eyebrow-muted">YOUR COURSE</span><span>{course.chapters.length} CHAPTERS</span></div>
            <h2>{course.title}</h2>
            <div className="heart-chapter-list">{course.chapters.map(renderChapter)}</div>
          </nav>
          <div className="heart-mark-row">
            <button aria-pressed={completed} className={`button ${completed ? "button-completed" : "button-primary"}`} onClick={markComplete} type="button">
              <Icon name={completed ? "check" : "check"} size={16} /> {completed ? "Chapter complete" : "Mark chapter complete"}
            </button>
          </div>
        </aside>
      </div>

      <nav aria-label="Chapter navigation" className="heart-chapter-navigation">
        {previousChapter ? (
          <Link className="button button-secondary" to={`/student/courses/${course.id}/lessons/${previousChapter.id}`}><Icon name="arrow-left" size={16} /> Previous chapter</Link>
        ) : <span />}
        {nextChapter ? (
          <Link className="button button-primary" to={`/student/courses/${course.id}/lessons/${nextChapter.id}`}>Next chapter <Icon name="arrow-right" size={16} /></Link>
        ) : (
          <Link className="button button-primary" to={`/student/courses/${course.id}/assessment`}>Take the assessment <Icon name="arrow-right" size={16} /></Link>
        )}
      </nav>
    </div>
  );
}
