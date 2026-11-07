import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";

import { useDemo } from "@/app/providers/DemoProvider";
import { Icon } from "@/components/ui/Icon";
import { demoUsers } from "@/features/demo/types";
import { getCourse, getStudentProgress } from "@/lib/api";

export function StudentDashboard() {
  const { role } = useDemo();
  const user = demoUsers[role ?? "student"];
  const courseQuery = useQuery({
    queryKey: ["course", "circulatory-system"],
    queryFn: () => getCourse("circulatory-system"),
  });
  const progressQuery = useQuery({
    queryKey: ["student-progress", "student-1"],
    queryFn: () => getStudentProgress("student-1"),
  });
  if (courseQuery.isError) throw courseQuery.error;
  if (progressQuery.isError) throw progressQuery.error;
  if (courseQuery.isPending || progressQuery.isPending) {
    return <p aria-live="polite" className="page-loading" role="status">Preparing your learning space…</p>;
  }

  const course = courseQuery.data;
  const progress = progressQuery.data;
  const currentChapter = course.chapters.find(
    (chapter) => !progress.completedChapterIds.includes(chapter.id),
  ) ?? course.chapters[0];
  if (!currentChapter) throw new Error("The demo course does not contain any chapters.");
  const lessonPath = `/student/courses/${course.id}/lessons/${currentChapter.id}`;
  const minutesThisWeek = progress.weeklyMinutes.reduce((total, minutes) => total + minutes, 0);

  return (
    <div className="dashboard-page student-dashboard">
      <div className="student-welcome">
        <div>
          <div className="eyebrow"><span className="eyebrow-dot" /> YOUR LEARNING SPACE</div>
          <h1>Keep that curiosity going, {user.name.split(" ")[0]} <span className="heading-wave">✳</span></h1>
          <p>A little progress each day adds up to something wonderful.</p>
        </div>
        <div className="streak-card">
          <span className="streak-icon">✳</span>
          <span><strong>{progress.currentStreak} day streak</strong><small>You’re building a habit!</small></span>
        </div>
      </div>

      <section aria-labelledby="continue-title" className="continue-card reveal reveal-1">
        <div className="continue-copy">
          <span className="eyebrow eyebrow-light"><Icon name="play" size={13} /> PICK UP WHERE YOU LEFT OFF</span>
          <h2 id="continue-title">{course.title}</h2>
          <p>Chapter {course.chapters.indexOf(currentChapter) + 1} <span>·</span> {currentChapter.title}</p>
          <div className="continue-progress-label"><span>Course progress</span><strong>{progress.courseCompletion}%</strong></div>
          <div className="progress-track continue-progress" role="progressbar" aria-label="Circulatory system course progress" aria-valuenow={progress.courseCompletion} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${progress.courseCompletion}%` }} />
          </div>
          <Link className="button continue-button" to={lessonPath}>
            Continue learning <Icon name="arrow-right" size={17} />
          </Link>
        </div>
        <div aria-hidden="true" className="continue-visual heart-dashboard-visual">
          <div className="continue-visual-orbit orbit-a" />
          <div className="continue-visual-orbit orbit-b" />
          <div className="heart-dashboard-shape">♥</div>
          <span className="float-label label-nucleus">left ventricle</span>
          <span className="float-label label-membrane">blood flow</span>
          <div className="visual-caption">THE HEART, UP CLOSE</div>
        </div>
      </section>

      <div className="student-content-grid">
        <section aria-labelledby="my-courses-title" className="panel student-courses-panel reveal reveal-2">
          <div className="section-heading">
            <div>
              <span className="eyebrow eyebrow-muted">READY WHEN YOU ARE</span>
              <h2 id="my-courses-title">Your course</h2>
            </div>
            <span className="course-collection-count">{course.chapters.length} chapters</span>
          </div>
          <Link className="student-course-row" to={lessonPath}>
            <span className="student-course-thumb thumb-mint"><Icon name="activity" size={22} /></span>
            <span className="student-course-copy"><small>{course.subject} <span>·</span> {course.grade}</small><strong>{course.title}</strong><span className="student-course-chapters">{progress.completedChapterIds.length} of {course.chapters.length} chapters complete</span></span>
            <span className="student-course-arrow"><Icon name="arrow-up-right" size={17} /></span>
          </Link>
          <div className="student-chapter-preview">
            {course.chapters.slice(0, 3).map((chapter, index) => (
              <Link className="student-chapter-mini" key={chapter.id} to={`/student/courses/${course.id}/lessons/${chapter.id}`}>
                <span className={progress.completedChapterIds.includes(chapter.id) ? "mini-chapter-done" : ""}>{progress.completedChapterIds.includes(chapter.id) ? <Icon name="check" size={12} /> : index + 1}</span>
                {chapter.title}
              </Link>
            ))}
          </div>
        </section>

        <section aria-labelledby="weekly-title" className="panel weekly-panel reveal reveal-3">
          <div className="section-heading section-heading-compact">
            <div>
              <span className="eyebrow eyebrow-muted">SHOWING UP</span>
              <h2 id="weekly-title">Your week</h2>
            </div>
            <span className="week-total"><strong>{(minutesThisWeek / 60).toFixed(1)}</strong> hrs</span>
          </div>
          <div aria-label={`Minutes studied this week: ${progress.weeklyMinutes.join(", ")}.`} className="week-chart" role="img">
            {progress.weeklyMinutes.map((minutes, index) => (
              <div className="week-chart-column" key={`${index}-${minutes}`}>
                <span className="week-bar-track"><span className={`week-bar${index === 3 ? " week-bar-highlight" : ""}`} style={{ height: `${Math.max(14, minutes * 1.45)}px` }} /></span>
                <span className="week-day">{["M", "T", "W", "T", "F", "S", "S"][index]}</span>
              </div>
            ))}
          </div>
          <p className="week-note"><span className="week-note-dot" /> Your learning time, one day at a time</p>
        </section>
      </div>
      <div className="student-encouragement"><Icon name="sparkles" size={17} /> Keep exploring. Your next “aha!” is just around the corner.</div>
    </div>
  );
}
