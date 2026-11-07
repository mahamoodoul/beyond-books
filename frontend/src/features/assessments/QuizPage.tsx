import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";

import { api } from "@/api/client";
import type { AttemptResult, AttemptStart } from "@/api/generated/schema";
import { ErrorAlert, Loading } from "@/components/feedback";
import { Badge, Button, Card, PageHeader, Textarea } from "@/components/ui";

import { startAttempt, useMyAttempts, useStudentAssessment } from "./api";

export function QuizPage() {
  const { assessmentId = "" } = useParams();
  const a = useStudentAssessment(assessmentId);
  const history = useMyAttempts(assessmentId);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [attempt, setAttempt] = useState<AttemptStart | null>(null);
  const [answers, setAnswers] = useState<Record<string, { selected_option_key?: string; answer_text?: string }>>({});
  const start = useMutation({ mutationFn: () => startAttempt(assessmentId), onSuccess: setAttempt });
  const submit = useMutation({
    mutationFn: () =>
      api.post<AttemptResult>(`/attempts/${attempt?.attempt_id}/submit`, {
        answers: Object.entries(answers).map(([question_key, v]) => ({ question_key, ...v })),
      }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ["my-attempts", assessmentId] });
      void qc.invalidateQueries({ queryKey: ["assessment", assessmentId] });
      void qc.invalidateQueries({ queryKey: ["my-insights"] });
      navigate(`/student/attempts/${r.attempt_id}`);
    },
  });

  if (a.isPending) return <Loading />;
  if (a.error) return <ErrorAlert error={a.error} />;
  const q = a.data;
  const left = q.max_attempts - q.attempts_used;

  if (!attempt) {
    return (
      <>
        <PageHeader title={q.title} />
        <Card>
          <p>{q.question_count} questions · {q.max_score} points · pass mark {q.passing_score}%</p>
          <p className="text-sm text-slate-500">Attempts used: {q.attempts_used} of {q.max_attempts}</p>
          <Button className="mt-3" disabled={start.isPending || left <= 0} onClick={() => start.mutate()}>{left > 0 ? "Start" : "No attempts left"}</Button>
          <ErrorAlert error={start.error} />
        </Card>
        {!!history.data?.length && (
          <Card className="mt-4">
            <h2 className="mb-2 font-semibold">Your attempts</h2>
            <ul className="space-y-1 text-sm">
              {history.data.map((h) => (
                <li key={h.attempt_id}>
                  <Link className="underline" to={`/student/attempts/${h.attempt_id}`}>Attempt {h.attempt_number}</Link>{" "}
                  {h.score != null ? `${h.score}/${h.max_score}` : <Badge tone="amber">awaiting teacher review</Badge>}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </>
    );
  }

  return (
    <>
      <PageHeader title={`${q.title} — attempt ${attempt.attempt_number}`} />
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit.mutate(); }}>
        {attempt.assessment.questions.map((question, i) => (
          <Card key={question.key}>
            <fieldset>
              <legend className="mb-2 font-medium">{i + 1}. {question.question_text} <span className="text-sm font-normal text-slate-500">({question.points} pt)</span></legend>
              {question.question_type === "mcq" ? (
                <div className="space-y-1">
                  {question.options.map((o) => (
                    <label key={o.key} className="flex items-center gap-2 rounded px-2 py-1 hover:bg-slate-50">
                      <input type="radio" name={question.key} checked={answers[question.key]?.selected_option_key === o.key}
                        onChange={() => setAnswers({ ...answers, [question.key]: { selected_option_key: o.key } })} />
                      {o.text}
                    </label>
                  ))}
                </div>
              ) : (
                <Textarea rows={4} aria-label={`Answer to question ${i + 1}`} maxLength={5000} value={answers[question.key]?.answer_text ?? ""}
                  onChange={(e) => setAnswers({ ...answers, [question.key]: { answer_text: e.target.value } })} />
              )}
            </fieldset>
          </Card>
        ))}
        <Button type="submit" disabled={submit.isPending}>{submit.isPending ? "Submitting…" : "Submit answers"}</Button>
        <ErrorAlert error={submit.error} />
      </form>
    </>
  );
}
