import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";

import { Icon } from "@/components/ui/Icon";
import { getTeacherCourses } from "@/lib/api";
import type { CourseStatus } from "@/features/demo/types";

type CourseFilter = "All courses" | CourseStatus;

const filters: CourseFilter[] = ["All courses", "Published", "In review", "Draft"];

function isEditableCourse(courseId: string): boolean {
  return courseId === "circulatory-system" || courseId.startsWith("course-");
}

export function TeacherCoursesPage() {
  const [filter, setFilter] = useState<CourseFilter>("All courses");
  const [search, setSearch] = useState("");
  const coursesQuery = useQuery({
    queryKey: ["demo", "courses", "teacher"],
    queryFn: getTeacherCourses,
  });

  if (coursesQuery.isError) throw coursesQuery.error;
  if (coursesQuery.isPending) {
    return <p className="page-loading" role="status">Loading your course library…</p>;
  }

  const courses = coursesQuery.data;
  const query = search.trim().toLowerCase();
  const visibleCourses = courses.filter((course) => {
    const matchesFilter = filter === "All courses" || course.status === filter;
    const matchesSearch = !query || `${course.title} ${course.subject} ${course.grade}`.toLowerCase().includes(query);
    return matchesFilter && matchesSearch;
  });
  const publishedCount = courses.filter((course) => course.status === "Published").length;
  const draftCount = courses.filter((course) => course.status === "Draft" || course.status === "In review").length;

  return (
    <div className="teacher-courses-page dashboard-page">
      <header className="page-heading teacher-courses-heading">
        <div>
          <div className="eyebrow"><span className="eyebrow-dot" /> TEACHER LIBRARY</div>
          <h1>My courses</h1>
          <p>Manage your course drafts, published learning, and classroom resources.</p>
        </div>
        <Link className="button button-primary" to="/teacher/upload"><Icon name="plus" size={17} /> Create a course</Link>
      </header>

      <section aria-label="Course library summary" className="course-library-summary">
        <article className="course-library-stat"><span className="course-library-stat-icon"><Icon name="book" size={17} /></span><span><strong>{courses.length}</strong><small>Total courses</small></span></article>
        <article className="course-library-stat"><span className="course-library-stat-icon course-stat-published"><Icon name="check" size={17} /></span><span><strong>{publishedCount}</strong><small>Published</small></span></article>
        <article className="course-library-stat"><span className="course-library-stat-icon course-stat-draft"><Icon name="file" size={17} /></span><span><strong>{draftCount}</strong><small>Drafts & review</small></span></article>
        <span className="course-library-summary-note">Your courses, all in one place</span>
      </section>

      <section aria-labelledby="course-library-title" className="panel course-library-panel">
        <div className="course-library-toolbar">
          <div>
            <span className="eyebrow eyebrow-muted">COURSE LIBRARY</span>
            <h2 id="course-library-title">Your teaching materials <span className="count-pill">{visibleCourses.length}</span></h2>
          </div>
          <label className="course-search">
            <Icon name="search" size={16} />
            <span className="visually-hidden">Search courses</span>
            <input onChange={(event) => setSearch(event.target.value)} placeholder="Search courses" type="search" value={search} />
          </label>
        </div>

        <div aria-label="Filter courses by status" className="course-filter-tabs" role="group">
          {filters.map((item) => {
            const count = item === "All courses"
              ? courses.length
              : courses.filter((course) => course.status === item).length;
            return (
              <button aria-pressed={filter === item} className={filter === item ? "course-filter-active" : ""} key={item} onClick={() => setFilter(item)} type="button">
                {item}<span>{count}</span>
              </button>
            );
          })}
        </div>

        {visibleCourses.length > 0 ? (
          <div className="course-library-list">
            {visibleCourses.map((course) => {
              const isEditable = isEditableCourse(course.id);
              const canPreview = course.id === "cell-biology" || course.id === "circulatory-system";
              const target = course.status === "Published"
                ? "/student/courses/circulatory-system/lessons/heart-structure"
                : `/teacher/courses/${course.id}/review`;
              return (
                <article className="course-library-card" key={course.id}>
                  <div className={`course-art course-art-${course.accent}`} aria-hidden="true">
                    {course.accent === "mint" ? <Icon name="leaf" size={28} /> : course.accent === "amber" ? <Icon name="layers" size={28} /> : <Icon name="activity" size={28} />}
                    <span className="art-orb" />
                  </div>
                  <div className="course-library-main">
                    <div className="course-library-meta"><span>{course.subject}</span><span>·</span><span>{course.grade}</span><span className={`status-pill status-${course.status.toLowerCase().replace(" ", "-")}`}>{course.status}</span></div>
                    <h3>{course.title}</h3>
                    <div className="course-library-details">
                      <span><Icon name="book" size={14} /> {course.chapters} chapters</span>
                      <span><Icon name="users" size={14} /> {course.students} learners</span>
                      <span><Icon name="clock" size={14} /> {course.lastUpdated}</span>
                    </div>
                  </div>
                  <div className="course-library-progress">
                    <div className="progress-label"><span>Class completion</span><strong>{course.completion > 0 ? `${course.completion}%` : "Not started"}</strong></div>
                    <div aria-label={`${course.title}: ${course.completion}% class completion`} className="progress-track" role="progressbar" aria-valuenow={course.completion} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${course.completion}%` }} /></div>
                  </div>
                  <div className="course-library-actions">
                    {isEditable ? (
                      <Link className="button button-secondary" to={target}>{course.status === "Published" ? "View course" : "Continue review"}<Icon name="arrow-right" size={15} /></Link>
                    ) : canPreview ? (
                      <Link className="button button-secondary" to={target}>Preview course<Icon name="arrow-right" size={15} /></Link>
                    ) : (
                      <span className="course-demo-note">Preview not available in this demo</span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="course-library-empty">
            <span><Icon name="search" size={21} /></span>
            <strong>{search ? "No courses match that search" : `No ${filter.toLowerCase()} yet`}</strong>
            <p>{search ? "Try another title, subject, or grade level." : "Create a course from a textbook to get started."}</p>
            {search && <button className="button button-secondary" onClick={() => setSearch("")} type="button">Clear search</button>}
          </div>
        )}
      </section>
    </div>
  );
}
