import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, matchRoutes } from "react-router";
import { describe, expect, it } from "vitest";
import { appRoutes } from "@/app/router/appRoutes";
import { DemoStudentDashboard } from "./DemoStudentDashboard";
import { TeacherCoursesPage } from "./TeacherCoursesPage";

describe("API-backed dashboard rendering", () => {
  it("uses saved enrolment and lesson ids rather than the demo course", () => {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    client.setQueryData(["me"], { display_name: "Real Learner", account_type: "student" });
    client.setQueryData(["my-progress"], [{ course_id: "saved-course", title: "Physics from the backend", completed_lessons: 2, total_lessons: 4, next_lesson_id: "saved-lesson", last_activity_at: null }]);
    const html = renderToStaticMarkup(<QueryClientProvider client={client}><MemoryRouter><DemoStudentDashboard /></MemoryRouter></QueryClientProvider>);
    expect(html).toContain("Physics from the backend");
    expect(html).toContain('/student/lessons/saved-lesson');
    expect(html).toContain('aria-valuenow="50"');
    expect(html).not.toContain("circulatory-system");
    expect(html).not.toContain("Alex Morgan");
  });
  it("opens UUID courses for review, including published ones", () => {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    const id = "8ad2b50b-2c1f-4560-a234-ae789b9bc111";
    client.setQueryData(["courses"], [{ id, title: "Saved course", can_manage: true, status: "published", subject: "Physics", grade_level: "Grade 9", updated_at: "2026-11-07T10:00:00Z" }]);
    const html = renderToStaticMarkup(<QueryClientProvider client={client}><MemoryRouter><TeacherCoursesPage /></MemoryRouter></QueryClientProvider>);
    expect(html).toContain(`href="/teacher/courses/${id}"`);
    expect(html).not.toContain("Preview not available");
  });
  it("keeps all backend workflows reachable in the connected design", () => {
    for (const path of ["/login", "/register", "/teacher/courses", "/teacher/courses/uuid/review", "/teacher/chapters/uuid", "/teacher/lessons/uuid", "/teacher/assets", "/teacher/insights", "/teacher/schools", "/teacher/assessments/uuid", "/student", "/student/progress", "/student/courses/uuid", "/student/lessons/uuid", "/student/assessments/uuid", "/student/attempts/uuid", "/account"]) {
      const matches = matchRoutes(appRoutes, path);
      expect(matches?.at(-1)?.route.path).not.toBe("*");
      expect(matches?.length).toBeGreaterThan(0);
    }
  });
});
