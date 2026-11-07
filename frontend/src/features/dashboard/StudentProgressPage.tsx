/**
 * Student "My progress": overall ring and totals across courses, "continue where you left off",
 * and per course a chapter map (expand to lessons), skill mastery with filters and "Revise next".
 * Only real server data (lesson progress, quiz evidence); nothing invented.
 */
import { useQueries } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";

import { api } from "@/api/client";
import type { CourseOutline, CourseProgressSummary, ObjectiveMastery, StudentInsights } from "@/api/generated/schema";
import { ErrorAlert, Loading } from "@/components/feedback";
import { useMyProgress } from "@/features/student/api";

import { timeAgo } from "./format";

type Skill = "mastered" | "developing" | "gap";
const SKILLS: { key: Skill; label: string; color: string }[] = [
  { key: "mastered", label: "Mastered", color: "var(--mint)" },
  { key: "developing", label: "Developing", color: "var(--amber)" },
  { key: "gap", label: "Needs work", color: "var(--red)" },
];
const pct = (done: number, total: number) => (total ? Math.round((done / total) * 100) : 0);

function Ring({ value, size = 120, stroke = 11, label }: { value: number; size?: number; stroke?: number; label: string }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const t = requestAnimationFrame(() => setShown(value));
    return () => cancelAnimationFrame(t);
  }, [value]);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className={`pg-ring ${value >= 100 ? "pg-ring-done" : ""}`} style={{ width: size, height: size }} role="img" aria-label={`${label}: ${value}%`}>
      <svg viewBox={`0 0 ${size} ${size}`}>
        <circle className="pg-ring-track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} />
        <circle className="pg-ring-value" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} strokeDasharray={c} strokeDashoffset={c * (1 - shown / 100)} />
      </svg>
      <div className="pg-ring-label">
        <strong style={{ fontSize: size / 4.2 }}>{value}%</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}

