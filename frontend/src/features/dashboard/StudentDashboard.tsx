import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";

import { Icon } from "@/components/ui/Icon";
import { demoUsers } from "@/features/demo/types";
import { mockDataSource } from "@/features/demo/dataSource";
import { useDemo } from "@/app/providers/DemoProvider";

export function StudentDashboard() {
  const { role } = useDemo();
  const user = demoUsers[role ?? "student"];
  const courseQuery = useQuery({
    queryKey: ["demo", "courses", "student"],
    queryFn: () => mockDataSource.getCourses("student"),
  });
  const activityQuery = useQuery({
    queryKey: ["demo", "weekly-activity"],
    queryFn: mockDataSource.getWeeklyActivity,
  });
  if (courseQuery.isError) throw courseQuery.error;
  if (activityQuery.isError) throw activityQuery.error;
  if (courseQuery.isPending || activityQuery.isPending) {
    return <p aria-live="polite" className="page-loading" role="status">Preparing your learning space…</p>;
  }
  const featuredCourse = courseQuery.data[0];
  if (!featuredCourse) throw new Error("Required student demo course is missing");

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
          <span><strong>4 day streak</strong><small>You’re building a habit!</small></span>
        </div>
      </div>

      <section aria-labelledby="continue-title" className="continue-card reveal reveal-1">
        <div className="continue-copy">
          <span className="eyebrow eyebrow-light"><Icon name="play" size={13} /> PICK UP WHERE YOU LEFT OFF</span>
          <h2 id="continue-title">{featuredCourse.title}</h2>
          <p>Chapter 3 <span>·</span> Cell structure & function</p>
          <div className="continue-progress-label"><span>Chapter progress</span><strong>{featuredCourse.progress}%</strong></div>
          <div className="progress-track continue-progress" role="progressbar" aria-label="Cell structure chapter progress" aria-valuenow={featuredCourse.progress} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${featuredCourse.progress}%` }} />
          </div>
          <Link className="button continue-button" to="/student/courses/cell-biology/lessons/cell-structure">
            Continue learning <Icon name="arrow-right" size={17} />
          </Link>
        </div>
        <div aria-hidden="true" className="continue-visual">
          <div className="continue-visual-orbit orbit-a" />
          <div className="continue-visual-orbit orbit-b" />
          <div className="continue-visual-cell"><span /><i /><b /></div>
          <span className="float-label label-nucleus">nucleus</span>
          <span className="float-label label-membrane">cell membrane</span>
          <div className="visual-caption">THE CELL, UP CLOSE</div>
        </div>
      </section>

      <div className="student-content-grid">
        <section aria-labelledby="my-courses-title" className="panel student-courses-panel reveal reveal-2">
          <div className="section-heading">
            <div>
              <span className="eyebrow eyebrow-muted">READY WHEN YOU ARE</span>
              <h2 id="my-courses-title">Your courses</h2>
            </div>
            <span className="course-collection-count">2 courses</span>
          </div>
          {[featuredCourse].map((course) => (
            <Link
              className="student-course-row"
              key={course.id}
              to="/student/courses/cell-biology/lessons/cell-structure"
            >
              <span className={`student-course-thumb thumb-${course.accent}`}><Icon name={course.accent === "mint" ? "leaf" : "activity"} size={22} /></span>
              <span className="student-course-copy"><small>{course.subject} <span>·</span> {course.grade}</small><strong>{course.title}</strong><span className="student-course-chapters">{course.chapters} chapters <span>·</span> {course.progress}% complete</span></span>
              <span className="student-course-arrow"><Icon name="arrow-up-right" size={17} /></span>
            </Link>
          ))}
        </section>

        <section aria-labelledby="weekly-title" className="panel weekly-panel reveal reveal-3">
          <div className="section-heading section-heading-compact">
            <div>
              <span className="eyebrow eyebrow-muted">SHOWING UP</span>
              <h2 id="weekly-title">Your week</h2>
            </div>
            <span className="week-total"><strong>3.4</strong> hrs</span>
          </div>
          <div aria-label="Minutes studied each day this week: Monday 24, Tuesday 38, Wednesday 29, Thursday 48, Friday 35, Saturday 18, Sunday 10." className="week-chart" role="img">
            {activityQuery.data.map((day, index) => (
              <div className="week-chart-column" key={`${day.day}-${index}`}>
                <span className="week-bar-track"><span className={`week-bar${index === 3 ? " week-bar-highlight" : ""}`} style={{ height: `${Math.max(14, day.minutes * 1.45)}px` }} /></span>
                <span className="week-day">{day.day}</span>
              </div>
            ))}
          </div>
          <p className="week-note"><span className="week-note-dot" /> 27 minutes more than last week</p>
        </section>
      </div>
      <div className="student-encouragement"><Icon name="sparkles" size={17} /> Keep exploring. Your next “aha!” is just around the corner.</div>
    </div>
  );
}
