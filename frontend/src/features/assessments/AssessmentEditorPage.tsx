import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";

import { api, ApiError } from "@/api/client";
import type { AssessmentContent, QuestionIn, ReviewItem } from "@/api/generated/schema";
import { EmptyState, ErrorAlert, Loading } from "@/components/feedback";
import { Badge, Button, Card, Field, Input, PageHeader, Textarea } from "@/components/ui";

import { useAssessmentMutations, useAttempts, useReviewQueue, useTeacherAssessment } from "./api";

const TABS = ["Questions", "Submissions", "Review queue"] as const;
type Tab = (typeof TABS)[number];
const sel = "rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm";

const newMcq = (): QuestionIn => ({
  question_type: "mcq", question_text: "New question", points: 1, difficulty: "medium",
  explanation_correct: "", explanation_general: "",
  options: [{ text: "Option A", is_correct: true }, { text: "Option B", is_correct: false }],
});
const newShort = (): QuestionIn => ({
  question_type: "short_answer", question_text: "New question", points: 2, difficulty: "medium",
  rubric: [{ description: "Key idea", points: 1 }, { description: "Correct terminology", points: 1 }],
  model_answer: "",
});

function QuestionEditor({ q, onChange, onRemove }: { q: QuestionIn; onChange: (q: QuestionIn) => void; onRemove: () => void }) {
  const opts = q.options ?? [];
  const rubric = q.rubric ?? [];
  const rubricTotal = rubric.reduce((a, c) => a + c.points, 0);
  const points = q.points ?? 1;
  return (
    <Card>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Badge tone="blue">{q.question_type === "mcq" ? "Multiple choice" : "Short answer"}</Badge>
        <span className="text-xs text-slate-500">{q.key}</span>
        <label className="ml-auto flex items-center gap-1 text-sm">Points
          <input type="number" min={0.5} step={0.5} className={`${sel} w-20`} value={q.points} onChange={(e) => onChange({ ...q, points: Number(e.target.value) })} />
        </label>
        <select className={sel} value={q.difficulty} onChange={(e) => onChange({ ...q, difficulty: e.target.value as QuestionIn["difficulty"] })}>
          <option value="easy">easy</option><option value="medium">medium</option><option value="hard">hard</option>
        </select>
        <Button variant="ghost" aria-label="Remove question" onClick={onRemove}>✕</Button>
      </div>
      <Textarea rows={2} aria-label="Question text" value={q.question_text} onChange={(e) => onChange({ ...q, question_text: e.target.value })} />
      {q.question_type === "mcq" ? (
        <div className="mt-3 space-y-2">
          {opts.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <input type="radio" name={`correct-${q.key}`} aria-label={`Option ${i + 1} is correct`} checked={!!o.is_correct}
                onChange={() => onChange({ ...q, options: opts.map((x, j) => ({ ...x, is_correct: j === i })) })} />
              <Input aria-label={`Option ${i + 1}`} value={o.text} onChange={(e) => onChange({ ...q, options: opts.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} />
              <Button variant="ghost" disabled={opts.length <= 2} onClick={() => onChange({ ...q, options: opts.filter((_, j) => j !== i) })}>✕</Button>
            </div>
          ))}
          {opts.length < 6 && <Button variant="ghost" onClick={() => onChange({ ...q, options: [...opts, { text: "New option", is_correct: false }] })}>+ Option</Button>}
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Explanation when correct"><Textarea rows={2} value={q.explanation_correct ?? ""} onChange={(e) => onChange({ ...q, explanation_correct: e.target.value })} /></Field>
            <Field label="Hint when incorrect"><Textarea rows={2} value={q.explanation_general ?? ""} onChange={(e) => onChange({ ...q, explanation_general: e.target.value })} /></Field>
          </div>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <p className="text-sm font-medium">Rubric <span className={Math.abs(rubricTotal - points) > 1e-6 ? "text-red-700" : "text-slate-500"}>({rubricTotal} of {points} pts)</span></p>
          {rubric.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input aria-label={`Criterion ${i + 1}`} value={c.description} onChange={(e) => onChange({ ...q, rubric: rubric.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)) })} />
              <input type="number" min={0.5} step={0.5} aria-label={`Criterion ${i + 1} points`} className={`${sel} w-20`} value={c.points} onChange={(e) => onChange({ ...q, rubric: rubric.map((x, j) => (j === i ? { ...x, points: Number(e.target.value) } : x)) })} />
              <Button variant="ghost" disabled={rubric.length <= 1} onClick={() => onChange({ ...q, rubric: rubric.filter((_, j) => j !== i) })}>✕</Button>
            </div>
          ))}
          <Button variant="ghost" onClick={() => onChange({ ...q, rubric: [...rubric, { description: "New criterion", points: 1 }] })}>+ Criterion</Button>
          <Field label="Model answer"><Textarea rows={2} value={q.model_answer ?? ""} onChange={(e) => onChange({ ...q, model_answer: e.target.value })} /></Field>
        </div>
      )}
    </Card>
  );
}

