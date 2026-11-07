import { useRef, useState, type KeyboardEvent, type FormEvent } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";

import { Icon } from "@/components/ui/Icon";
import { demoUsers } from "@/features/demo/types";
import { mockDataSource } from "@/features/demo/dataSource";
import type { Course } from "@/features/demo/types";
import { useDemo } from "@/app/providers/DemoProvider";

const metrics = [
  { label: "Active learners", value: "83", note: "+12% this month", icon: "users" as const, tone: "violet" },
  { label: "Lessons completed", value: "246", note: "+8% this week", icon: "check" as const, tone: "mint" },
  { label: "Average understanding", value: "82%", note: "Across all courses", icon: "target" as const, tone: "amber" },
];

export function TeacherDashboard() {
  const { role } = useDemo();
  const user = demoUsers[role ?? "teacher"];
  const [createdCourses, setCreatedCourses] = useState<Course[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [courseName, setCourseName] = useState("");
  const [notice, setNotice] = useState("");
  const createButtonRef = useRef<HTMLButtonElement>(null);
  const coursesQuery = useQuery({
    queryKey: ["demo", "courses", "teacher"],
    queryFn: () => mockDataSource.getCourses("teacher"),
  });
  const activityQuery = useQuery({
    queryKey: ["demo", "recent-activity"],
    queryFn: mockDataSource.getRecentActivity,
  });
  if (coursesQuery.isError) throw coursesQuery.error;
  if (activityQuery.isError) throw activityQuery.error;
  if (coursesQuery.isPending || activityQuery.isPending) {
    return <p aria-live="polite" className="page-loading" role="status">Gathering your classroom snapshot…</p>;
  }
  const courseList = [...createdCourses, ...coursesQuery.data];

  function closeCreateForm() {
    setShowCreateForm(false);
    queueMicrotask(() => createButtonRef.current?.focus());
  }

  function trapDialogKeys(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeCreateForm();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = event.currentTarget.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled])',
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && event.target === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && event.target === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  function createCourse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = courseName.trim();
    if (!title) return;
    const newCourse: Course = {
      id: `course-${Date.now()}`,
      title,
      subject: "New subject",
      grade: "Grade 10",
      chapters: 0,
      students: 0,
      completion: 0,
      status: "Draft",
      accent: "violet",
      lastUpdated: "Created just now",
      nextChapter: "Add your first chapter",
    };
    setCreatedCourses((current) => [newCourse, ...current]);
    setCourseName("");
    closeCreateForm();
    setNotice(`${title} has been added to your drafts.`);
  }

  return (
    <div className="dashboard-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow"><span className="eyebrow-dot" /> YOUR TEACHER SPACE</div>
          <h1>Good morning, {user.name.split(" ")[0]} <span className="heading-wave">✳</span></h1>
          <p>Here’s what’s happening in your classroom today.</p>
        </div>
        <button ref={createButtonRef} className="button button-primary" onClick={() => setShowCreateForm(true)} type="button">
          <Icon name="plus" size={18} /> Create a course
        </button>
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
                    to="/student/courses/cell-biology/lessons/cell-structure"
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

          <button className="add-course-row" onClick={() => setShowCreateForm(true)} type="button">
            <span className="add-course-icon"><Icon name="plus" size={18} /></span>
            <span><strong>Build something new</strong><small>Start with a topic or add a textbook</small></span>
            <Icon name="arrow-right" size={17} />
          </button>
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
              to="/student/courses/cell-biology/lessons/cell-structure"
              className="insight-link"
            >
              Explore the lesson <Icon name="arrow-right" size={15} />
            </Link>
            <span className="insight-decoration" aria-hidden="true" />
          </section>
        </aside>
      </div>

      {showCreateForm && (
        <div className="modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeCreateForm();
        }}>
          <section aria-labelledby="create-course-title" aria-modal="true" className="modal-card" onKeyDown={trapDialogKeys} role="dialog">
            <button aria-label="Close dialog" className="modal-close icon-button" onClick={closeCreateForm} type="button">
              <Icon name="close" size={19} />
            </button>
            <div className="modal-symbol"><Icon name="sparkles" size={21} /></div>
            <div className="eyebrow eyebrow-muted">NEW LEARNING SPACE</div>
            <h2 id="create-course-title">Start a new course</h2>
            <p>Give your course a name. You can add a source and shape the chapters next.</p>
            <form onSubmit={createCourse}>
              <label htmlFor="course-name">Course name</label>
              <input autoFocus id="course-name" onChange={(event) => setCourseName(event.target.value)} placeholder="e.g. Our solar system" required value={courseName} />
              <div className="modal-actions">
                <button className="button button-secondary" onClick={closeCreateForm} type="button">Cancel</button>
                <button className="button button-primary" type="submit"><Icon name="plus" size={17} /> Create draft</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
