import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";

import { Icon } from "@/components/ui/Icon";
import { getClassAnalytics, getCourse } from "@/lib/api";

export function TeacherAnalyticsPage() {
  const [chapterFilter, setChapterFilter] = useState("all");
  const [dateRange, setDateRange] = useState("term");
  const [notice, setNotice] = useState("");
  const courseQuery = useQuery({
    queryKey: ["course", "circulatory-system"],
    queryFn: () => getCourse("circulatory-system"),
  });
  const analyticsQuery = useQuery({
    queryKey: ["class-analytics", "circulatory-system"],
    queryFn: () => getClassAnalytics("circulatory-system"),
  });

  if (courseQuery.isError) throw courseQuery.error;
  if (analyticsQuery.isError) throw analyticsQuery.error;
  if (courseQuery.isPending || analyticsQuery.isPending) {
    return <p className="page-loading" role="status">Loading your class insights…</p>;
  }

  const course = courseQuery.data;
  const analytics = analyticsQuery.data;
  const visibleChapters = chapterFilter === "all"
    ? analytics.chapterAverages
    : analytics.chapterAverages.filter((chapter) => chapter.chapterId === chapterFilter);
  const visibleStudents = analytics.studentPerformance;
  const dateRangeLabel = dateRange === "7d" ? "Last 7 days" : dateRange === "30d" ? "Last 30 days" : "This term";
  const misconceptions = chapterFilter === "all"
    ? analytics.misconceptions
    : analytics.misconceptions.filter((item) => item.chapterId === chapterFilter);
  const studentsNeedingSupport = chapterFilter === "all"
    ? analytics.studentsNeedingSupport
    : analytics.studentsNeedingSupport.filter((item) => item.chapterId === chapterFilter);

  return (
    <div className="teacher-analytics-page dashboard-page">
      <header className="page-heading analytics-page-heading">
        <div>
          <div className="eyebrow"><span className="eyebrow-dot" /> TEACHER INSIGHTS</div>
          <h1>See how your class is growing.</h1>
          <p>Use the patterns to decide what to celebrate and where a little support can help.</p>
        </div>
        <Link className="button button-secondary" to="/teacher"><Icon name="arrow-left" size={16} /> Teacher overview</Link>
      </header>

      <section aria-label="Analytics filters" className="panel analytics-filters">
        <label>Course<select aria-label="Filter by course" disabled value={course.id}><option value={course.id}>{course.title} · {course.grade}</option></select></label>
        <label>Chapter<select aria-label="Filter by chapter" onChange={(event) => setChapterFilter(event.target.value)} value={chapterFilter}><option value="all">All chapters</option>{course.chapters.map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.title}</option>)}</select></label>
        <label>Date range<select aria-label="Filter by date range" onChange={(event) => setDateRange(event.target.value)} value={dateRange}><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="term">This term</option></select></label>
        <span className="analytics-snapshot-note">Showing {dateRangeLabel} · this demo has one course snapshot without dated records.</span>
      </section>

      <section aria-label="Class key performance indicators" className="metric-grid analytics-metric-grid">
        <article className="metric-card metric-card-violet"><div className="metric-top"><span>Class average</span><span className="metric-icon metric-icon-violet"><Icon name="target" size={18} /></span></div><div className="metric-value">{analytics.classAverage}%</div><div className="metric-note">Across assessed chapters</div></article>
        <article className="metric-card metric-card-mint"><div className="metric-top"><span>Completion rate</span><span className="metric-icon metric-icon-mint"><Icon name="check" size={18} /></span></div><div className="metric-value">{analytics.completionRate}%</div><div className="metric-note">Students completing the course</div></article>
        <article className="metric-card metric-card-amber"><div className="metric-top"><span>Active students</span><span className="metric-icon metric-icon-amber"><Icon name="users" size={18} /></span></div><div className="metric-value">{analytics.activeStudents}</div><div className="metric-note">Out of {analytics.studentPerformance.length} learners</div></article>
        <article className="metric-card metric-card-risk"><div className="metric-top"><span>May need support</span><span className="metric-icon metric-icon-risk"><Icon name="lightbulb" size={18} /></span></div><div className="metric-value">{analytics.atRiskStudents}</div><div className="metric-note">Below the current progress threshold</div></article>
      </section>

      <div className="analytics-main-grid">
        <section aria-labelledby="chapter-scores-title" className="panel analytics-panel chapter-score-panel">
          <div className="section-heading">
            <div><span className="eyebrow eyebrow-muted">KNOWLEDGE CHECKS</span><h2 id="chapter-scores-title">Average score per chapter</h2></div>
            <span className="analytics-unit">Class average</span>
          </div>
          {visibleChapters.length > 0 ? (
            <div className="chapter-score-chart">
              {visibleChapters.map((chapter) => (
                <div className="chapter-score-column" key={chapter.chapterId}>
                  <strong>{chapter.score}%</strong>
                  <div aria-label={`${chapter.chapterTitle}: ${chapter.score}% average`} className="chapter-score-track" role="img"><span style={{ height: `${chapter.score}%` }} /></div>
                  <span>{chapter.chapterTitle}</span>
                </div>
              ))}
            </div>
          ) : <div className="progress-empty"><Icon name="activity" size={22} /><strong>No chapter score available</strong><span>Choose another chapter to see its class average.</span></div>}
        </section>

        <section aria-labelledby="misconceptions-title" className="panel analytics-panel misconceptions-panel">
          <div className="section-heading"><div><span className="eyebrow eyebrow-muted">WHERE TO FOCUS</span><h2 id="misconceptions-title">Common misconceptions</h2></div><Icon name="lightbulb" size={18} /></div>
          {misconceptions.length > 0 ? (
            <ul className="misconception-list">{misconceptions.map((item) => {
              const chapter = course.chapters.find((candidate) => candidate.id === item.chapterId);
              return <li key={item.concept}><span className="misconception-percent">{item.missingPercent}%</span><span className="misconception-copy"><strong>{item.concept}</strong><Link to={`/student/courses/${course.id}/lessons/${item.chapterId}`}>Revisit {chapter?.title ?? "chapter"} <Icon name="arrow-up-right" size={12} /></Link></span></li>;
            })}</ul>
          ) : <div className="progress-empty"><Icon name="check" size={22} /><strong>No misconception flagged</strong><span>No common gaps are listed for this chapter.</span></div>}
        </section>
      </div>

      <section aria-labelledby="student-heatmap-title" className="panel analytics-panel heatmap-panel">
        <div className="section-heading">
          <div><span className="eyebrow eyebrow-muted">STUDENT × CHAPTER</span><h2 id="student-heatmap-title">Class performance</h2></div>
          <div aria-label="Score legend" className="heatmap-legend"><span className="score-band-high" /> Strong <span className="score-band-mid" /> Developing <span className="score-band-low" /> Needs practice</div>
        </div>
        <div className="analytics-table-wrap">
          <table className="analytics-table">
            <thead><tr><th scope="col">Student</th>{visibleChapters.map((chapter) => <th key={chapter.chapterId} scope="col">{chapter.chapterTitle}</th>)}</tr></thead>
            <tbody>{visibleStudents.map((student) => (
              <tr key={student.studentId}>
                <th scope="row">{student.studentName}</th>
                {visibleChapters.map((chapter) => {
                  const score = student.scores[chapter.chapterId] ?? 0;
                  const band = score >= 80 ? "high" : score >= 60 ? "mid" : "low";
                  return <td key={chapter.chapterId}><span aria-label={`${score}%`} className={`heatmap-score score-band-${band}`}>{score}%</span></td>;
                })}
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="support-list-title" className="panel analytics-panel support-panel">
        <div className="section-heading">
          <div><span className="eyebrow eyebrow-muted">PERSONALIZED FOLLOW-UP</span><h2 id="support-list-title">Students who may need support</h2></div>
          <span className="support-count">{studentsNeedingSupport.length} learners</span>
        </div>
        {studentsNeedingSupport.length > 0 ? (
          <ul className="support-list">{studentsNeedingSupport.map((student) => {
            const chapter = course.chapters.find((candidate) => candidate.id === student.chapterId);
            return (
              <li key={student.studentId}>
                <span className="support-avatar">{student.name.split(" ").map((part) => part[0]).join("")}</span>
                <span className="support-student-copy"><strong>{student.name}</strong><small>{student.reason}</small></span>
                <Link className="support-lesson-link" to={`/student/courses/${course.id}/lessons/${student.chapterId}`}>{chapter?.title ?? "Open chapter"} <Icon name="arrow-up-right" size={13} /></Link>
                <button className="button button-secondary support-action" onClick={() => setNotice(`Practice suggestion prepared for ${student.name}.`)} type="button">Suggest practice</button>
              </li>
            );
          })}</ul>
        ) : <div className="progress-empty"><Icon name="users" size={22} /><strong>No students need follow-up in this chapter</strong><span>Try another chapter or the full class view.</span></div>}
        <p aria-live="polite" className="support-notice" role="status">{notice}</p>
      </section>
    </div>
  );
}
