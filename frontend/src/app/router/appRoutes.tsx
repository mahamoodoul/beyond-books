import { lazy, Suspense, type ComponentType, type ReactNode } from "react";
import { Navigate, useParams, type RouteObject } from "react-router";

import { AppLayout } from "@/app/layouts/AppLayout";
import { RouteError } from "@/app/router/RouteError";
import { Loading } from "@/components/feedback";
import { RequireAuth } from "@/features/auth/auth";
import { LoginPage } from "@/features/auth/LoginPage";
import { RegisterPage } from "@/features/auth/RegisterPage";
import { LandingPage } from "@/features/landing/LandingPage";

/** Route-level code splitting: each page's code (and heavy deps) loads on first visit. */
function page<T extends Record<string, unknown>>(load: () => Promise<T>, name: keyof T) {
  const C = lazy(async () => ({ default: (await load())[name] as ComponentType }));
  return (
    <Suspense fallback={<Loading />}>
      <C />
    </Suspense>
  );
}

/** /viewer/... → /studio/... (the 3D viewer is now the 3D Studio). */
function LegacyViewerRedirect() {
  const { assetId, sceneId } = useParams();
  return <Navigate to={assetId ? `/studio/library/${assetId}` : `/studio/${sceneId ?? ""}`} replace />;
}

const teacher = (el: ReactNode) => <RequireAuth role="teacher">{el}</RequireAuth>;
const student = (el: ReactNode) => <RequireAuth role="student">{el}</RequireAuth>;
const anyUser = (el: ReactNode) => <RequireAuth>{el}</RequireAuth>;

export const appRoutes: RouteObject[] = [
  {
    errorElement: <RouteError />,
    children: [
      { path: "/", element: <LandingPage /> },
      { path: "/login", element: <LoginPage /> },
      { path: "/register", element: <RegisterPage /> },
      { path: "/teacher/chapters/:chapterId/studio", element: teacher(page(() => import("@/features/three-d/studio/ChapterStudioPage"), "default")) },
      // Full-screen teacher 3D Studio (own dark layout, outside the standard app chrome).
      { path: "/teacher/lessons/:lessonId/studio", element: teacher(page(() => import("@/features/three-d/studio/StudioPage"), "default")) },
      // Full-screen AR scan of a lesson's interactive heart (teachers previewing and students).
      { path: "/lessons/:lessonId/ar", element: anyUser(page(() => import("@/features/ar/HeartARPage"), "HeartARPage")) },
      { element: <RequireAuth><AppLayout /></RequireAuth>, children: [
      { path: "/account", element: anyUser(page(() => import("@/features/account/AccountPage"), "AccountPage")) },
      { path: "/teacher", element: teacher(page(() => import("@/features/dashboard/DemoTeacherDashboard"), "DemoTeacherDashboard")) },
      { path: "/teacher/courses/:courseId", element: teacher(page(() => import("@/features/courses/CoursePage"), "CoursePage")) },
      { path: "/teacher/chapters/:chapterId/preview", element: teacher(page(() => import("@/features/chapters/ChapterPreviewPage"), "ChapterPreviewPage")) },
      { path: "/teacher/chapters/:chapterId", element: teacher(page(() => import("@/features/chapters/ChapterPage"), "ChapterPage")) },
      { path: "/teacher/lessons/:lessonId", element: teacher(page(() => import("@/features/lessons/LessonEditorPage"), "LessonEditorPage")) },
      { path: "/teacher/assets", element: teacher(page(() => import("@/features/three-d/AssetsPage"), "AssetsPage")) },
      { path: "/teacher/assessments/:assessmentId", element: teacher(page(() => import("@/features/assessments/AssessmentEditorPage"), "AssessmentEditorPage")) },
      { path: "/student", element: student(page(() => import("@/features/dashboard/DemoStudentDashboard"), "DemoStudentDashboard")) },
      { path: "/student/courses/:courseId", element: student(page(() => import("@/features/student/StudentCoursePage"), "StudentCoursePage")) },
      { path: "/student/lessons/:lessonId", element: student(page(() => import("@/features/student/LessonViewerPage"), "LessonViewerPage")) },
      { path: "/student/assessments/:assessmentId", element: student(page(() => import("@/features/assessments/QuizPage"), "QuizPage")) },
      { path: "/student/attempts/:attemptId", element: student(page(() => import("@/features/assessments/AttemptResultPage"), "AttemptResultPage")) },
      { path: "/teacher/courses", element: teacher(page(() => import("@/features/dashboard/TeacherCoursesPage"), "TeacherCoursesPage")) },
      { path: "/teacher/upload", element: teacher(page(() => import("@/features/courses/TeacherUploadPage"), "TeacherUploadPage")) },
      { path: "/teacher/courses/:courseId/review", element: teacher(page(() => import("@/features/courses/CoursePage"), "CoursePage")) },
      { path: "/teacher/insights", element: teacher(page(() => import("@/features/dashboard/TeacherAnalyticsPage"), "TeacherAnalyticsPage")) },
      { path: "/teacher/schools", element: teacher(page(() => import("@/features/dashboard/SchoolsPage"), "SchoolsPage")) },
      { path: "/student/progress", element: student(page(() => import("@/features/dashboard/StudentProgressPage"), "StudentProgressPage")) },
      { path: "/student/courses", element: student(page(() => import("@/features/courses/StudentCoursesPage"), "StudentCoursesPage")) },
      // 3D Studio: library models (incl. Claude + Blender) + demo scenes (Prinon's viewer).
      { path: "/viewer", element: <Navigate to="/studio" replace /> },
      { path: "/studio", element: page(() => import("@/features/three-d/library/pages/ViewerDemoPage"), "default") },
      { path: "/studio/library/:assetId", element: page(() => import("@/features/three-d/library/pages/ViewerDemoPage"), "default") },
      { path: "/studio/:sceneId", element: page(() => import("@/features/three-d/library/pages/ViewerDemoPage"), "default") },
      // old 3D viewer links keep working
      { path: "/viewer/library/:assetId", element: <LegacyViewerRedirect /> },
      { path: "/viewer/:sceneId", element: <LegacyViewerRedirect /> },
      ] },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
];
