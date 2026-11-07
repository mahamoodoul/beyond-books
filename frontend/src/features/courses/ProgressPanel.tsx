import { useQuery } from "@tanstack/react-query";

import { api } from "@/api/client";
import type { StudentProgressRow } from "@/api/generated/schema";
import { EmptyState, ErrorAlert, Loading } from "@/components/feedback";
import { Card } from "@/components/ui";

export function ProgressPanel({ courseId }: { courseId: string }) {
  const rows = useQuery({ queryKey: ["course-progress", courseId], queryFn: () => api.get<StudentProgressRow[]>(`/courses/${courseId}/progress`) });
  return (
    <Card>
      <h2 className="mb-3 font-semibold">Student progress</h2>
      {rows.isPending && <Loading />}
      <ErrorAlert error={rows.error} />
      {rows.data?.length === 0 && <EmptyState title="No students enrolled" />}
      {!!rows.data?.length && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500">
              <tr><th className="py-2">Student</th><th>Lessons</th><th>Chapters done</th><th>Last activity</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.data.map((r) => {
                const pct = r.total_lessons ? Math.round((r.completed_lessons / r.total_lessons) * 100) : 0;
                return (
                  <tr key={r.student_id}>
                    <td className="py-2">{r.display_name} <span className="text-slate-500">{r.email}</span></td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-24 overflow-hidden rounded bg-slate-200"><div className="h-full bg-green-600" style={{ width: `${pct}%` }} /></div>
                        {r.completed_lessons}/{r.total_lessons}
                      </div>
                    </td>
                    <td>{r.completed_chapters}</td>
                    <td>{r.last_activity_at ? new Date(r.last_activity_at).toLocaleString() : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
