/**
 * Student quiz result: animated score ring, a little celebration on a pass, per-question review
 * (your answer vs the correct one, explanation), filters, "Explain further" with revision links,
 * and "Try again" while attempts remain.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router";

import type { AnswerResult } from "@/api/generated/schema";
import { ErrorAlert, Loading } from "@/components/feedback";
import { JobStatusLine } from "@/features/jobs/JobStatus";
import { useJob } from "@/features/jobs/useJob";

import { explainFurther, useAttempt, useStudentAssessment } from "./api";

interface Explain {
  explanation: string;
  revision?: { lesson_id: string; lesson_title: string; section_title: string | null } | null;
}
type Verdict = "right" | "wrong" | "pending" | "partial";
type Filter = "all" | "wrong" | "right" | "pending";
const LETTERS = "ABCDEFGH";

function verdictOf(a: AnswerResult): Verdict {
  if (a.question_type === "mcq") return a.is_correct ? "right" : "wrong";
  const score = a.final_score ?? null;
  if (score == null) return "pending";
  return score >= a.points ? "right" : score > 0 ? "partial" : "wrong";
}

function ScoreRing({ percent, pass }: { percent: number; pass: boolean }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const t = requestAnimationFrame(() => setShown(percent));
    return () => cancelAnimationFrame(t);
  }, [percent]);
  const r = 62;
  const c = 2 * Math.PI * r;
  return (
    <div className={`qz-ring ${pass ? "qz-ring-pass" : ""}`} role="img" aria-label={`Score ${percent} percent`}>
      <svg viewBox="0 0 150 150">
        <circle className="qz-ring-track" cx="75" cy="75" r={r} />
        <circle className="qz-ring-value" cx="75" cy="75" r={r} strokeDasharray={c} strokeDashoffset={c * (1 - shown / 100)} />
      </svg>
      <div className="qz-ring-label">
        <strong>{percent}%</strong>
        <span>score</span>
      </div>
    </div>
  );
}

function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 70 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.8,
        color: ["#6154c8", "#28694f", "#e1a23b", "#5fb3c9", "#c75b8a"][i % 5],
        rotate: Math.random() * 360,
      })),
    [],
  );
  return (
    <div className="qz-confetti" aria-hidden>
      {pieces.map((p, i) => (
        <i key={i} style={{ left: `${p.left}%`, background: p.color, animationDelay: `${p.delay}s`, transform: `rotate(${p.rotate}deg)` }} />
      ))}
    </div>
  );
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
      <div className="qz-explain" style={{ background: "var(--accent-soft)" }}>
        <strong>💡 Let's go over it</strong>
        <p style={{ margin: "6px 0 0" }}>{ef.explanation}</p>
        {ef.revision && (
          <Link className="qz-btn qz-btn-ghost" style={{ marginTop: 10, minHeight: 36 }} to={`/student/lessons/${ef.revision.lesson_id}`}>
            📖 Revise: {ef.revision.lesson_title}{ef.revision.section_title ? ` → ${ef.revision.section_title}` : ""}
          </Link>
        )}
      </div>
    );
  const running = start.isPending || (!!jobId && job.data?.status !== "failed");
  return (
    <div style={{ marginTop: 12 }}>
      <button type="button" className="qz-btn qz-btn-ghost" style={{ minHeight: 38 }} disabled={running} onClick={() => start.mutate()}>
        {running ? "Explaining…" : "💡 Explain this to me"}
      </button>
      <JobStatusLine job={job.data?.status === "completed" ? undefined : job.data} label="" />
      <ErrorAlert error={start.error} />
    </div>
  );
}

export function AttemptResultPage() {
  const { attemptId = "" } = useParams();
  const location = useLocation();
  const r = useAttempt(attemptId);
  const quiz = useStudentAssessment(r.data?.assessment_id ?? "");
  const [filter, setFilter] = useState<Filter>("all");
  const justSubmitted = !!(location.state as { justSubmitted?: boolean } | null)?.justSubmitted;

  if (r.isPending) return <Loading />;
  if (r.error) return <ErrorAlert error={r.error} />;
  const d = r.data;
  const score = d.score ?? d.provisional_score ?? 0;
  const percent = Math.round((score / Math.max(1, d.max_score)) * 100);
  const final = d.score != null;
  const pass = final ? !!d.passed : percent >= d.passing_score;
  const verdicts = d.answers.map(verdictOf);
  const count = (v: Verdict) => verdicts.filter((x) => x === v).length;
  const optionsByQuestion = new Map((quiz.data?.questions ?? []).map((q) => [q.key, q.options]));
  const left = quiz.data ? quiz.data.max_attempts - quiz.data.attempts_used : 0;
  const shown = d.answers
    .map((a, i) => ({ a, i, v: verdicts[i] as Verdict }))
    .filter(({ v }) => filter === "all" || (filter === "wrong" ? v === "wrong" || v === "partial" : v === filter));
  const firstRevision = d.answers.find((a) => verdictOf(a) !== "right" && a.lesson_id)?.lesson_id;

  return (
    <div className="qz">
      {justSubmitted && pass && <Confetti />}
      <section className="qz-card qz-result-hero">
        <ScoreRing percent={percent} pass={pass} />
        <div>
          <span className={`qz-pill ${pass ? "qz-pill-green" : "qz-pill-amber"}`}>
            {final ? (pass ? "✓ Passed" : "Not passed yet") : "Provisional"} · pass mark {d.passing_score}%
          </span>
          <h1 className="qz-result-title">
            {pass ? (percent === 100 ? "Perfect score! 🎉" : "Great work! 🎉") : percent >= d.passing_score / 2 ? "Nearly there 💪" : "Keep going 🌱"}
          </h1>
          <p className="qz-result-sub">
            {d.assessment_title} · attempt {d.attempt_number} · {score} / {d.max_score} points
            {!final && " (your teacher will confirm written answers)"}
          </p>
          <div className="qz-chips">
            <span className="qz-pill qz-pill-green">✓ {count("right")} correct</span>
            {count("partial") > 0 && <span className="qz-pill qz-pill-amber">◐ {count("partial")} partly right</span>}
            <span className="qz-pill qz-pill-red">✗ {count("wrong")} to review</span>
            {count("pending") > 0 && <span className="qz-pill qz-pill-amber">⏳ {count("pending")} awaiting teacher</span>}
          </div>
          <div className="qz-actions">
            {left > 0 && (
              <Link className="qz-btn qz-btn-primary" to={`/student/assessments/${d.assessment_id}`}>↻ Try again ({left} left)</Link>
            )}
            {firstRevision && (
              <Link className="qz-btn qz-btn-ghost" to={`/student/lessons/${firstRevision}`}>📖 Revise the lesson</Link>
            )}
            <Link className="qz-btn qz-btn-ghost" to={`/student/assessments/${d.assessment_id}`}>All attempts</Link>
          </div>
        </div>
      </section>

      <div className="qz-filter" role="group" aria-label="Show questions">
        {(
          [
            ["all", `All (${d.answers.length})`],
            ["wrong", `To review (${count("wrong") + count("partial")})`],
            ["right", `Correct (${count("right")})`],
            ...(count("pending") ? [["pending", `Awaiting teacher (${count("pending")})`]] : []),
          ] as [Filter, string][]
        ).map(([k, label]) => (
          <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>{label}</button>
        ))}
      </div>

      {shown.length === 0 && <p className="qz-hint">Nothing here. 🎯</p>}
      {shown.map(({ a, i, v }) => {
        const options = optionsByQuestion.get(a.question_key) ?? [];
        const optionLabel = (key: string | null | undefined) => {
          const oi = options.findIndex((o) => o.key === key);
          return oi >= 0 ? `${LETTERS[oi]}. ${options[oi]?.text ?? ""}` : key ? "Your choice" : "No answer";
        };
        return (
          <article key={a.answer_id} className={`qz-card qz-answer qz-answer-${v === "partial" ? "pending" : v}`} style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
            <div className="qz-question-meta" style={{ marginBottom: 0 }}>
              <span className="qz-pill">Question {i + 1}</span>
              {v === "right" && <span className="qz-pill qz-pill-green">✓ Correct</span>}
              {v === "wrong" && <span className="qz-pill qz-pill-red">✗ Incorrect</span>}
              {v === "partial" && <span className="qz-pill qz-pill-amber">◐ Partly right</span>}
              {v === "pending" && <span className="qz-pill qz-pill-amber">⏳ Awaiting teacher</span>}
              <span className="qz-pill" style={{ marginLeft: "auto" }}>
                {a.question_type === "mcq" ? (a.auto_score ?? 0) : (a.final_score ?? a.ai_suggested_score ?? "–")} / {a.points} pt
              </span>
            </div>
            <h3>{a.question_text}</h3>

            {a.question_type === "mcq" ? (
              <>
                {a.is_correct ? (
                  <div className="qz-choice qz-choice-correct">✓ {optionLabel(a.selected_option_key)}</div>
                ) : (
                  <>
                    <div className={`qz-choice ${a.selected_option_key ? "qz-choice-wrong" : ""}`}>
                      {a.selected_option_key ? "✗" : "–"} {optionLabel(a.selected_option_key)}
                    </div>
                    {a.correct_option_key && <div className="qz-choice qz-choice-correct">✓ {optionLabel(a.correct_option_key)}</div>}
                  </>
                )}
                {a.explanation && <p className="qz-explain"><strong>Why: </strong>{a.explanation}</p>}
              </>
            ) : (
              <>
                <p className="qz-quote">{a.answer_text?.trim() || "(no answer)"}</p>
                {a.final_score != null ? (
                  a.teacher_feedback && <p className="qz-explain"><strong>Teacher feedback: </strong>{a.teacher_feedback}</p>
                ) : (
                  a.ai_feedback && <p className="qz-explain"><strong>Early feedback (score may change after teacher review): </strong>{a.ai_feedback}</p>
                )}
                {!!a.missing_concepts?.length && (
                  <div className="qz-chips" style={{ marginTop: 10 }}>
                    <span className="qz-hint" style={{ margin: 0 }}>Missing ideas:</span>
                    {a.missing_concepts.map((m) => <span key={m} className="qz-pill qz-pill-amber">{m}</span>)}
                  </div>
                )}
              </>
            )}
            {(v === "wrong" || v === "partial") && d.status !== "in_progress" && <ExplainFurther answer={a} attemptId={attemptId} />}
          </article>
        );
      })}
    </div>
  );
}
