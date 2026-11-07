import { Link } from "react-router";
import { ErrorAlert, EmptyState, Loading } from "@/components/feedback";
import { useMyProgress } from "@/features/student/api";
import { ProgressBar } from "@/features/student/ProgressBar";
import { MyInsightsCard } from "@/features/student/MyInsightsCard";
export function StudentProgressPage() {
  const q = useMyProgress();
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorAlert error={q.error} />;
  return <div className="dashboard-page"><header className="page-heading"><div><div className="eyebrow">YOUR LEARNING JOURNEY</div><h1>Look how far you’ve come.</h1><p>Your saved lesson progress and assessment insights.</p></div></header>
    {!q.data.length && <EmptyState title="No progress yet">Your enrolled courses will appear here.</EmptyState>}
    {q.data.map(c => <section className="panel progress-panel" key={c.course_id}><div className="section-heading"><h2>{c.title}</h2><Link className="text-link" to={`/student/courses/${c.course_id}`}>Open course →</Link></div><ProgressBar done={c.completed_lessons} total={c.total_lessons} label="Lessons complete" /><div className="mt-5"><MyInsightsCard courseId={c.course_id} /></div></section>)}
  </div>;
}