function ReviewCard({ item, assessmentId }: { item: ReviewItem; assessmentId: string }) {
  const qc = useQueryClient();
  const [score, setScore] = useState(item.suggested_score ?? 0);
  const [feedback, setFeedback] = useState("");
  const decide = useMutation({
    mutationFn: () => api.post<void>(`/evaluations/${item.evaluation_id}/review`, { final_score: score, teacher_feedback: feedback || null }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["review-queue", assessmentId] });
      void qc.invalidateQueries({ queryKey: ["attempts", assessmentId] });
    },
  });
  return (
    <Card>
      <p className="text-sm text-slate-500">{item.student_name} · {item.question_key}</p>
      <p className="font-medium">{item.question_text}</p>
      <blockquote className="my-2 rounded bg-slate-50 p-2 text-sm">{item.answer_text}</blockquote>
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <p className="font-medium">Rubric</p>
          <ul className="list-disc pl-5">{item.rubric.map((c, i) => <li key={i}>{String(c.description)} ({String(c.points)} pt)</li>)}</ul>
          {item.model_answer && <p className="mt-1 text-slate-600">Model: {item.model_answer}</p>}
        </div>
        <div className="rounded bg-blue-50 p-2">
          <p className="font-medium">AI suggestion (advisory){item.confidence != null && ` · confidence ${Math.round(item.confidence * 100)}%`}</p>
          <p>{item.suggested_score ?? "—"} / {item.points} — {item.feedback ?? "No suggestion available."}</p>
          {item.missing_concepts.length > 0 && <p className="text-slate-600">Missing: {item.missing_concepts.join(", ")}</p>}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <Field label={`Final score (max ${item.points})`}>
          <input type="number" min={0} max={item.points} step={0.5} className={`${sel} w-24`} value={score} onChange={(e) => setScore(Number(e.target.value))} />
        </Field>
        <div className="flex-1"><Field label="Feedback to student (optional)"><Input value={feedback} onChange={(e) => setFeedback(e.target.value)} /></Field></div>
        <Button disabled={decide.isPending} onClick={() => decide.mutate()}>{score === item.suggested_score ? "Accept" : "Override"}</Button>
      </div>
      <ErrorAlert error={decide.error} />
    </Card>
  );
}

