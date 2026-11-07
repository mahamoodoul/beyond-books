import { useState } from "react";
import { Link } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Icon } from "@/components/ui/Icon";
import { enrollInStudentCourse, getStudentCourses } from "@/lib/api";
import type { StudentCourseListing } from "@/lib/api";

type CourseFilter = "all" | "enrolled" | "available";

const filters: Array<{ id: CourseFilter; label: string }> = [
  { id: "all", label: "All courses" },
  { id: "enrolled", label: "My learning" },
  { id: "available", label: "Discover" },
];

function courseLink(courseId: string): string | null {
  if (courseId === "circulatory-system") {
    return `/student/courses/${courseId}/lessons/heart-structure`;
  }
  if (courseId === "cell-biology") {
    return `/student/courses/${courseId}/lessons/cell-structure`;
  }
  if (courseId.startsWith("course-")) {
    return `/student/courses/${courseId}/lessons/heart-structure`;
  }
  return null;
}

function CourseCard({
  listing,
  onEnroll,
  isEnrolling,
}: {
  listing: StudentCourseListing;
  onEnroll: (courseId: string) => void;
  isEnrolling: boolean;
}) {
  const { course, enrolled, canEnroll } = listing;
  const destination = courseLink(course.id);

  return (
    <article className={`catalog-course-card catalog-course-${course.accent}`}>
      <div aria-hidden="true" className="catalog-course-art">
        <span className="catalog-course-art-orbit" />
        <span className="catalog-course-art-icon"><Icon name={course.accent === "mint" ? "leaf" : course.accent === "amber" ? "book" : "flask"} size={26} /></span>
      </div>
      <div className="catalog-course-content">
        <div className="catalog-course-meta">
          <span>{course.subject}</span>
          <span>{course.grade}</span>
        </div>
        <h2>{course.title}</h2>
        <p>{course.description ?? `Explore ${course.subject.toLowerCase()} with visual lessons and guided activities.`}</p>
        <div className="catalog-course-details">
          <span><Icon name="book" size={15} /> {course.chapters} chapters</span>
          <span className={`catalog-course-status${canEnroll ? "" : " catalog-course-status-pending"}`}>
            {canEnroll ? "Ready to learn" : "Coming soon"}
          </span>
        </div>
        {enrolled && destination ? (
          <Link className="button button-primary catalog-course-action" to={destination}>
            Continue learning <Icon name="arrow-right" size={16} />
          </Link>
        ) : enrolled ? (
          <button className="button button-secondary catalog-course-action" disabled type="button">
            Enrolled · lessons coming soon
          </button>
        ) : (
          <button
            className="button button-secondary catalog-course-action"
            disabled={!canEnroll || isEnrolling}
            onClick={() => onEnroll(course.id)}
            type="button"
          >
            {isEnrolling ? "Enrolling…" : canEnroll ? "Enroll in course" : "Not available yet"}
            {canEnroll && !isEnrolling && <Icon name="arrow-right" size={16} />}
          </button>
        )}
      </div>
    </article>
  );
}

export function StudentCoursesPage() {
  const [filter, setFilter] = useState<CourseFilter>("all");
  const queryClient = useQueryClient();
  const coursesQuery = useQuery({
    queryKey: ["student-courses"],
    queryFn: getStudentCourses,
  });
  const enrollmentMutation = useMutation({
    mutationFn: enrollInStudentCourse,
    onSuccess: (enrolledCourse) => {
      queryClient.setQueryData<StudentCourseListing[]>(["student-courses"], (current) =>
        current?.map((listing) => listing.course.id === enrolledCourse.course.id ? enrolledCourse : listing),
      );
    },
  });

  if (coursesQuery.isPending) {
    return (
      <div aria-label="Loading courses" className="catalog-loading-grid" role="status">
        <span /><span /><span />
      </div>
    );
  }

  if (coursesQuery.isError) {
    return (
      <section className="catalog-message panel" role="alert">
        <Icon name="circle-help" size={23} />
        <h1>We couldn’t load your courses.</h1>
        <p>{coursesQuery.error.message}</p>
        <button className="button button-secondary" onClick={() => void coursesQuery.refetch()} type="button">Try again</button>
      </section>
    );
  }

  const allCourses = coursesQuery.data;
  const visibleCourses = allCourses.filter(({ enrolled }) =>
    filter === "all" || (filter === "enrolled" ? enrolled : !enrolled),
  );
  const enrolledCount = allCourses.filter(({ enrolled }) => enrolled).length;

  return (
    <div className="student-catalog-page">
      <header className="student-catalog-heading">
        <div>
          <div className="eyebrow"><span className="eyebrow-dot" /> YOUR LEARNING</div>
          <h1>Find your next course.</h1>
          <p>Pick up where you left off or explore something new.</p>
        </div>
        <div aria-label={`${enrolledCount} ${enrolledCount === 1 ? "course" : "courses"} enrolled`} className="catalog-enrollment-count">
          <span>{enrolledCount}</span>
          <small>in your learning</small>
        </div>
      </header>

      <nav aria-label="Filter courses" className="catalog-filters">
        {filters.map((item) => (
          <button
            aria-pressed={filter === item.id}
            className={`catalog-filter${filter === item.id ? " catalog-filter-active" : ""}`}
            key={item.id}
            onClick={() => setFilter(item.id)}
            type="button"
          >
            {item.label}
          </button>
        ))}
        <span className="catalog-course-count">{visibleCourses.length} {visibleCourses.length === 1 ? "course" : "courses"}</span>
      </nav>

      {enrollmentMutation.isError && (
        <p className="catalog-error" role="alert">{enrollmentMutation.error.message}</p>
      )}

      {visibleCourses.length > 0 ? (
        <section aria-label="Available courses" className="catalog-course-grid">
          {visibleCourses.map((listing) => (
            <CourseCard
              isEnrolling={enrollmentMutation.isPending && enrollmentMutation.variables === listing.course.id}
              key={listing.course.id}
              listing={listing}
              onEnroll={(courseId) => enrollmentMutation.mutate(courseId)}
            />
          ))}
        </section>
      ) : (
        <section className="catalog-message panel">
          <Icon name="book" size={24} />
          <h2>{filter === "enrolled" ? "Your learning starts here." : "You’re all caught up."}</h2>
          <p>{filter === "enrolled" ? "Enroll in a course to find it here." : "You’re enrolled in every course currently available."}</p>
          <button className="button button-secondary" onClick={() => setFilter("all")} type="button">View all courses</button>
        </section>
      )}
    </div>
  );
}
