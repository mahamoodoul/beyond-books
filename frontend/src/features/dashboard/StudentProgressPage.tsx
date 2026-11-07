import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";

import { Icon } from "@/components/ui/Icon";
import { getCourse, getStudentProgress } from "@/lib/api";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(value));
}

export function StudentProgressPage() {
  const courseQuery = useQuery({
    queryKey: ["course", "circulatory-system"],
    queryFn: () => getCourse("circulatory-system"),
  });
  const progressQuery = useQuery({
    queryKey: ["student-progress", "student-1"],
    queryFn: () => getStudentProgress("student-1"),
  });

  if (courseQuery.isError) throw courseQuery.error;
  if (progressQuery.isError) throw progressQuery.error;
  if (courseQuery.isPending || progressQuery.isPending) {
    return <p className="page-loading" role="status">Gathering your learning progress…</p>;
  }

  const course = courseQuery.data;
  const progress = progressQuery.data;
  const attempts = [...progress.attempts].sort(
    (first, second) => first.submittedAt.localeCompare(second.submittedAt),
  );
  const chartPoints = attempts.map((attempt, index) => {
    const score = Math.round((attempt.score / attempt.maximumScore) * 100);
    const x = attempts.length === 1 ? 160 : 18 + index * (284 / (attempts.length - 1));
    const y = 96 - score * 0.72;
    return { x, y, score, attempt };
  });
  const pointString = chartPoints.map(({ x, y }) => `${x},${y}`).join(" ");

  return (
    <div className="progress-page dashboard-page">
      <header className="page-heading progress-page-heading">
        <div>
          <div className="eyebrow"><span className="eyebrow-dot" /> YOUR PROGRESS</div>
          <h1>Look how far you’ve come.</h1>
          <p>Every chapter and check-in is another step toward understanding.</p>
        </div>
        <Link className="button button-secondary" to={`/student/courses/${course.id}/lessons/${course.chapters[0]?.id ?? ""}`}>
          <Icon name="book" size={16} /> Back to learning
        </Link>
      </header>

      <section aria-label="Course completion" className="progress-summary panel">
        <div aria-label={`${progress.courseCompletion}% of ${course.title} completed`} className="completion-ring" role="img" style={{ background: `conic-gradient(var(--accent) ${progress.courseCompletion}%, var(--line) 0)` }}>
          <span><strong>{progress.courseCompletion}%</strong><small>complete</small></span>
        </div>
        <div className="progress-summary-copy">
          <span className="eyebrow eyebrow-muted">YOUR COURSE</span>
          <h2>{course.title}</h2>
          <p>{progress.completedChapterIds.length} of {course.chapters.length} chapters completed · {progress.currentStreak} day learning streak</p>
          <div className="progress-track" role="progressbar" aria-label="Course completion" aria-valuenow={progress.courseCompletion} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${progress.courseCompletion}%` }} />
          </div>
        </div>
      </section>

      <div className="progress-layout">
        <section aria-labelledby="chapter-checklist-title" className="panel progress-panel">
          <div className="section-heading">
            <div><span className="eyebrow eyebrow-muted">COURSE CHECKLIST</span><h2 id="chapter-checklist-title">Chapter progress</h2></div>
            <span className="progress-count">{progress.completedChapterIds.length}/{course.chapters.length}</span>
          </div>
          <ul className="chapter-checklist">
            {course.chapters.map((chapter, index) => {
              const isComplete = progress.completedChapterIds.includes(chapter.id);
              return (
                <li className="chapter-checklist-item" key={chapter.id}>
                  <span className={`chapter-check-icon${isComplete ? " chapter-is-complete" : ""}`}>{isComplete ? <Icon name="check" size={14} /> : index + 1}</span>
                  <span className="chapter-check-copy"><strong>{chapter.title}</strong><small>{isComplete ? "Chapter complete" : "Ready when you are"}</small></span>
                  <Link aria-label={`${isComplete ? "Review" : "Continue"} ${chapter.title}`} className="chapter-check-link" to={`/student/courses/${course.id}/lessons/${chapter.id}`}><Icon name="arrow-up-right" size={16} /></Link>
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-labelledby="score-trend-title" className="panel progress-panel">
          <div className="section-heading">
            <div><span className="eyebrow eyebrow-muted">ASSESSMENT SCORES</span><h2 id="score-trend-title">Your score trend</h2></div>
            <span className="trend-period">Recent attempts</span>
          </div>
          {chartPoints.length > 0 ? (
            <div className="score-trend-chart">
              <div aria-hidden="true" className="score-axis-labels"><span>100%</span><span>50%</span><span>0%</span></div>
              <svg aria-label={`Assessment scores: ${chartPoints.map(({ score, attempt }) => `${score} percent on ${formatDate(attempt.submittedAt)}`).join(", ")}`} className="score-trend-svg" role="img" viewBox="0 0 320 120">
                <line x1="10" x2="310" y1="24" y2="24" />
                <line x1="10" x2="310" y1="60" y2="60" />
                <line x1="10" x2="310" y1="96" y2="96" />
                {chartPoints.length > 1 && <polyline points={pointString} />}
                {chartPoints.map(({ x, y, score, attempt }) => <circle aria-label={`${score}% on ${formatDate(attempt.submittedAt)}`} key={attempt.id} cx={x} cy={y} r="4" />)}
              </svg>
              <div className="score-trend-dates">{chartPoints.map(({ attempt }) => <span key={attempt.id}>{formatDate(attempt.submittedAt)}</span>)}</div>
            </div>
          ) : (
            <div className="progress-empty"><Icon name="target" size={22} /><strong>Your score trend will appear here</strong><span>Complete an assessment to see how you’re growing.</span></div>
          )}
        </section>

        <section aria-labelledby="assessment-history-title" className="panel progress-panel assessment-history-panel">
          <div className="section-heading">
            <div><span className="eyebrow eyebrow-muted">YOUR CHECK-INS</span><h2 id="assessment-history-title">Assessment history</h2></div>
          </div>
          {attempts.length > 0 ? (
            <div className="progress-table-wrap">
              <table className="progress-table">
                <thead><tr><th scope="col">Chapter</th><th scope="col">Date</th><th scope="col">Score</th><th scope="col">Result</th></tr></thead>
                <tbody>{[...attempts].reverse().map((attempt) => {
                  const chapter = course.chapters.find((item) => item.id === attempt.chapterId);
                  return (
                    <tr key={attempt.id}>
                      <td><Link to={`/student/courses/${course.id}/lessons/${attempt.chapterId}`}>{chapter?.title ?? "Course assessment"}</Link></td>
                      <td>{formatDate(attempt.submittedAt)}</td>
                      <td>{attempt.score}/{attempt.maximumScore}</td>
                      <td><span className={`attempt-result${attempt.score / attempt.maximumScore >= 0.7 ? " attempt-result-good" : ""}`}>{Math.round((attempt.score / attempt.maximumScore) * 100)}%</span></td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          ) : (
            <div className="progress-empty"><Icon name="book" size={22} /><strong>No assessments yet</strong><span>Your completed check-ins will show here.</span></div>
          )}
        </section>
      </div>

      <div className="progress-focus-grid">
        <section aria-labelledby="strengths-title" className="panel progress-panel">
          <div className="section-heading"><div><span className="eyebrow eyebrow-muted">WHAT’S CLICKING</span><h2 id="strengths-title">Your strengths</h2></div><Icon name="check" size={18} /></div>
          <div className="progress-topic-chips">{progress.strengths.length > 0 ? progress.strengths.map((item) => <span className="strength-chip" key={item}><Icon name="check" size={13} />{item}</span>) : <p className="progress-empty-copy">Your strengths will grow as you complete more lessons.</p>}</div>
        </section>
        <section aria-labelledby="revisit-title" className="panel progress-panel">
          <div className="section-heading"><div><span className="eyebrow eyebrow-muted">A LITTLE MORE PRACTICE</span><h2 id="revisit-title">Topics to revisit</h2></div><Icon name="lightbulb" size={18} /></div>
          <div className="progress-topic-chips">{progress.topicsToRevisit.length > 0 ? progress.topicsToRevisit.map((item) => {
            const chapterId = item.toLowerCase().includes("capillary") ? "blood-vessels" : item.toLowerCase().includes("oxygen") ? "lungs-circulation" : "heart-structure";
            return <Link className="revisit-chip" key={item} to={`/student/courses/${course.id}/lessons/${chapterId}`}>{item}<Icon name="arrow-up-right" size={13} /></Link>;
          }) : <p className="progress-empty-copy">Nothing flagged right now. Keep up the great work.</p>}</div>
        </section>
      </div>
    </div>
  );
}
