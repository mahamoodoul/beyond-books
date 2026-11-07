import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";

import { api } from "@/api/client";
import type { StudentInsights } from "@/api/generated/schema";
import { Card } from "@/components/ui";
import { pct, STATUS } from "@/features/analytics/charts";

export function MyInsightsCard({ courseId }: { courseId: string }) {
  const q = useQuery({ queryKey: ["my-insights", courseId], queryFn: () => api.get<StudentInsights>(`/courses/${courseId}/my-insights`) });
  if (!q.data || q.data.objectives.every((o) => o.status === "no_evidence")) return null;
  return (
    <Card className="mb-6">
      <h2 className="mb-2 font-semibold">How you are doing</h2>
      <ul className="space-y-1 text-sm">
        {q.data.objectives.filter((o) => o.status !== "no_evidence").map((o) => {
          const s = STATUS[o.status as keyof typeof STATUS];
          return <li key={o.objective_id}><span aria-hidden style={{ color: s.color }}>{s.icon}</span> {s.label} · {o.text} <span className="text-slate-500">({pct(o.mastery)})</span></li>;
        })}
      </ul>
      {q.data.recommendations.length > 0 && (
        <div className="mt-3 text-sm">
          <p className="font-medium">Revise next</p>
          <ul className="list-disc pl-5">
            {q.data.recommendations.map((r) => <li key={r.lesson_id}><Link className="text-accent underline" to={`/student/lessons/${r.lesson_id}`}>{r.lesson_title}</Link> — {r.reason}</li>)}
          </ul>
        </div>
      )}
    </Card>
  );
}
