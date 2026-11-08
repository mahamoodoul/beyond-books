/**
 * Course analytics for the teacher, kept brief: four numbers, what needs doing, lessons and
 * quizzes side by side, the weakest objectives, and the students to check on. Everything longer
 * (all objectives, all students, every question) sits behind a "Show all" toggle.
 */
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router";

import { api } from "@/api/client";
import type { AssessmentStat, CourseAnalytics, ObjectiveStat, StudentAttention, StudentInsights } from "@/api/generated/schema";
import { EmptyState, ErrorAlert, Loading } from "@/components/feedback";
import { Badge, Button, Card } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";

import { MasteryBar, pct, RateBars, STATUS, StatTile } from "./charts";

const PREVIEW = 5;

function clip(text: string, max = 90): string {
  const t = text.trim().replace(/\.$/, "");
  return t.length <= max ? t : t.slice(0, max - 1).trimEnd() + "…";
}

function Section({ title, hint, action, children }: { title: string; hint?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="font-semibold text-slate-900">{title}</h2>
          {hint && <p className="text-xs text-slate-500">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}

function ShowAll({ total, open, onToggle }: { total: number; open: boolean; onToggle: () => void }) {
  if (total <= PREVIEW) return null;
  return (
    <button type="button" className="mt-2 text-xs font-medium text-navy-700 hover:underline" onClick={onToggle}>
      {open ? "Show fewer" : `Show all ${total}`}
    </button>
  );
}

/* ----------------------------------------------------------------- to do */
function ToDo({ d }: { d: CourseAnalytics }) {
  const inactive = d.insights.find((i) => i.kind === "inactive_students");
  const pending = d.assessments.filter((a) => a.pending_reviews > 0);
  const gaps = d.objectives.filter((o) => o.gaps > 0 && (o.avg_mastery ?? 1) < 0.5);
  const concepts = d.missing_concepts.slice(0, 3);
  const items: { tone: "red" | "amber" | "blue"; icon: string; text: ReactNode }[] = [];
  if (inactive) {
    items.push({ tone: "amber", icon: "▲", text: <>{inactive.message.replace(/ student\(s\)/, " students").replace(" yet.", ".")}</> });
  }
  for (const a of pending) {
    items.push({
      tone: "blue",
      icon: "◆",
      text: (
        <>
          <strong>{a.pending_reviews}</strong> short answer{a.pending_reviews === 1 ? "" : "s"} to review in <Link className="font-medium text-navy-700 hover:underline" to={`/teacher/assessments/${a.assessment_id}`}>{a.title}</Link>
        </>
      ),
    });
  }
  if (gaps.length) {
    items.push({ tone: "red", icon: "▲", text: <>{gaps.length} objective{gaps.length === 1 ? "" : "s"} below 50% mastery: {gaps.slice(0, 2).map((g) => clip(g.text, 60)).join("; ")}{gaps.length > 2 ? ` and ${gaps.length - 2} more` : ""}</> });
  }
  if (concepts.length) {
    items.push({ tone: "blue", icon: "ℹ", text: <>Often missing in written answers: {concepts.map((c) => `${clip(c.concept, 70)} (${c.count})`).join(" · ")}</> });
  }
  if (!items.length) return <EmptyState title="Nothing needs your attention right now" />;
  return (
    <ul className="space-y-2 text-sm">
      {items.map((it, k) => (
        <li key={k} className="flex gap-2">
          <Badge tone={it.tone}>{it.icon}</Badge>
          <span className="text-slate-800">{it.text}</span>
        </li>
      ))}
    </ul>
  );
}

/* --------------------------------------------------------------- quizzes */
function QuizRow({ a, enrolled }: { a: AssessmentStat; enrolled: number }) {
  const [open, setOpen] = useState(false);
  const hardest = useMemo(
    () => [...a.questions].filter((q) => q.avg_score_rate != null).sort((x, y) => (x.avg_score_rate ?? 0) - (y.avg_score_rate ?? 0)),
    [a.questions],
  );
  const shown = open ? hardest : hardest.slice(0, 3);
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {/* basis-48: on narrow screens the numbers wrap below instead of cutting the title to "Ho…" */}
        <Link to={`/teacher/assessments/${a.assessment_id}`} title={a.title} className="min-w-0 flex-1 basis-48 truncate font-medium text-slate-900 hover:underline">{a.title}</Link>
        <span className="text-xs text-slate-500">{a.students_attempted}/{enrolled} attempted</span>
        <span className="text-sm tabular-nums text-slate-800" title="Average score of graded attempts">avg {pct(a.avg_score_rate)}</span>
        <span className="text-sm tabular-nums text-slate-800" title="Share of graded attempts above the pass mark">pass {pct(a.pass_rate)}</span>
        {a.pending_reviews > 0 && <Badge tone="blue">{a.pending_reviews} to review</Badge>}
      </div>
      {hardest.length > 0 && (
        <div className="mt-2">
          <p className="mb-1 text-xs text-slate-500">{open ? "All questions" : "Hardest questions"} · share of points earned</p>
          <RateBars
            rows={shown.map((q) => ({
              id: q.question_key,
              label: clip(q.question_text, 80),
              rate: q.avg_score_rate,
              detail: q.common_wrong.length ? `Most common wrong answer: “${q.common_wrong[0]?.text}” (${q.common_wrong[0]?.count})` : `${q.responses} responses`,
            }))}
          />
          {hardest.length > 3 && (
            <button type="button" className="mt-1 text-xs font-medium text-navy-700 hover:underline" onClick={() => setOpen(!open)}>
              {open ? "Show hardest only" : `Show all ${hardest.length} questions`}
            </button>
          )}
        </div>
      )}
    </li>
  );
}

/* ------------------------------------------------------------ objectives */
function Objectives({ rows }: { rows: ObjectiveStat[] }) {
  const [open, setOpen] = useState(false);
  const ranked = useMemo(
    () => [...rows].filter((o) => o.students_with_evidence > 0).sort((a, b) => (a.avg_mastery ?? 0) - (b.avg_mastery ?? 0)),
    [rows],
  );
  const totals = rows.reduce((t, o) => ({ gaps: t.gaps + o.gaps, developing: t.developing + o.developing, mastered: t.mastered + o.mastered }), { gaps: 0, developing: 0, mastered: 0 });
  if (!rows.length) return <EmptyState title="No objectives defined" />;
  const shown = open ? ranked : ranked.slice(0, PREVIEW);
  return (
    <>
      <div className="mb-4">
        <p className="mb-1 text-xs text-slate-500">All objectives, all students with graded evidence</p>
        <MasteryBar gaps={totals.gaps} developing={totals.developing} mastered={totals.mastered} />
      </div>
      {ranked.length === 0 ? (
        <p className="text-sm text-slate-500">No graded evidence yet. Mastery appears once quizzes are graded.</p>
      ) : (
        <>
          <p className="mb-1 text-xs text-slate-500">{open ? "All objectives" : "Weakest first"}</p>
          <ul className="divide-y divide-slate-100">
            {shown.map((o) => {
              const s = (o.avg_mastery ?? 0) < 0.5 ? STATUS.gap : (o.avg_mastery ?? 0) < 0.8 ? STATUS.developing : STATUS.mastered;
              return (
                <li key={o.objective_id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="line-clamp-1 text-slate-800" title={o.text}>{o.text}</span>
                    <span className="text-xs text-slate-500">{o.chapter_title} · {o.gaps} gap{o.gaps === 1 ? "" : "s"} of {o.students_with_evidence}</span>
                  </span>
                  <span className="whitespace-nowrap tabular-nums text-slate-800" title={s.label}>
                    <span aria-hidden style={{ color: s.color }}>{s.icon}</span> {pct(o.avg_mastery)}
                  </span>
                </li>
              );
            })}
          </ul>
          <ShowAll total={ranked.length} open={open} onToggle={() => setOpen(!open)} />
        </>
      )}
    </>
  );
}

/* -------------------------------------------------------------- students */
function reason(r: string): string {
  return clip(r.replace(/^has not attempted: /, "No attempt: ").replace(/^has not completed any lesson.*/, "No lessons done"), 60);
}

function StudentDrawer({ courseId, studentId, onClose }: { courseId: string; studentId: string; onClose: () => void }) {
  const q = useQuery({ queryKey: ["insights", courseId, studentId], queryFn: () => api.get<StudentInsights>(`/courses/${courseId}/students/${studentId}/insights`) });
  const [all, setAll] = useState(false);
  const objectives = (q.data?.objectives ?? []).filter((o) => o.status !== "no_evidence");
  const order = { gap: 0, developing: 1, mastered: 2 } as Record<string, number>;
  const sorted = [...objectives].sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3));
  const shown = all ? sorted : sorted.slice(0, PREVIEW);
  return (
    <div className="mt-3 rounded-xl border border-navy-700/30 bg-slate-50 p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="font-semibold text-slate-900">{q.data?.display_name ?? "Student"}</h3>
        <Button variant="ghost" onClick={onClose}><Icon name="close" size={14} /> Close</Button>
      </div>
      {q.isPending && <Loading />}
      <ErrorAlert error={q.error} />
      {q.data && (
        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-slate-700">
            <span><strong className="text-slate-900">{q.data.completed_lessons}/{q.data.total_lessons}</strong> lessons</span>
            <span><strong className="text-slate-900">{q.data.attempts}</strong> quiz attempt{q.data.attempts === 1 ? "" : "s"}</span>
            <span><strong className="text-slate-900">{pct(q.data.avg_score_rate)}</strong> average score</span>
          </div>
          {sorted.length > 0 ? (
            <ul className="divide-y divide-slate-200">
              {shown.map((o) => {
                const s = o.status in STATUS ? STATUS[o.status as keyof typeof STATUS] : null;
                return (
                  <li key={o.objective_id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-1.5">
                    <span className="line-clamp-1 text-slate-800" title={o.text}>{o.text}</span>
                    <span className="whitespace-nowrap tabular-nums text-slate-800">{s && <span aria-hidden style={{ color: s.color }}>{s.icon} </span>}{s?.label ?? "—"} · {pct(o.mastery)}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-slate-500">No graded quiz evidence yet.</p>
          )}
          <ShowAll total={sorted.length} open={all} onToggle={() => setAll(!all)} />
          {q.data.recommendations.length > 0 && (
            <p className="text-slate-700">
              <span className="font-medium text-slate-900">Suggest revising:</span>{" "}
              {q.data.recommendations.slice(0, 3).map((r) => r.lesson_title).join(", ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Students({ rows, courseId, totalLessons }: { rows: StudentAttention[]; courseId: string; totalLessons: number }) {
  const [open, setOpen] = useState(false);
  const [student, setStudent] = useState<string | null>(null);
  const ranked = useMemo(
    () => [...rows].sort((a, b) => b.gap_objectives - a.gap_objectives || a.completed_lessons - b.completed_lessons || a.display_name.localeCompare(b.display_name)),
    [rows],
  );
  if (!rows.length) return <EmptyState title="Everyone is on track" />;
  const shown = open ? ranked : ranked.slice(0, PREVIEW);
  return (
    <>
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-slate-500">
          <tr>
            <th className="pb-1 pr-3 font-medium">Student</th>
            <th className="pb-1 pr-3 font-medium">Lessons</th>
            <th className="pb-1 pr-3 font-medium">Gaps</th>
            <th className="hidden pb-1 pr-3 font-medium sm:table-cell">Why</th>
            <th />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {shown.map((s) => (
            <tr key={s.student_id} className={student === s.student_id ? "bg-slate-50" : ""}>
              <td className="py-1.5 pr-3 font-medium text-slate-900">
                {s.display_name}
                {/* phones: the reason goes under the name instead of a squeezed column */}
                <span className="block text-xs font-normal text-slate-500 sm:hidden">{reason(s.reasons[0] ?? "")}{s.reasons.length > 1 ? ` +${s.reasons.length - 1}` : ""}</span>
              </td>
              <td className="py-1.5 pr-3 tabular-nums text-slate-700">{s.completed_lessons}/{totalLessons}</td>
              <td className="whitespace-nowrap py-1.5 pr-3 tabular-nums text-slate-700">
                {s.gap_objectives > 0 ? <span><span aria-hidden style={{ color: STATUS.gap.color }}>{STATUS.gap.icon}</span> {s.gap_objectives}</span> : "—"}
              </td>
              <td className="hidden py-1.5 pr-3 text-slate-600 sm:table-cell" title={s.reasons.join("; ")}>{reason(s.reasons[0] ?? "")}{s.reasons.length > 1 ? ` +${s.reasons.length - 1}` : ""}</td>
              <td className="py-1.5 text-right">
                <button type="button" className="text-xs font-medium text-navy-700 hover:underline" onClick={() => setStudent(student === s.student_id ? null : s.student_id)}>
                  {student === s.student_id ? "Hide" : "Details"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <ShowAll total={ranked.length} open={open} onToggle={() => setOpen(!open)} />
      {student && <StudentDrawer courseId={courseId} studentId={student} onClose={() => setStudent(null)} />}
    </>
  );
}

/* ----------------------------------------------------------------- panel */
export function AnalyticsPanel({ courseId }: { courseId: string }) {
  const q = useQuery({ queryKey: ["analytics", courseId], queryFn: () => api.get<CourseAnalytics>(`/courses/${courseId}/analytics`) });
  if (q.isPending) return <Loading label="Computing analytics…" />;
  if (q.error) return <ErrorAlert error={q.error} />;
  const d = q.data;
  const pending = d.assessments.reduce((a, x) => a + x.pending_reviews, 0);
  // Every student without a completed lesson is in `attention` (only counted once lessons exist).
  const notStarted = d.attention.filter((s) => s.completed_lessons === 0).length;
  const studentsHint =
    d.enrolled === 0 ? "no students enrolled yet"
    : d.total_lessons === 0 ? "no published lessons yet"
    : notStarted ? `${notStarted} yet to complete a lesson`
    : "all have completed a lesson";

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Students" value={String(d.enrolled)} hint={studentsHint} />
        <StatTile label="Lessons completed" value={pct(d.avg_completion_rate)} hint={`average across ${d.total_lessons} lesson${d.total_lessons === 1 ? "" : "s"}`} />
        <StatTile label="Quiz score" value={pct(d.avg_score_rate)} hint="average of graded attempts" />
        <StatTile label="To review" value={String(pending)} hint={pending ? "short answers waiting" : "nothing waiting"} />
      </div>

      {d.suppressed && (
        <p className="rounded-md bg-slate-100 px-3 py-2 text-xs text-slate-600">
          Fewer than {d.min_group_size} students: answer distributions are hidden to protect individuals.
        </p>
      )}

      <Section title="Needs your attention">
        <ToDo d={d} />
      </Section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Lessons" hint="Share of students who completed each lesson">
          <RateBars rows={d.lessons.map((l) => ({ id: l.lesson_id, label: l.title, rate: l.completion_rate, detail: `${l.completed} of ${d.enrolled} · ${l.chapter_title}` }))} emptyLabel="No published lessons yet" />
        </Section>
        <Section title="Quizzes" hint="Average score, pass rate and the hardest questions">
          {d.assessments.length === 0 ? (
            <p className="text-sm text-slate-500">No published quizzes yet</p>
          ) : (
            <ul className="-my-3 divide-y divide-slate-100">
              {d.assessments.map((a) => <QuizRow key={a.assessment_id} a={a} enrolled={d.enrolled} />)}
            </ul>
          )}
        </Section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Learning objectives" hint="Mastery from graded quiz answers">
          <Objectives rows={d.objectives} />
        </Section>
        <Section title="Students to check on" hint="Sorted by objective gaps, then by lessons completed">
          <Students rows={d.attention} courseId={courseId} totalLessons={d.total_lessons} />
        </Section>
      </div>
    </div>
  );
}
