import { useQueries } from "@tanstack/react-query";
import { Link } from "react-router";
import { Icon } from "@/components/ui/Icon";
import { EmptyState, ErrorAlert, Loading } from "@/components/feedback";
import { useMe } from "@/features/auth/auth";
import { useCourses } from "@/features/courses/api";
import { getClassAnalytics, getCourseProgress } from "@/lib/api";
import { pct } from "@/features/analytics/charts";

import { firstName, timeAgo } from "./format";

export function DemoTeacherDashboard() {
  const me = useMe();
  const courses = useCourses();
  const list = courses.data?.filter(c => c.can_manage) ?? [];
  const analytics = useQueries({ queries: list.map(c => ({ queryKey: ["analytics", c.id], queryFn: () => getClassAnalytics(c.id) })) });
  const progress = useQueries({ queries: list.map(c => ({ queryKey: ["course-progress", c.id], queryFn: () => getCourseProgress(c.id) })) });
  if (courses.isPending) return <Loading label="Loading your classroom…" />;
  if (courses.error) return <ErrorAlert error={courses.error} />;
  const allRows = progress.flatMap((q, i) => (q.data ?? []).map(row => ({ ...row, course: list[i]! })));
  const students = new Set(allRows.map(row => row.student_id)).size;
  const completed = allRows.reduce((n, row) => n + row.completed_lessons, 0);
  const total = allRows.reduce((n, row) => n + row.total_lessons, 0);
  const recent = [...allRows].filter(r => r.last_activity_at).sort((a,b) => b.last_activity_at!.localeCompare(a.last_activity_at!)).slice(0,5);
  const pending = progress.some(q => q.isPending);
  const stats = [
    { label: "Enrolled learners", value: pending ? "…" : String(students), icon: "users" as const, tone: "violet" },
    { label: "Lessons completed", value: pending ? "…" : String(completed), icon: "check" as const, tone: "mint" },
    { label: "Lesson completion", value: pending ? "…" : total ? pct(completed / total) : "No activity yet", icon: "activity" as const, tone: "amber" },
  ];
  return <div className="dashboard-page">
    <header className="page-heading"><div><div className="eyebrow"><span className="eyebrow-dot" /> YOUR TEACHER SPACE</div><h1>Welcome back, {firstName(me.data?.display_name)} <span className="heading-wave">✳</span></h1><p>Your courses, learners, and latest classroom activity.</p></div><Link className="button button-primary" to="/teacher/upload"><Icon name="plus" size={18} /> Create a course</Link></header>
    <ErrorAlert error={progress.find(q => q.error)?.error ?? analytics.find(q => q.error)?.error} />
    <section aria-label="Classroom overview" className="metric-grid">{stats.map(stat => <article className={`metric-card metric-card-${stat.tone}`} key={stat.label}><div className="metric-top"><span>{stat.label}</span><span className={`metric-icon metric-icon-${stat.tone}`}><Icon name={stat.icon} size={18} /></span></div><div className="metric-value">{stat.value}</div><div className="metric-note">Across your managed courses</div></article>)}</section>
    <div className="teacher-content-grid">
      <div className="left-column">
      <section className="panel courses-panel"><div className="section-heading"><div><span className="eyebrow eyebrow-muted">YOUR LIBRARY</span><h2>Your courses <span className="count-pill">{list.length}</span></h2></div><Link className="text-link" to="/teacher/courses">View all <Icon name="arrow-right" size={16} /></Link></div>
        {!list.length && <EmptyState title="Start your first course">Upload a textbook or add a course to build your classroom.</EmptyState>}
        <div className="course-list">{list.slice(0,5).map((course, i) => <article className="course-row" key={course.id}>
          <div className="course-art course-art-violet" aria-hidden="true"><Icon name="book" size={28} /><span className="art-orb" /></div>
          <div className="course-details"><div className="course-subject">{course.subject || "General"} · {course.grade_level || "All levels"}</div><h3><Link to={`/teacher/courses/${course.id}/review`}>{course.title}</Link></h3><div className="course-meta">Updated {new Date(course.updated_at).toLocaleDateString()}</div></div>
          <div className="course-row-progress"><span className={`status-pill status-${course.status}`}>{course.status === "published" ? "Published" : "Draft"}</span><div className="progress-label"><span>Class progress</span><strong>{analytics[i]?.data ? pct(analytics[i]!.data!.avg_completion_rate) : "—"}</strong></div></div>
          <Link aria-label={`Open ${course.title}`} className="course-open" to={`/teacher/courses/${course.id}/review`}><Icon name="arrow-up-right" size={18} /></Link>
        </article>)}</div>
        <Link className="add-course-row" to="/teacher/upload"><span className="add-course-icon"><Icon name="plus" size={18} /></span><span><strong>Build something new</strong><small>Start with your source material</small></span><Icon name="arrow-right" size={17} /></Link>
      </section>
      <section className="insight-card"><div className="insight-icon"><Icon name="lightbulb" size={18} /></div><div className="insight-label">TEACHER INSIGHTS</div><h2>Find the next teaching moment.</h2><p>Review real lesson completion, assessment results, and concepts that need more practice.</p><Link className="insight-link" to="/teacher/insights">View class insights <Icon name="arrow-right" size={15} /></Link></section>
      </div>
      <aside className="right-column"><section className="panel activity-panel"><div className="section-heading"><div><span className="eyebrow eyebrow-muted">YOUR CLASSROOM</span><h2>Recent learning activity</h2></div></div>
        {pending ? <Loading /> : !recent.length ? <EmptyState title="No activity yet">Enrol students and publish lessons to get started.</EmptyState> : <ul className="activity-list">{recent.map((r,i) => <li className="activity-item" key={`${r.course.id}-${r.student_id}`}><span className={`student-avatar student-avatar-${i}`}>{r.display_name.split(" ").map(p=>p[0]).slice(0,2).join("")}</span><div className="activity-copy"><p><strong>{r.display_name}</strong> studied <Link to={`/teacher/courses/${r.course.id}`}>{r.course.title}</Link></p><time dateTime={r.last_activity_at!} title={new Date(r.last_activity_at!).toLocaleString()}>{timeAgo(r.last_activity_at!)}</time></div></li>)}</ul>}
      </section></aside>
    </div>
  </div>;
}
