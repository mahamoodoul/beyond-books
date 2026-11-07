import { useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";

import { Icon } from "@/components/ui/Icon";
import { useDemo } from "@/app/providers/DemoProvider";
import { getDemoUser, getRecentActivity, getTeacherCourses } from "@/lib/api";

const metrics = [
  { label: "Active learners", value: "83", note: "+12% this month", icon: "users" as const, tone: "violet" },
  { label: "Lessons completed", value: "246", note: "+8% this week", icon: "check" as const, tone: "mint" },
  { label: "Average understanding", value: "82%", note: "Across all courses", icon: "target" as const, tone: "amber" },
];

export function DemoTeacherDashboard() {
  const { role } = useDemo();
  const [notice, setNotice] = useState("");
  const userQuery = useQuery({
    queryKey: ["demo", "user", role ?? "teacher"],
    queryFn: () => getDemoUser(role ?? "teacher"),
  });
  const coursesQuery = useQuery({
    queryKey: ["demo", "courses", "teacher"],
    queryFn: getTeacherCourses,
  });
  const activityQuery = useQuery({
    queryKey: ["demo", "recent-activity"],
    queryFn: getRecentActivity,
  });
  if (userQuery.isError) throw userQuery.error;
  if (coursesQuery.isError) throw coursesQuery.error;
  if (activityQuery.isError) throw activityQuery.error;
  if (userQuery.isPending || coursesQuery.isPending || activityQuery.isPending) {
    return <p aria-live="polite" className="page-loading" role="status">Gathering your classroom snapshot…</p>;
  }
  const user = userQuery.data;
  const courseList = coursesQuery.data;

  return (
    <div className="dashboard-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow"><span className="eyebrow-dot" /> YOUR TEACHER SPACE</div>
          <h1>Good morning, {user.name.split(" ")[0]} <span className="heading-wave">✳</span></h1>
          <p>Here’s what’s happening in your classroom today.</p>
        </div>
        <Link className="button button-primary" to="/teacher/upload">
          <Icon name="plus" size={18} /> Create a course
        </Link>
      </div>

      <div aria-live="polite" className="visually-hidden">{notice}</div>

      <section aria-label="Classroom overview" className="metric-grid">
        {metrics.map((metric, index) => (
          <article key={metric.label} className={`metric-card metric-card-${metric.tone} reveal reveal-${index + 1}`}>
            <div className="metric-top">
              <span>{metric.label}</span>
              <span className={`metric-icon metric-icon-${metric.tone}`}><Icon name={metric.icon} size={18} /></span>
            </div>
            <div className="metric-value">{metric.value}</div>
            <div className="metric-note"><span className="trend-arrow">↗</span> {metric.note}</div>
          </article>
        ))}
      </section>

      <div className="teacher-content-grid">
        <section aria-labelledby="courses-title" className="panel courses-panel reveal reveal-4">
          <div className="section-heading">
            <div>
              <span className="eyebrow eyebrow-muted">YOUR LIBRARY</span>
              <h2 id="courses-title">Your courses <span className="count-pill">{courseList.length}</span></h2>
            </div>
            <Link className="text-link" to="/teacher/courses">
              View all <Icon name="arrow-right" size={16} />
            </Link>
          </div>

          <div className="course-list">
            {courseList.slice(0, 3).map((course, index) => (
              <article key={course.id} className={`course-row reveal reveal-${index + 1}`}>
                <div className={`course-art course-art-${course.accent}`} aria-hidden="true">
                  {course.accent === "mint" ? <Icon name="leaf" size={28} /> : course.accent === "amber" ? <Icon name="layers" size={28} /> : <Icon name="activity" size={28} />}
                  <span className="art-orb" />
                </div>
                <div className="course-details">
                  <div className="course-subject">{course.subject} <span>·</span> {course.grade}</div>
                  <h3>{course.title}</h3>
                  <div className="course-meta">
                    <span><Icon name="book" size={14} /> {course.chapters} chapters</span>
                    <span><Icon name="users" size={14} /> {course.students} learners</span>
                  </div>
                </div>
                <div className="course-progress">
                  <span className={`status-pill status-${course.status.toLowerCase().replace(" ", "-")}`}>{course.status}</span>
                  <div className="progress-label"><span>Class progress</span><strong>{course.completion || "—"}{course.completion ? "%" : ""}</strong></div>
                  <div aria-label={`${course.title}: ${course.completion}% class progress`} className="progress-track" role="progressbar" aria-valuenow={course.completion} aria-valuemin={0} aria-valuemax={100}>
                    <span style={{ width: `${course.completion}%` }} />
                  </div>
                </div>
                {course.id === "cell-biology" ? (
                  <Link
                    aria-label={`Preview ${course.title}`}
                    className="course-open"
                    to="/student/courses/circulatory-system/lessons/heart-structure"
                  >
                    <Icon name="arrow-up-right" size={18} />
                  </Link>
                ) : (
                  <span aria-label={`Preview not available for ${course.title} in this demo`} className="course-open course-open-disabled" role="img">
                    <Icon name="arrow-up-right" size={18} />
                  </span>
                )}
              </article>
            ))}
          </div>

          <Link className="add-course-row" to="/teacher/upload">
            <span className="add-course-icon"><Icon name="plus" size={18} /></span>
            <span><strong>Build something new</strong><small>Start with a topic or add a textbook</small></span>
            <Icon name="arrow-right" size={17} />
          </Link>
        </section>

        <aside className="right-column">
          <section aria-labelledby="activity-title" className="panel activity-panel reveal reveal-3">
            <div className="section-heading section-heading-compact">
              <div>
                <span className="eyebrow eyebrow-muted">LIVE CLASSROOM</span>
                <h2 id="activity-title">Recent activity</h2>
              </div>
              <button aria-label="More activity options" className="icon-button subtle-button" type="button">
                <Icon name="more" size={19} />
              </button>
            </div>
            <ul className="activity-list">
              {activityQuery.data.map((activity, index) => (
                <li className="activity-item" key={activity.id}>
                  <span className={`student-avatar student-avatar-${index}`}>{activity.initials}</span>
                  <div className="activity-copy">
                    <p><strong>{activity.name}</strong> {activity.action} <b>{activity.course}</b></p>
                    <span>{activity.time}</span>
                  </div>
                </li>
              ))}
            </ul>
            <button className="activity-link" type="button" onClick={() => setNotice("You’re all caught up on classroom activity.")}>
              See all activity <Icon name="arrow-right" size={15} />
            </button>
          </section>

          <section aria-labelledby="insight-title" className="insight-card reveal reveal-4">
            <div className="insight-icon"><Icon name="lightbulb" size={18} /></div>
            <div className="insight-label">A LITTLE INSIGHT</div>
            <h2 id="insight-title">Cell structure is clicking.</h2>
            <p>Most students can identify organelles, but 6 could use a little more practice with how they work together.</p>
            <Link
              to="/student/courses/circulatory-system/lessons/heart-structure"
              className="insight-link"
            >
              Explore the lesson <Icon name="arrow-right" size={15} />
            </Link>
            <span className="insight-decoration" aria-hidden="true" />
          </section>
        </aside>
      </div>

    </div>
  );
}
