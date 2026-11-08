import { Link } from "react-router";
import { Icon } from "@/components/ui/Icon";
import { EmptyState, ErrorAlert, Loading } from "@/components/feedback";
import { useMe } from "@/features/auth/auth";
import { useMyProgress } from "@/features/student/api";
import { firstName } from "./format";

export function DemoStudentDashboard() {
  const me = useMe();
  const query = useMyProgress();
  if (query.isPending) return <Loading label="Preparing your learning space…" />;
  if (query.error) return <ErrorAlert error={query.error} />;
  const courses = query.data;
  const current = courses.find(c => c.next_lesson_id) ?? courses[0];
  const done = !!current && current.total_lessons > 0 && current.completed_lessons >= current.total_lessons;
  return <div className="dashboard-page student-dashboard" data-page-title="My learning">
    <header className="page-heading"><div><div className="eyebrow"><span className="eyebrow-dot" /> YOUR LEARNING SPACE</div><h1>Keep that curiosity going, {firstName(me.data?.display_name)} <span className="heading-wave">✳</span></h1><p>Pick up where you left off, or explore another course.</p></div><Link className="button button-secondary" to="/student/progress">My progress <Icon name="activity" size={16} /></Link></header>
    {current && <section className="continue-card"><div className="continue-copy"><span className="eyebrow eyebrow-light"><Icon name={done ? "check" : "play"} size={13} /> {done ? "COURSE COMPLETE" : "YOUR NEXT STEP"}</span><h2>{current.title}</h2><p>{done ? `All ${current.total_lessons} lessons complete. Revisit any chapter or try the quizzes again.` : `${current.completed_lessons} of ${current.total_lessons} lessons complete`}</p><div className="progress-track continue-progress" role="progressbar" aria-label="Course progress" aria-valuenow={current.total_lessons ? Math.round(current.completed_lessons/current.total_lessons*100) : 0} aria-valuemin={0} aria-valuemax={100}><span style={{width:`${current.total_lessons ? current.completed_lessons/current.total_lessons*100 : 0}%`}} /></div><Link className="button continue-button" to={current.next_lesson_id ? `/student/lessons/${current.next_lesson_id}` : `/student/courses/${current.course_id}`}>{current.next_lesson_id ? "Continue learning" : done ? "Review course" : "View course"}<Icon name="arrow-right" size={17} /></Link></div><div className="continue-visual" aria-hidden="true"><Icon name="layers" size={120} /><div className="visual-caption">EXPLORE. UNDERSTAND. REMEMBER.</div></div></section>}
    <section className="panel student-courses-panel"><div className="section-heading"><div><span className="eyebrow eyebrow-muted">READY WHEN YOU ARE</span><h2>Your courses <span className="count-pill">{courses.length}</span></h2></div></div>
      {!courses.length ? <EmptyState title="No courses yet">Ask your teacher to enrol your account in a published course.</EmptyState> : courses.map(c => <Link className="student-course-row" to={`/student/courses/${c.course_id}`} key={c.course_id}><span className="student-course-thumb thumb-mint"><Icon name="book" size={22} /></span><span className="student-course-copy"><strong>{c.title}</strong><span>{c.completed_lessons}/{c.total_lessons} lessons complete{c.last_activity_at ? ` · Last studied ${new Date(c.last_activity_at).toLocaleDateString()}` : ""}</span></span><span className="student-course-arrow"><Icon name="arrow-up-right" size={17} /></span></Link>)}
    </section>
  </div>;
}
