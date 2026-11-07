import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";

import type { AnswerResult } from "@/api/generated/schema";
import { ErrorAlert, Loading } from "@/components/feedback";
import { Badge, Button, Card, PageHeader } from "@/components/ui";
import { JobStatusLine } from "@/features/jobs/JobStatus";
import { useJob } from "@/features/jobs/useJob";

import { explainFurther, useAttempt } from "./api";

interface Explain {
  explanation: string;
  revision?: { lesson_id: string; lesson_title: string; section_title: string | null } | null;
}

function ExplainFurther({ answer, attemptId }: { answer: AnswerResult; attemptId: string }) {
  const qc = useQueryClient();
  const [jobId, setJobId] = useState<string | null>(null);
  const job = useJob(jobId);
  const start = useMutation({ mutationFn: () => explainFurther(answer.answer_id), onSuccess: (j) => setJobId(j.id) });
  useEffect(() => {
    if (job.data?.status === "completed") void qc.invalidateQueries({ queryKey: ["attempt", attemptId] });
  }, [job.data?.status, attemptId, qc]);
  const ef = answer.explain_further as Explain | null;
  if (ef)
    return (
      <div className="mt-3 rounded-md bg-amber-50 p-3 text-sm">
        <p className="font-medium">Explain further</p>
        <p className="mt-1">{ef.explanation}</p>
        {ef.revision && (
          <Link className="mt-2 inline-block text-accent underline" to={`/student/lessons/${ef.revision.lesson_id}`}>
            Revise: {ef.revision.lesson_title}{ef.revision.section_title ? ` → ${ef.revision.section_title}` : ""}
          </Link>
        )}
      </div>
    );
  return (
    <div className="mt-2">
      <Button variant="secondary" disabled={start.isPending || !!jobId} onClick={() => start.mutate()}>Explain further</Button>
      <JobStatusLine job={job.data?.status === "completed" ? undefined : job.data} label="" />
      <ErrorAlert error={start.error} />
    </div>
  );
}

export function AttemptResultPage() {
  const { attemptId = "" } = useParams();
  const r = useAttempt(attemptId);
  if (r.isPending) return <Loading />;
  if (r.error) return <ErrorAlert error={r.error} />;
  const d = r.data;
  return (
    <>
      <PageHeader title={`${d.assessment_title} — attempt ${d.attempt_number}`}>
        <Link to={`/student/assessments/${d.assessment_id}`} className="text-sm text-accent underline">Back to quiz</Link>
      </PageHeader>
      <Card className="mb-4">
        {d.score != null ? (
          <p className="text-lg">Score: <strong>{d.score} / {d.max_score}</strong> {d.passed ? <Badge tone="green">passed</Badge> : <Badge tone="amber">not passed yet</Badge>}</p>
        ) : (
          <p>Provisional score ≈ {d.provisional_score ?? 0} / {d.max_score}. <Badge tone="amber">Your teacher will confirm written answers</Badge></p>
        )}
      </Card>
      <div className="space-y-4">
        {d.answers.map((a, i) => {
          const wrong = a.question_type === "mcq" ? a.is_correct === false : (a.final_score ?? a.ai_suggested_score ?? 0) < a.points;
          return (
            <Card key={a.answer_id}>
              <p className="font-medium">{i + 1}. {a.question_text}</p>
              {a.question_type === "mcq" ? (
                <p className="mt-1 text-sm">{a.is_correct ? <Badge tone="green">Correct</Badge> : <Badge tone="red">Incorrect</Badge>} {a.explanation}</p>
              ) : (
                <div className="mt-1 space-y-1 text-sm">
                  <blockquote className="rounded bg-slate-50 p-2">{a.answer_text ?? "(no answer)"}</blockquote>
                  {a.final_score != null ? (
                    <p><Badge tone="green">Teacher score {a.final_score}/{a.points}</Badge> {a.teacher_feedback}</p>
                  ) : (
                    a.ai_feedback && <p><Badge tone="blue">Provisional AI feedback</Badge> {a.ai_feedback}</p>
                  )}
                </div>
              )}
              {wrong && d.status !== "in_progress" && <ExplainFurther answer={a} attemptId={attemptId} />}
            </Card>
          );
        })}
      </div>
    </>
  );
}
