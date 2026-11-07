import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";

import { api } from "@/api/client";
import type { CourseOut, CourseProgressSummary } from "@/api/generated/schema";
import { Icon } from "@/components/ui/Icon";
import { useOutline } from "@/features/student/api";

/* Live data (backend): a student's courses are the published courses they are enrolled in, joined
   with their progress summary. Enrollment is done by teachers, so there is no self-enroll here. */
type Accent = "mint" | "amber" | "violet";
type CourseStatus = "in_progress" | "not_started" | "completed";

interface StudentCourse {
  id: string;
  title: string;
  subject: string;
  grade: string;
  description: string;
  accent: Accent;
  totalLessons: number;
  completedLessons: number;
  nextLessonId: string | null;
  lastActivityAt: string | null;
  status: CourseStatus;
}

const accents: Accent[] = ["violet", "mint", "amber"];

function statusOf(total: number, done: number, lastActivity: string | null): CourseStatus {
  if (total > 0 && done >= total) return "completed";
  return done > 0 || lastActivity ? "in_progress" : "not_started";
}

async function getStudentCourses(): Promise<StudentCourse[]> {
  const [courses, progress] = await Promise.all([
    api.get<CourseOut[]>("/courses"),
    api.get<CourseProgressSummary[]>("/students/me/progress"),
  ]);
  const byCourse = new Map(progress.map((p) => [p.course_id, p]));
  return courses.map((c, i) => {
    const p = byCourse.get(c.id);
    const total = p?.total_lessons ?? 0;
    const done = p?.completed_lessons ?? 0;
    const last = p?.last_activity_at ?? null;
    return {
      id: c.id,
      title: c.title,
      subject: c.subject ?? "Course",
      grade: c.grade_level ?? "",
      description: c.description,
      accent: accents[i % accents.length] ?? "violet",
      totalLessons: total,
      completedLessons: done,
      nextLessonId: p?.next_lesson_id ?? null,
      lastActivityAt: last,
      status: statusOf(total, done, last),
    };
  });
}

const STATUS_LABEL: Record<CourseStatus, string> = {
  in_progress: "In progress",
  not_started: "Not started",
  completed: "Completed",
};
const STATUS_ORDER: Record<CourseStatus, number> = { in_progress: 0, not_started: 1, completed: 2 };

type Filter = "all" | CourseStatus;
const filters: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "All" },
  { id: "in_progress", label: "In progress" },
  { id: "not_started", label: "Not started" },
  { id: "completed", label: "Completed" },
];

const percent = (c: StudentCourse) => (c.totalLessons ? Math.round((c.completedLessons / c.totalLessons) * 100) : 0);

function subjectIcon(subject: string) {
  const s = subject.toLowerCase();
  if (/(bio|life|plant|cell|anatomy)/.test(s)) return "leaf" as const;
  if (/(chem|physic|science|lab)/.test(s)) return "flask" as const;
  return "book" as const;
}

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
function lastStudied(iso: string | null): string | null {
  if (!iso) return null;
  const minutes = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
  if (minutes > -60) return `Studied ${relative.format(Math.min(minutes, 0), "minute")}`;
  const hours = Math.round(minutes / 60);
  if (hours > -24) return `Studied ${relative.format(hours, "hour")}`;
  return `Studied ${relative.format(Math.round(hours / 24), "day")}`;
}

/** Where the main button should take the learner: straight into the next lesson when there is one. */
function primaryAction(c: StudentCourse): { to: string; label: string } {
  const course = `/student/courses/${c.id}`;
  if (c.status === "completed") return { to: course, label: "Review course" };
  if (!c.nextLessonId) return { to: course, label: "View course" };
  return { to: `/student/lessons/${c.nextLessonId}`, label: c.status === "not_started" ? "Start course" : "Continue" };
}

