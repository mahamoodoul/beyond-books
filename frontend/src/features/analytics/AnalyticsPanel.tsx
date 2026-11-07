import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { api } from "@/api/client";
import type { CourseAnalytics, StudentInsights } from "@/api/generated/schema";
import { EmptyState, ErrorAlert, Loading } from "@/components/feedback";
import { Badge, Button, Card } from "@/components/ui";

import { MasteryBar, pct, RateBars, STATUS, StatTile } from "./charts";

const sevTone = { critical: "red", warning: "amber", info: "blue" } as const;
const sevIcon = { critical: "▲", warning: "◆", info: "ℹ" } as const;

function StudentDrawer({ courseId, studentId, onClose }: { courseId: string; studentId: string; onClose: () => void }) {
  const q = useQuery({ queryKey: ["insights", courseId, studentId], queryFn: () => api.get<StudentInsights>(`/courses/${courseId}/students/${studentId}/insights`) });
  return (
    <Card className="mt-4 border-navy-700">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-semibold">{q.data?.display_name ?? "Student"}</h3>
        <Button variant="ghost" onClick={onClose}>Close</Button>
      </div>
      {q.isPending && <Loading />}
      <ErrorAlert error={q.error} />
      {q.data && (
        <div className="space-y-3 text-sm">
          <p>Lessons {q.data.completed_lessons}/{q.data.total_lessons} · quizzes attempted {q.data.attempts} · average score {pct(q.data.avg_score_rate)}</p>
          <table className="w-full">
            <thead className="text-left text-slate-500"><tr><th>Objective</th><th>Mastery</th><th>Status</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {q.data.objectives.map((o) => {
                const s = o.status in STATUS ? STATUS[o.status as keyof typeof STATUS] : null;
                return (
                  <tr key={o.objective_id}>
                    <td className="py-1">{o.text}</td>
                    <td className="tabular-nums">{pct(o.mastery)}</td>
                    <td>{s ? <span><span aria-hidden style={{ color: s.color }}>{s.icon}</span> {s.label}</span> : "No evidence"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {q.data.recommendations.length > 0 && (
            <div><p className="font-medium">Suggested revision</p>
              <ul className="list-disc pl-5">{q.data.recommendations.map((r) => <li key={r.lesson_id}>{r.lesson_title} — {r.reason}</li>)}</ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export function AnalyticsPanel({ courseId }: { courseId: string }) {
  const q = useQuery({ queryKey: ["analytics", courseId], queryFn: () => api.get<CourseAnalytics>(`/courses/${courseId}/analytics`) });
  const [student, setStudent] = useState<string | null>(null);
  if (q.isPending) return <Loading label="Computing analytics…" />;
  if (q.error) return <ErrorAlert error={q.error} />;
  const d = q.data;
  const pending = d.assessments.reduce((a, x) => a + x.pending_reviews, 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Students enrolled" value={String(d.enrolled)} />
        <StatTile label="Average lesson completion" value={pct(d.avg_completion_rate)} hint={`${d.total_lessons} published lessons`} />
        <StatTile label="Average quiz score" value={pct(d.avg_score_rate)} hint="Graded attempts only" />
        <StatTile label="Answers awaiting review" value={String(pending)} />
      </div>

      {d.suppressed && (
        <p className="rounded-md bg-slate-100 p-3 text-sm text-slate-700">
          Fewer than {d.min_group_size} students: class-level answer distributions are hidden to avoid identifying individuals.
        </p>
      )}

      <Card>
        <h2 className="mb-3 font-semibold">Insights</h2>
        {d.insights.length === 0 ? <EmptyState title="No issues detected yet" /> : (
          <ul className="space-y-2">
            {d.insights.map((i, k) => (
              <li key={k} className="flex gap-2 text-sm">
                <Badge tone={sevTone[i.severity as keyof typeof sevTone] ?? "slate"}>{sevIcon[i.severity as keyof typeof sevIcon]} {i.severity}</Badge>
                <span>{i.message}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold">Learning objectives</h2>
          {d.objectives.length === 0 ? <EmptyState title="No objectives defined" /> : (
            <ul className="space-y-4">
              {d.objectives.map((o) => (
                <li key={o.objective_id}>
                  <p className="text-sm text-slate-800">{o.text} <span className="text-slate-500">· {o.chapter_title} · avg {pct(o.avg_mastery)}</span></p>
                  <div className="mt-1"><MasteryBar gaps={o.gaps} developing={o.developing} mastered={o.mastered} /></div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">Lesson completion</h2>
          <RateBars rows={d.lessons.map((l) => ({ id: l.lesson_id, label: l.title, rate: l.completion_rate, detail: `${l.completed} of ${d.enrolled} students · ${l.chapter_title}` }))} />
        </Card>
      </div>

      {d.assessments.map((a) => (
        <Card key={a.assessment_id}>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold">{a.title}</h2>
            <p className="text-sm text-slate-600">{a.students_attempted} attempted · average {pct(a.avg_score_rate)} · pass rate {pct(a.pass_rate)}</p>
          </div>
          <p className="mb-2 text-xs text-slate-500">Share of points earned per question, hardest first</p>
          <RateBars rows={a.questions.map((x) => ({
            id: x.question_key,
            label: `${x.question_key}: ${x.question_text}`,
            rate: x.avg_score_rate,
            detail: x.common_wrong.length ? `Most common wrong answer: “${x.common_wrong[0]?.text}” (${x.common_wrong[0]?.count})` : `${x.responses} responses`,
          }))} emptyLabel="No submissions yet" />
        </Card>
      ))}

      {d.missing_concepts.length > 0 && (
        <Card>
          <h2 className="mb-2 font-semibold">Concepts often missing in written answers</h2>
          <ul className="flex flex-wrap gap-2 text-sm">{d.missing_concepts.map((c) => <li key={c.concept}><Badge>{c.concept} · {c.count}</Badge></li>)}</ul>
        </Card>
      )}

      <Card>
        <h2 className="mb-3 font-semibold">Students who may need attention</h2>
        {d.attention.length === 0 ? <EmptyState title="Everyone is on track" /> : (
          <ul className="divide-y divide-slate-100 text-sm">
            {d.attention.map((s) => (
              <li key={s.student_id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span><strong>{s.display_name}</strong> — {s.reasons.join("; ")}</span>
                <Button variant="ghost" onClick={() => setStudent(s.student_id)}>View insights</Button>
              </li>
            ))}
          </ul>
        )}
        {student && <StudentDrawer courseId={courseId} studentId={student} onClose={() => setStudent(null)} />}
      </Card>
    </div>
  );
}
