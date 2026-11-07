import { lazy, Suspense, type ComponentType, type ReactNode } from "react";
import { createBrowserRouter, Navigate } from "react-router";

import { AppLayout } from "@/app/layouts/AppLayout";
import { RouteError } from "@/app/router/RouteError";
import { Loading } from "@/components/feedback";
import { RequireAuth } from "@/features/auth/auth";
import { LoginPage } from "@/features/auth/LoginPage";
import { RegisterPage } from "@/features/auth/RegisterPage";
import { HomePage } from "@/features/dashboard/HomePage";

/** Route-level code splitting: each page's code (and heavy deps) loads on first visit. */
function page<T extends Record<string, unknown>>(load: () => Promise<T>, name: keyof T) {
  const C = lazy(async () => ({ default: (await load())[name] as ComponentType }));
  return (
    <Suspense fallback={<Loading />}>
      <C />
    </Suspense>
  );
}

const teacher = (el: ReactNode) => <RequireAuth role="teacher">{el}</RequireAuth>;
const student = (el: ReactNode) => <RequireAuth role="student">{el}</RequireAuth>;
const anyUser = (el: ReactNode) => <RequireAuth>{el}</RequireAuth>;

export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    errorElement: <RouteError />,
    children: [
      { path: "/", element: <HomePage /> },
      { path: "/login", element: <LoginPage /> },
      { path: "/register", element: <RegisterPage /> },
      { path: "/account", element: anyUser(page(() => import("@/features/account/AccountPage"), "AccountPage")) },
      { path: "/teacher", element: teacher(page(() => import("@/features/dashboard/TeacherDashboard"), "TeacherDashboard")) },
      { path: "/teacher/courses/:courseId", element: teacher(page(() => import("@/features/courses/CoursePage"), "CoursePage")) },
      { path: "/teacher/chapters/:chapterId", element: teacher(page(() => import("@/features/chapters/ChapterPage"), "ChapterPage")) },
      { path: "/teacher/lessons/:lessonId", element: teacher(page(() => import("@/features/lessons/LessonEditorPage"), "LessonEditorPage")) },
      { path: "/teacher/assets", element: teacher(page(() => import("@/features/three-d/AssetsPage"), "AssetsPage")) },
      { path: "/teacher/assessments/:assessmentId", element: teacher(page(() => import("@/features/assessments/AssessmentEditorPage"), "AssessmentEditorPage")) },
      { path: "/student", element: student(page(() => import("@/features/dashboard/StudentDashboard"), "StudentDashboard")) },
      { path: "/student/courses/:courseId", element: student(page(() => import("@/features/student/StudentCoursePage"), "StudentCoursePage")) },
      { path: "/student/lessons/:lessonId", element: student(page(() => import("@/features/student/LessonViewerPage"), "LessonViewerPage")) },
      { path: "/student/assessments/:assessmentId", element: student(page(() => import("@/features/assessments/QuizPage"), "QuizPage")) },
      { path: "/student/attempts/:attemptId", element: student(page(() => import("@/features/assessments/AttemptResultPage"), "AttemptResultPage")) },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);
