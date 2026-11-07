import { useState } from "react";
import { useCourses } from "@/features/courses/api";
import { AnalyticsPanel } from "@/features/analytics/AnalyticsPanel";
import { EmptyState, ErrorAlert, Loading } from "@/components/feedback";
export function TeacherAnalyticsPage() {
  const courses = useCourses();
  const [selected, setSelected] = useState("");
  if (courses.isPending) return <Loading />;
  if (courses.error) return <ErrorAlert error={courses.error} />;
  const list = courses.data.filter(c => c.can_manage);
  const id = list.find(c => c.id === selected)?.id ?? list[0]?.id;
  return <div className="dashboard-page teacher-analytics-page"><header className="page-heading"><div><div className="eyebrow">TEACHER INSIGHTS</div><h1>See how your class is growing.</h1><p>Lesson completion, assessment results, and concepts worth revisiting.</p></div></header>
    {id ? <><section className="panel analytics-filters"><label>Course<select value={id} onChange={e => setSelected(e.target.value)}>{list.map(c => <option value={c.id} key={c.id}>{c.title}</option>)}</select></label></section><AnalyticsPanel key={id} courseId={id} /></> : <EmptyState title="No courses yet">Create a course to start collecting classroom insights.</EmptyState>}
  </div>;
}
