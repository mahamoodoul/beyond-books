import { Link } from "react-router";

import { EmptyState, ErrorAlert, Loading } from "@/components/feedback";
import { Card, PageHeader } from "@/components/ui";
import { useMyProgress } from "@/features/student/api";
import { ProgressBar } from "@/features/student/ProgressBar";

export function StudentDashboard() {
  const progress = useMyProgress();
  return (
    <>
      <PageHeader title="My learning" />
      {progress.isPending && <Loading />}
      <ErrorAlert error={progress.error} />
      {progress.data?.length === 0 && <EmptyState title="No courses yet">Courses your teacher publishes for you will appear here.</EmptyState>}
      <div className="grid gap-4 md:grid-cols-2">
        {progress.data?.map((c) => (
          <Card key={c.course_id}>
            <Link to={`/student/courses/${c.course_id}`} className="text-lg font-semibold hover:underline">{c.title}</Link>
            <div className="mt-3"><ProgressBar done={c.completed_lessons} total={c.total_lessons} label="Progress" /></div>
            <div className="mt-4 flex gap-2">
              {c.next_lesson_id ? (
                <Link to={`/student/lessons/${c.next_lesson_id}`} className="rounded-md bg-navy-900 px-3 py-2 text-sm font-medium text-white">
                  {c.completed_lessons ? "Continue" : "Start"}
                </Link>
              ) : (
                c.total_lessons > 0 && <span className="text-sm text-green-700">Course complete ✓</span>
              )}
              <Link to={`/student/courses/${c.course_id}`} className="rounded-md border border-slate-300 px-3 py-2 text-sm">Overview</Link>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