function CourseProgress({ course, compact = false }: { course: StudentCourse; compact?: boolean }) {
  const value = percent(course);
  return (
    <div className={`course-progress${compact ? " course-progress-compact" : ""}`}>
      <div className="course-progress-label">
        <span>{course.completedLessons} of {course.totalLessons} {course.totalLessons === 1 ? "lesson" : "lessons"}</span>
        <strong>{value}%</strong>
      </div>
      <div aria-label={`${value}% complete`} aria-valuemax={100} aria-valuemin={0} aria-valuenow={value} className="course-progress-track" role="progressbar">
        <span style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

/** "Pick up where you left off": the most relevant unfinished course, with its next lesson. */
function ContinueCard({ course }: { course: StudentCourse }) {
  const outline = useOutline(course.id);
  const next = outline.data?.chapters
    .flatMap((ch) => ch.lessons.map((l) => ({ lesson: l, chapter: ch })))
    .find(({ lesson }) => lesson.id === course.nextLessonId);
  const action = primaryAction(course);
  return (
    <section aria-labelledby="continue-title" className={`continue-course panel continue-course-${course.accent}`}>
      <div aria-hidden="true" className="continue-course-art"><Icon name={subjectIcon(course.subject)} size={30} /></div>
      <div className="continue-course-body">
        <span className="eyebrow eyebrow-muted">{course.status === "not_started" ? "READY WHEN YOU ARE" : "PICK UP WHERE YOU LEFT OFF"}</span>
        <h2 id="continue-title">{course.title}</h2>
        {next ? (
          <p className="continue-course-next">
            <span>Up next</span> {next.lesson.title}
            <small>Chapter {next.chapter.position} · {next.chapter.title}</small>
          </p>
        ) : (
          <p className="continue-course-next">{course.description || "Open the course to see what’s inside."}</p>
        )}
        <CourseProgress course={course} />
      </div>
      <div className="continue-course-actions">
        <Link className="button button-primary" to={action.to}>{action.label} <Icon name="arrow-right" size={16} /></Link>
        <Link className="button button-secondary" to={`/student/courses/${course.id}`}>Course overview</Link>
      </div>
    </section>
  );
}

function CourseCard({ course }: { course: StudentCourse }) {
  const action = primaryAction(course);
  const studied = lastStudied(course.lastActivityAt);
  return (
    <article className={`catalog-course-card catalog-course-${course.accent}`}>
      <Link aria-hidden="true" className="catalog-course-art" tabIndex={-1} to={`/student/courses/${course.id}`}>
        <span className="catalog-course-art-orbit" />
        <span className="catalog-course-art-icon"><Icon name={subjectIcon(course.subject)} size={26} /></span>
        <span className={`course-status-chip course-status-${course.status}`}>
          {course.status === "completed" && <Icon name="check" size={13} />}{STATUS_LABEL[course.status]}
        </span>
      </Link>
      <div className="catalog-course-content">
        <div className="catalog-course-meta">
          <span>{course.subject}</span>
          {course.grade && <span>{course.grade}</span>}
        </div>
        <h2><Link to={`/student/courses/${course.id}`}>{course.title}</Link></h2>
        <p>{course.description || `Explore ${course.subject.toLowerCase()} with visual lessons and guided activities.`}</p>
        <CourseProgress compact course={course} />
        <div className="catalog-course-details">
          <span><Icon name="clock" size={15} /> {studied ?? "Not started yet"}</span>
        </div>
        <Link className={`button ${course.status === "completed" ? "button-secondary" : "button-primary"} catalog-course-action`} to={action.to}>
          {action.label} <Icon name="arrow-right" size={16} />
        </Link>
      </div>
    </article>
  );
}

export function StudentCoursesPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const coursesQuery = useQuery({ queryKey: ["student-courses"], queryFn: getStudentCourses });

  const courses = useMemo(
    () =>
      [...(coursesQuery.data ?? [])].sort(
        (a, b) =>
          STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
          (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? "") ||
          a.title.localeCompare(b.title),
      ),
    [coursesQuery.data],
  );

  if (coursesQuery.isPending) {
    return (
      <div aria-label="Loading courses" className="catalog-loading-grid" role="status">
        <span /><span /><span />
      </div>
    );
  }

  if (coursesQuery.isError) {
    return (
      <section className="catalog-message panel" role="alert">
        <Icon name="circle-help" size={23} />
        <h1>We couldn’t load your courses.</h1>
        <p>{coursesQuery.error.message}</p>
        <button className="button button-secondary" onClick={() => void coursesQuery.refetch()} type="button">Try again</button>
      </section>
    );
  }

  if (courses.length === 0) {
    return (
      <div className="student-catalog-page">
        <header className="student-catalog-heading">
          <div>
            <div className="eyebrow"><span className="eyebrow-dot" /> MY COURSES</div>
            <h1>Your courses will appear here.</h1>
          </div>
        </header>
        <section className="catalog-message panel">
          <Icon name="book" size={24} />
          <h2>No courses yet</h2>
          <p>When your teacher adds you to a course, it shows up here with your progress and the next lesson to try.</p>
          <Link className="button button-secondary" to="/student">Back to My learning</Link>
        </section>
      </div>
    );
  }

  const totals = courses.reduce(
    (t, c) => ({ lessons: t.lessons + c.totalLessons, done: t.done + c.completedLessons }),
    { lessons: 0, done: 0 },
  );
  const overall = totals.lessons ? Math.round((totals.done / totals.lessons) * 100) : 0;
  const counts = Object.fromEntries(filters.map((f) => [f.id, f.id === "all" ? courses.length : courses.filter((c) => c.status === f.id).length]));
  const spotlight = courses.find((c) => c.status !== "completed");
  const query = search.trim().toLowerCase();
  const visible = courses.filter(
    (c) =>
      (filter === "all" || c.status === filter) &&
      (!query || `${c.title} ${c.subject} ${c.grade}`.toLowerCase().includes(query)),
  );

  return (
    <div className="student-catalog-page">
      <header className="student-catalog-heading">
        <div>
          <div className="eyebrow"><span className="eyebrow-dot" /> MY COURSES</div>
          <h1>Keep learning, one step at a time.</h1>
          <p>Your courses, your progress and what to do next, all in one place.</p>
        </div>
        <dl aria-label="Your learning at a glance" className="catalog-stats">
          <div><dt>Courses</dt><dd>{courses.length}</dd></div>
          <div><dt>Lessons done</dt><dd>{totals.done}<small>/{totals.lessons}</small></dd></div>
          <div><dt>Overall</dt><dd>{overall}%</dd></div>
        </dl>
      </header>

      {spotlight && <ContinueCard course={spotlight} />}

      <section aria-labelledby="all-courses-title" className="catalog-section">
        <div className="catalog-section-heading">
          <h2 id="all-courses-title">All my courses</h2>
          <label className="catalog-search">
            <Icon name="search" size={16} />
            <span className="sr-only">Search your courses</span>
            <input onChange={(e) => setSearch(e.target.value)} placeholder="Search courses" type="search" value={search} />
          </label>
        </div>
        <nav aria-label="Filter courses by progress" className="catalog-filters">
          {filters.map((item) => (
            <button
              aria-pressed={filter === item.id}
              className={`catalog-filter${filter === item.id ? " catalog-filter-active" : ""}`}
              key={item.id}
              onClick={() => setFilter(item.id)}
              type="button"
            >
              {item.label} <span className="catalog-filter-count">{counts[item.id]}</span>
            </button>
          ))}
        </nav>

        {visible.length > 0 ? (
          <div className="catalog-course-grid">
            {visible.map((course) => <CourseCard course={course} key={course.id} />)}
          </div>
        ) : (
          <div className="catalog-message panel">
            <Icon name="search" size={24} />
            <h2>No courses match</h2>
            <p>{query ? `Nothing matches “${search.trim()}”.` : `You have no ${STATUS_LABEL[filter as CourseStatus].toLowerCase()} courses right now.`}</p>
            <button className="button button-secondary" onClick={() => { setFilter("all"); setSearch(""); }} type="button">Show all courses</button>
          </div>
        )}
      </section>
    </div>
  );
}
