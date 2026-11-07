/**
 * Student quiz: start screen with past attempts, then one question at a time (progress bar,
 * question map, flag for review, keyboard shortcuts, optional timer), a review screen, submit.
 * Answers are kept per attempt in sessionStorage, so a page reload does not lose them.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";

import { api } from "@/api/client";
import type { AttemptResult, AttemptStart, StudentQuestion } from "@/api/generated/schema";
import { ErrorAlert, Loading } from "@/components/feedback";
import { ListenButton } from "@/features/student/ListenButton";
import { speechPlayer } from "@/features/three-d/library/speech/player";

import { startAttempt, useMyAttempts, useStudentAssessment } from "./api";

type Answer = { selected_option_key?: string; answer_text?: string };
const LETTERS = "ABCDEFGH";
const store = (attemptId: string) => `quiz-attempt:${attemptId}`;

const isAnswered = (q: StudentQuestion, a: Answer | undefined) =>
  q.question_type === "mcq" ? !!a?.selected_option_key : !!a?.answer_text?.trim();

function words(text: string) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function Timer({ endsAt, onEnd }: { endsAt: number; onEnd: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  const ended = useRef(false);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, Math.round((endsAt - now) / 1000));
  useEffect(() => {
    if (left === 0 && !ended.current) {
      ended.current = true;
      onEnd();
    }
  }, [left, onEnd]);
  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");
  return (
    <span className={`qz-pill qz-timer ${left <= 60 ? "qz-pill-red qz-timer-low" : "qz-pill-accent"}`} role="timer" aria-label={`${mm} minutes ${ss} seconds left`}>
      ⏱ {mm}:{ss}
    </span>
  );
}

function StartScreen({ assessmentId, onStarted }: { assessmentId: string; onStarted: (a: AttemptStart) => void }) {
  const a = useStudentAssessment(assessmentId);
  const history = useMyAttempts(assessmentId);
  const start = useMutation({ mutationFn: () => startAttempt(assessmentId), onSuccess: onStarted });
  if (a.isPending) return <Loading />;
  if (a.error) return <ErrorAlert error={a.error} />;
  const q = a.data;
  const left = q.max_attempts - q.attempts_used;
  const minutes = q.settings?.time_limit_minutes;
  const graded = (history.data ?? []).filter((h) => h.score != null);
  const best = graded.length ? Math.max(...graded.map((h) => Math.round(((h.score ?? 0) / Math.max(1, h.max_score)) * 100))) : null;

  return (
    <div className="qz">
      <section className="qz-hero">
        <span className="qz-hero-label">Quiz</span>
        <h1>{q.title}</h1>
        <p>Answer one question at a time. You can flag questions and review everything before you submit.</p>
        <div className="qz-stats">
          <div className="qz-stat"><strong>{q.questions_per_attempt ?? q.question_count}</strong><span>questions</span></div>
          <div className="qz-stat"><strong>{q.passing_score}%</strong><span>to pass</span></div>
          <div className="qz-stat"><strong>{minutes ? `${minutes} min` : "No limit"}</strong><span>time</span></div>
          <div className="qz-stat"><strong>{Math.max(0, left)} / {q.max_attempts}</strong><span>attempts left</span></div>
          {best != null && <div className="qz-stat"><strong>{best}%</strong><span>your best</span></div>}
        </div>
      </section>

      <section className="qz-card qz-start">
        <div>
          <p>
            {left > 0
              ? minutes
                ? `The timer starts when you begin. Your answers are submitted automatically when time runs out.`
                : "Take your time. Your answers are kept if you reload the page."
              : "You have used all your attempts for this quiz."}
          </p>
          <p className="qz-hint">
            Shortcuts: <span className="qz-kbd">A</span>–<span className="qz-kbd">D</span> choose ·{" "}
            <span className="qz-kbd">←</span> <span className="qz-kbd">→</span> move · <span className="qz-kbd">F</span> flag
          </p>
        </div>
        <button type="button" className="qz-btn qz-btn-primary" disabled={start.isPending || left <= 0} onClick={() => start.mutate()}>
          {start.isPending ? "Starting…" : left <= 0 ? "No attempts left" : q.attempts_used > 0 ? "Try again →" : "Start quiz →"}
        </button>
      </section>
      <ErrorAlert error={start.error} />

      {!!history.data?.length && (
        <section className="qz-card">
          <h2 style={{ margin: 0, fontSize: "var(--fs-lg)" }}>Your attempts</h2>
          <ul className="qz-history">
            {history.data.map((h) => {
              const pct = h.score != null ? Math.round((h.score / Math.max(1, h.max_score)) * 100) : null;
              return (
                <li key={h.attempt_id}>
                  <Link to={`/student/attempts/${h.attempt_id}`}>
                    <strong>#{h.attempt_number}</strong>
                    {pct != null ? (
                      <div className={`qz-bar ${pct >= q.passing_score ? "qz-bar-pass" : ""}`} aria-hidden><span style={{ width: `${pct}%` }} /></div>
                    ) : (
                      <span className="qz-pill qz-pill-amber">Awaiting teacher review</span>
                    )}
                    <span className="qz-pill">{h.score != null ? `${h.score}/${h.max_score} · ${pct}%` : "View"} →</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

function TakeQuiz({ attempt, assessmentId }: { attempt: AttemptStart; assessmentId: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const questions = attempt.assessment.questions;
  const settings = attempt.assessment.settings ?? {};
  const allowBack = settings.allow_back !== false;
  const saved = useMemo(() => {
    try {
      return JSON.parse(sessionStorage.getItem(store(attempt.attempt_id)) ?? "null") as {
        answers: Record<string, Answer>; flags: string[]; index: number; endsAt?: number;
      } | null;
    } catch {
      return null;
    }
  }, [attempt.attempt_id]);
  const [answers, setAnswers] = useState<Record<string, Answer>>(saved?.answers ?? {});
  const [flags, setFlags] = useState<Set<string>>(new Set(saved?.flags ?? []));
  const [index, setIndex] = useState(saved?.index ?? 0); // questions.length = review screen
  useEffect(() => () => speechPlayer.stop(), [index]); // a new question: stop reading the old one
  const [furthest, setFurthest] = useState(saved?.index ?? 0);
  const [endsAt] = useState<number | undefined>(
    () => saved?.endsAt ?? (settings.time_limit_minutes ? Date.now() + settings.time_limit_minutes * 60_000 : undefined),
  );
  useEffect(() => {
    sessionStorage.setItem(store(attempt.attempt_id), JSON.stringify({ answers, flags: [...flags], index, endsAt }));
  }, [answers, flags, index, endsAt, attempt.attempt_id]);

  const submit = useMutation({
    mutationFn: () =>
      api.post<AttemptResult>(`/attempts/${attempt.attempt_id}/submit`, {
        answers: Object.entries(answers).map(([question_key, v]) => ({ question_key, ...v })),
      }),
    onSuccess: (r) => {
      sessionStorage.removeItem(store(attempt.attempt_id));
      void qc.invalidateQueries({ queryKey: ["my-attempts", assessmentId] });
      void qc.invalidateQueries({ queryKey: ["assessment", assessmentId] });
      void qc.invalidateQueries({ queryKey: ["my-insights"] });
      navigate(`/student/attempts/${r.attempt_id}`, { state: { justSubmitted: true } });
    },
  });
  const timeUp = useCallback(() => {
    if (!submit.isPending && !submit.isSuccess) submit.mutate();
  }, [submit]);

  const total = questions.length;
  const reviewing = index >= total;
  const q = questions[Math.min(index, total - 1)];
  const answeredCount = questions.filter((x) => isAnswered(x, answers[x.key])).length;
  const go = (i: number) => {
    const next = Math.max(0, Math.min(total, i));
    if (next < index && !allowBack) return;
    setIndex(next);
    setFurthest((f) => Math.max(f, next));
  };
  const choose = (key: string) => q && setAnswers((s) => ({ ...s, [q.key]: { selected_option_key: key } }));
  const toggleFlag = () =>
    q && setFlags((f) => {
      const n = new Set(f);
      if (n.has(q.key)) n.delete(q.key);
      else n.add(q.key);
      return n;
    });

  // keyboard: A-H / 1-8 choose, arrows move, F flags (not while typing)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement | null)?.closest("textarea, input");
      if (typing || e.metaKey || e.ctrlKey || e.altKey || reviewing || !q) return;
      const k = e.key.toUpperCase();
      if (k === "ARROWRIGHT") go(index + 1);
      else if (k === "ARROWLEFT") go(index - 1);
      else if (k === "F") toggleFlag();
      else if (q.question_type === "mcq") {
        const i = /^[1-8]$/.test(k) ? Number(k) - 1 : LETTERS.indexOf(k);
        const opt = i >= 0 ? q.options[i] : undefined;
        if (opt) choose(opt.key);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const progress = Math.round((answeredCount / Math.max(1, total)) * 100);
  const missing = total - answeredCount;

  return (
    <div className="qz">
      <div className="qz-top">
        <div className="qz-top-row">
          <strong>{attempt.assessment.title}</strong>
          <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
            <span className="qz-pill">Attempt {attempt.attempt_number}</span>
            <span className="qz-pill qz-pill-accent">{answeredCount}/{total} answered</span>
            {endsAt && <Timer endsAt={endsAt} onEnd={timeUp} />}
          </span>
        </div>
        <div className="qz-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label="Answered">
          <span style={{ width: `${progress}%` }} />
        </div>
        <nav className="qz-map" aria-label="Questions">
          {questions.map((x, i) => (
            <button
              key={x.key}
              type="button"
              className={`qz-dot ${isAnswered(x, answers[x.key]) ? "qz-dot-answered" : ""} ${i === index ? "qz-dot-current" : ""} ${flags.has(x.key) ? "qz-dot-flag" : ""}`}
              disabled={!allowBack && i < index}
              aria-current={i === index ? "step" : undefined}
              aria-label={`Question ${i + 1}${isAnswered(x, answers[x.key]) ? ", answered" : ""}${flags.has(x.key) ? ", flagged" : ""}`}
              onClick={() => go(i)}
            >
              {i + 1}
            </button>
          ))}
          <button
            type="button"
            className={`qz-dot ${reviewing ? "qz-dot-current" : ""}`}
            style={{ width: "auto", padding: "0 10px" }}
            disabled={furthest < total - 1 && !reviewing && answeredCount < total}
            onClick={() => go(total)}
          >
            Review
          </button>
        </nav>
      </div>

      {!reviewing && q ? (
        <section className="qz-card qz-question" key={q.key} aria-labelledby={`q-${q.key}`}>
          <div className="qz-question-meta">
            <span className="qz-pill qz-pill-accent">Question {index + 1} of {total}</span>
            <span className="qz-pill">{q.points} {q.points === 1 ? "point" : "points"}</span>
            <span className="qz-pill">{q.question_type === "mcq" ? "Choose one" : "Written answer"}</span>
            <ListenButton
              id={`quiz:${assessmentId}:${q.key}`}
              compact
              label="Read question"
              texts={[
                `Question ${index + 1}. ${q.question_text}` +
                  (q.question_type === "mcq" ? " " + q.options.map((o, i) => `Option ${LETTERS[i]}: ${o.text}.`).join(" ") : ""),
              ]}
            />
            <button type="button" className={`qz-pill ${flags.has(q.key) ? "qz-pill-amber" : ""}`} style={{ marginLeft: "auto", border: 0, cursor: "pointer" }} onClick={toggleFlag} aria-pressed={flags.has(q.key)}>
              ⚑ {flags.has(q.key) ? "Flagged" : "Flag for review"}
            </button>
          </div>
          <h2 id={`q-${q.key}`}>{q.question_text}</h2>

          {q.question_type === "mcq" ? (
            <div className="qz-options" role="radiogroup" aria-labelledby={`q-${q.key}`}>
              {q.options.map((o, i) => {
                const selected = answers[q.key]?.selected_option_key === o.key;
                return (
                  <button
                    key={o.key}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className={`qz-option ${selected ? "qz-option-selected" : ""}`}
                    onClick={() => choose(o.key)}
                  >
                    <span className="qz-option-key">{LETTERS[i]}</span>
                    <span>{o.text}</span>
                    <span className="qz-option-check" aria-hidden />
                  </button>
                );
              })}
            </div>
          ) : (
            <>
              <textarea
                className="qz-textarea"
                aria-label={`Answer to question ${index + 1}`}
                maxLength={5000}
                placeholder="Write your answer in your own words…"
                value={answers[q.key]?.answer_text ?? ""}
                onChange={(e) => setAnswers((s) => ({ ...s, [q.key]: { answer_text: e.target.value } }))}
              />
              <p className="qz-hint">{words(answers[q.key]?.answer_text ?? "")} words · your teacher reviews written answers</p>
            </>
          )}

          <div className="qz-nav">
            <button type="button" className="qz-btn qz-btn-ghost" disabled={index === 0 || !allowBack} onClick={() => go(index - 1)}>← Previous</button>
            <button type="button" className="qz-btn qz-btn-primary" onClick={() => go(index + 1)}>
              {index === total - 1 ? "Review answers →" : isAnswered(q, answers[q.key]) ? "Next →" : "Skip →"}
            </button>
          </div>
        </section>
      ) : (
        <section className="qz-card qz-question" aria-labelledby="qz-review">
          <h2 id="qz-review" style={{ marginBottom: 6 }}>Ready to submit?</h2>
          <p className="qz-hint" style={{ marginTop: 0 }}>
            {missing === 0
              ? "You answered every question. Check any flagged ones, then submit."
              : `${missing} question${missing === 1 ? " is" : "s are"} not answered yet. Unanswered questions score 0.`}
          </p>
          <div className="qz-review-grid">
            {questions.map((x, i) => {
              const done = isAnswered(x, answers[x.key]);
              const a = answers[x.key];
              const label =
                x.question_type === "mcq"
                  ? (() => {
                      const oi = x.options.findIndex((o) => o.key === a?.selected_option_key);
                      return oi >= 0 ? `${LETTERS[oi]}. ${x.options[oi]?.text ?? ""}` : "Not answered";
                    })()
                  : a?.answer_text?.trim()
                    ? `${words(a.answer_text)} words`
                    : "Not answered";
              return (
                <button key={x.key} type="button" className={`qz-review-item ${done ? "" : "qz-review-item-missing"}`} disabled={!allowBack} onClick={() => go(i)}>
                  <span style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
                    <strong>Question {i + 1}</strong>
                    {flags.has(x.key) && <span className="qz-pill qz-pill-amber">⚑</span>}
                  </span>
                  <span style={{ color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
                </button>
              );
            })}
          </div>
          <div className="qz-nav">
            <button type="button" className="qz-btn qz-btn-ghost" disabled={!allowBack} onClick={() => go(total - 1)}>← Back to questions</button>
            <button type="button" className="qz-btn qz-btn-primary" disabled={submit.isPending} onClick={() => submit.mutate()}>
              {submit.isPending ? "Submitting…" : "Submit answers ✓"}
            </button>
          </div>
          <ErrorAlert error={submit.error} />
        </section>
      )}
    </div>
  );
}

export function QuizPage() {
  const { assessmentId = "" } = useParams();
  const [attempt, setAttempt] = useState<AttemptStart | null>(null);
  return attempt ? (
    <TakeQuiz key={attempt.attempt_id} attempt={attempt} assessmentId={assessmentId} />
  ) : (
    <StartScreen assessmentId={assessmentId} onStarted={setAttempt} />
  );
}
