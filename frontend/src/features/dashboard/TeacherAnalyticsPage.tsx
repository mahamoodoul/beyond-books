import { useState } from "react";

import { EmptyState, ErrorAlert, Loading } from "@/components/feedback";
import { AnalyticsPanel } from "@/features/analytics/AnalyticsPanel";
import { useCourses } from "@/features/courses/api";

export function TeacherAnalyticsPage() {
  const courses = useCourses();
  const [selected, setSelected] = useState("");
  if (courses.isPending) return <Loading />;
  if (courses.error) return <ErrorAlert error={courses.error} />;
  const list = courses.data.filter((c) => c.can_manage);
  // Open on a published course: drafts have no student activity to show yet.
  const id = list.find((c) => c.id === selected)?.id ?? (list.find((c) => c.status === "published") ?? list[0])?.id;
  return (
    <div className="dashboard-page teacher-analytics-page">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow">INSIGHTS</div>
          <h1 className="text-2xl font-semibold text-navy-950">Class insights</h1>
          <p className="text-sm text-slate-600">What to do next, how far the class is, and who needs a hand.</p>
        </div>
        {list.length > 0 && (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            Course
            <select
              className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900"
              value={id}
              onChange={(e) => setSelected(e.target.value)}
            >
              {list.map((c) => <option value={c.id} key={c.id}>{c.title}</option>)}
            </select>
          </label>
        )}
      </header>
      {id ? (
        <AnalyticsPanel key={id} courseId={id} />
      ) : (
        <EmptyState title="No courses yet">Create a course to start collecting classroom insights.</EmptyState>
      )}
    </div>
  );
}