export function AssessmentEditorPage() {
  const { assessmentId = "" } = useParams();
  const a = useTeacherAssessment(assessmentId);
  const m = useAssessmentMutations(assessmentId);
  const attempts = useAttempts(assessmentId);
  const queue = useReviewQueue(assessmentId);
  const [tab, setTab] = useState<Tab>("Questions");
  const [content, setContent] = useState<AssessmentContent | null>(null);
  const [dirty, setDirty] = useState(false);
  const [settings, setSettings] = useState({ title: "", passing_score: 60, max_attempts: 3 });

  useEffect(() => {
    if (a.data) {
      setContent(a.data.content);
      setDirty(false);
      setSettings({ title: a.data.title, passing_score: a.data.passing_score, max_attempts: a.data.max_attempts });
    }
  }, [a.data]);

  if (a.isPending || !content) return <Loading />;
  if (a.error) return <ErrorAlert error={a.error} />;
  const d = a.data;
  const qs = content.questions ?? [];
  const edit = (questions: QuestionIn[]) => {
    setContent({ ...content, questions });
    setDirty(true);
  };
  const details = m.questions.error instanceof ApiError ? m.questions.error.details : [];

  return (
    <>
      <Link to={`/teacher/chapters/${d.chapter_id}`} className="text-sm text-accent hover:underline">← Back to chapter</Link>
      <PageHeader title={d.title}>
        {d.origin === "ai" && <Badge tone="blue">AI-generated — review every question</Badge>}
        <Badge>v{d.version}</Badge>
        <Button variant="secondary" disabled={dirty || m.publish.isPending || (!!d.published_version && !d.has_unpublished_changes)} onClick={() => m.publish.mutate()}>Publish v{d.version}</Button>
        {d.published_version && <Button variant="ghost" onClick={() => m.unpublish.mutate()}>Unpublish</Button>}
      </PageHeader>
      <ErrorAlert error={m.publish.error ?? m.settings.error} />
      <div role="tablist" className="mb-4 flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${tab === t ? "border-navy-900" : "border-transparent text-slate-500"}`}>
            {t}{t === "Review queue" && queue.data?.length ? ` (${queue.data.length})` : ""}
          </button>
        ))}
      </div>

      {tab === "Questions" && (
        <div className="space-y-4">
          <Card>
            <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
              <Field label="Title"><Input value={settings.title} onChange={(e) => setSettings({ ...settings, title: e.target.value })} /></Field>
              <Field label="Pass mark %"><input type="number" min={0} max={100} className={`${sel} w-24`} value={settings.passing_score} onChange={(e) => setSettings({ ...settings, passing_score: Number(e.target.value) })} /></Field>
              <Field label="Attempts"><input type="number" min={1} max={20} className={`${sel} w-20`} value={settings.max_attempts} onChange={(e) => setSettings({ ...settings, max_attempts: Number(e.target.value) })} /></Field>
              <Button variant="secondary" onClick={() => m.settings.mutate(settings)}>Save settings</Button>
            </div>
          </Card>
          {qs.length === 0 && <EmptyState title="No questions yet" />}
          {qs.map((q, i) => (
            <QuestionEditor key={q.key ?? i} q={q} onChange={(nq) => edit(qs.map((x, j) => (j === i ? nq : x)))} onRemove={() => edit(qs.filter((_, j) => j !== i))} />
          ))}
          <div className="sticky bottom-0 flex flex-wrap gap-2 bg-surface py-2">
            <Button variant="secondary" onClick={() => edit([...qs, newMcq()])}>+ Multiple choice</Button>
            <Button variant="secondary" onClick={() => edit([...qs, newShort()])}>+ Short answer</Button>
            <Button disabled={!dirty || m.questions.isPending} onClick={() => m.questions.mutate({ expected_version: d.version, content })}>{dirty ? "Save questions" : "Saved"}</Button>
          </div>
          <ErrorAlert error={m.questions.error} />
          {details.map((x, i) => <p key={i} className="text-sm text-red-700">• {String((x as { msg?: string }).msg ?? JSON.stringify(x))}</p>)}
        </div>
      )}

      {tab === "Submissions" && (
        <Card>
          {attempts.isPending && <Loading />}
          {attempts.data?.length === 0 && <EmptyState title="No submissions yet" />}
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-100">
              {attempts.data?.map((r) => (
                <tr key={r.attempt_id}>
                  <td className="py-2">{r.student_name} <span className="text-slate-500">#{r.attempt_number}</span></td>
                  <td>{r.score != null ? `${r.score} / ${r.max_score}` : `≈ ${r.provisional_score ?? 0} / ${r.max_score} (provisional)`}</td>
                  <td>{r.pending_reviews > 0 ? <Badge tone="amber">{r.pending_reviews} to review</Badge> : <Badge tone="green">{r.status}</Badge>}</td>
                  <td className="text-slate-500">{r.submitted_at ? new Date(r.submitted_at).toLocaleString() : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {tab === "Review queue" && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">AI suggestions are advisory. Short-answer scores count only after you accept or override them.</p>
          {queue.isPending && <Loading />}
          {queue.data?.length === 0 && <EmptyState title="Nothing to review" />}
          {queue.data?.map((item) => <ReviewCard key={item.evaluation_id} item={item} assessmentId={assessmentId} />)}
        </div>
      )}
    </>
  );
}