function ChapterMap({ outline }: { outline: CourseOutline }) {
  const chapters = outline.chapters.filter((c) => c.lessons.length > 0);
  const current = chapters.find((c) => c.lessons.some((l) => l.progress !== "completed"));
  const [open, setOpen] = useState<string | null>(current?.id ?? null);
  if (!chapters.length) return <p className="pg-empty">No lessons published yet.</p>;
  return (
    <div className="pg-chapters">
      {chapters.map((ch) => {
        const done = ch.lessons.filter((l) => l.progress === "completed").length;
        const state = done === ch.lessons.length ? "done" : ch.lessons.some((l) => l.progress !== "not_started") ? "active" : "";
        const isOpen = open === ch.id;
        return (
          <div key={ch.id} className={`pg-chapter ${state ? `pg-chapter-${state}` : ""}`} data-open={isOpen}>
            <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : ch.id)}>
              <span className="pg-chapter-num">{state === "done" ? "✓" : ch.position}</span>
              <span className="pg-chapter-title">
                <strong>{ch.title}</strong>
                <span className="pg-dots" aria-label={`${done} of ${ch.lessons.length} lessons complete`}>
                  {ch.lessons.map((l) => <i key={l.id} className={`pg-dot pg-dot-${l.progress}`} />)}
                </span>
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--muted)", fontSize: "var(--fs-sm)" }}>
                {done}/{ch.lessons.length}
                <span className="pg-chevron" aria-hidden>›</span>
              </span>
            </button>
            {isOpen && (
              <ul className="pg-lessons">
                {ch.lessons.map((l) => (
                  <li key={l.id}>
                    <Link to={`/student/lessons/${l.id}`}>
                      <span className={`pg-status pg-status-${l.progress}`} aria-hidden>{l.progress === "completed" ? "✓" : ""}</span>
                      <span style={{ flex: 1 }}>{l.title}</span>
                      <small style={{ color: "var(--muted)" }}>
                        {l.progress === "completed" ? "Done" : l.progress === "in_progress" ? "In progress" : "Start →"}
                        {l.scene_count ? ` · 3D` : ""}
                      </small>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Skills({ insights }: { insights: StudentInsights | undefined }) {
  const [filter, setFilter] = useState<Skill | "all">("all");
  const objectives = (insights?.objectives ?? []).filter((o): o is ObjectiveMastery & { status: Skill } => o.status !== "no_evidence");
  const counts = Object.fromEntries(SKILLS.map((s) => [s.key, objectives.filter((o) => o.status === s.key).length])) as Record<Skill, number>;
  const shown = objectives
    .filter((o) => filter === "all" || o.status === filter)
    .sort((a, b) => (a.mastery ?? 0) - (b.mastery ?? 0));
  return (
    <section className="pg-card">
      <h2>Skills</h2>
      <p className="pg-sub">From your quiz answers, per learning objective.</p>
      {!objectives.length ? (
        <p className="pg-empty" style={{ marginTop: 14 }}>Take a quiz to see which skills you have mastered. 🎯</p>
      ) : (
        <>
          <div className="pg-mastery" aria-hidden>
            {SKILLS.map((s) => counts[s.key] > 0 && <span key={s.key} style={{ width: `${(counts[s.key] / objectives.length) * 100}%`, background: s.color }} />)}
          </div>
          <div className="pg-legend">
            {SKILLS.map((s) => <span key={s.key}><i style={{ background: s.color }} />{counts[s.key]} {s.label.toLowerCase()}</span>)}
          </div>
          <div className="pg-filter" role="group" aria-label="Show skills">
            <button type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>All ({objectives.length})</button>
            {SKILLS.map((s) => counts[s.key] > 0 && (
              <button key={s.key} type="button" aria-pressed={filter === s.key} onClick={() => setFilter(s.key)}>{s.label} ({counts[s.key]})</button>
            ))}
          </div>
          <ul className="pg-skills">
            {shown.map((o) => {
              const m = Math.round((o.mastery ?? 0) * 100);
              return (
                <li key={o.objective_id} className={`pg-skill pg-skill-${o.status}`}>
                  <div className="pg-skill-top">
                    <span>{o.text}</span>
                    <span className={`pg-chip pg-chip-${o.status}`}>{m}%</span>
                  </div>
                  <div className="pg-bar"><span style={{ width: `${m}%` }} /></div>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {!!insights?.recommendations.length && (
        <>
          <h2 style={{ marginTop: 22, fontSize: 17 }}>Revise next</h2>
          <div className="pg-revise">
            {insights.recommendations.map((r) => (
              <Link key={r.lesson_id} to={`/student/lessons/${r.lesson_id}`}>
                <span aria-hidden>📖</span>
                <span><strong>{r.lesson_title}</strong><small>{r.reason}</small></span>
                <span aria-hidden style={{ color: "var(--accent)" }}>→</span>
              </Link>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

export function StudentProgressPage() {
  const q = useMyProgress();
  const courses = useMemo(() => q.data ?? [], [q.data]);
  const outlines = useQueries({
    queries: courses.map((c) => ({ queryKey: ["outline", c.course_id], queryFn: () => api.get<CourseOutline>(`/courses/${c.course_id}/outline`) })),
  });
  const insights = useQueries({
    queries: courses.map((c) => ({ queryKey: ["my-insights", c.course_id], queryFn: () => api.get<StudentInsights>(`/courses/${c.course_id}/my-insights`) })),
  });
  const recent = useMemo(
    () => [...courses].sort((a, b) => (Date.parse(b.last_activity_at ?? "") || 0) - (Date.parse(a.last_activity_at ?? "") || 0))[0] as CourseProgressSummary | undefined,
    [courses],
  );
  const [selected, setSelected] = useState<string | null>(null);

  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorAlert error={q.error} />;

  if (!courses.length) {
    return (
      <div className="pg">
        <section className="pg-hero" style={{ gridTemplateColumns: "1fr" }}>
          <div>
            <span className="pg-eyebrow">Your learning journey</span>
            <h1>Your progress will show up here.</h1>
            <p>Once your teacher enrols you in a course, your lessons, quizzes and skills appear on this page.</p>
          </div>
        </section>
        <Link to="/student/courses" className="pg-btn pg-btn-primary" style={{ justifySelf: "start" }}>Go to my courses →</Link>
      </div>
    );
  }

  const done = courses.reduce((n, c) => n + c.completed_lessons, 0);
  const total = courses.reduce((n, c) => n + c.total_lessons, 0);
  const allInsights = insights.map((i) => i.data).filter((x): x is StudentInsights => !!x);
  const quizzes = allInsights.reduce((n, i) => n + i.attempts, 0);
  const scored = allInsights.filter((i) => i.avg_score_rate != null);
  const avg = scored.length ? Math.round((scored.reduce((n, i) => n + (i.avg_score_rate ?? 0), 0) / scored.length) * 100) : null;
  const mastered = allInsights.reduce((n, i) => n + i.objectives.filter((o) => o.status === "mastered").length, 0);
  const current = courses.find((c) => c.course_id === selected) ?? recent ?? courses[0];
  const index = courses.findIndex((c) => c.course_id === current?.course_id);
  const outline = outlines[index]?.data;
  const insight = insights[index]?.data;
  const coursePct = current ? pct(current.completed_lessons, current.total_lessons) : 0;
  const heading = pct(done, total) >= 100 ? "Everything complete. Brilliant! 🏆" : done === 0 ? "Let's get started! 🚀" : pct(done, total) >= 50 ? "Over halfway there! 💪" : "Look how far you've come. 🌱";

  return (
    <div className="pg">
      <section className="pg-hero">
        <Ring value={pct(done, total)} size={132} label="lessons" />
        <div style={{ position: "relative", zIndex: 1 }}>
          <span className="pg-eyebrow">Your learning journey</span>
          <h1>{heading}</h1>
          <p>{done} of {total} lessons complete across {courses.length} course{courses.length === 1 ? "" : "s"}.</p>
          <div className="pg-stats">
            <div className="pg-stat"><strong>{done}</strong><span>lessons done</span></div>
            <div className="pg-stat"><strong>{quizzes}</strong><span>quiz attempts</span></div>
            <div className="pg-stat"><strong>{avg != null ? `${avg}%` : "–"}</strong><span>average score</span></div>
            <div className="pg-stat"><strong>{mastered}</strong><span>skills mastered</span></div>
          </div>
        </div>
      </section>

      {recent?.next_lesson_id && (
        <section className="pg-card pg-continue">
          <span className="pg-continue-icon" aria-hidden>▶</span>
          <div style={{ flex: 1, minWidth: 200 }}>
            <h2 style={{ fontSize: 17 }}>Continue where you left off</h2>
            <p className="pg-sub">{recent.title}{recent.last_activity_at ? ` · last active ${timeAgo(recent.last_activity_at)}` : ""}</p>
          </div>
          <Link className="pg-btn pg-btn-primary" to={`/student/lessons/${recent.next_lesson_id}`}>Continue lesson →</Link>
        </section>
      )}

      {courses.length > 1 && (
        <div className="pg-tabs" role="tablist" aria-label="Your courses">
          {courses.map((c) => {
            const p = pct(c.completed_lessons, c.total_lessons);
            return (
              <button key={c.course_id} type="button" role="tab" className="pg-tab" aria-selected={c.course_id === current?.course_id} onClick={() => setSelected(c.course_id)}>
                <strong>{c.title}</strong>
                <span className={`pg-bar ${p >= 100 ? "pg-bar-done" : ""}`}><span style={{ width: `${p}%` }} /></span>
                <small>{c.completed_lessons}/{c.total_lessons} lessons · {p}%</small>
              </button>
            );
          })}
        </div>
      )}

      {current && (
        <div className="pg-grid" role="tabpanel">
          <section className="pg-card">
            <div className="pg-course-head">
              <Ring value={coursePct} size={84} stroke={9} label="done" />
              <div style={{ flex: 1, minWidth: 180 }}>
                <h2>{current.title}</h2>
                <p className="pg-sub">{current.completed_lessons} of {current.total_lessons} lessons complete · tap a chapter to see its lessons</p>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {current.next_lesson_id && <Link className="pg-btn pg-btn-primary" to={`/student/lessons/${current.next_lesson_id}`}>Next lesson →</Link>}
                <Link className="pg-btn pg-btn-ghost" to={`/student/courses/${current.course_id}`}>Open course</Link>
              </div>
            </div>
            {outline ? <ChapterMap key={current.course_id} outline={outline} /> : <Loading label="Loading chapters…" />}
          </section>
          <Skills key={current.course_id} insights={insight} />
        </div>
      )}
    </div>
  );
}
