import { lazy, Suspense } from "react";
import { Navigate, createBrowserRouter } from "react-router";

import { AppLayout } from "@/app/layouts/AppLayout";
import { useDemo } from "@/app/providers/DemoProvider";
import { RouteError } from "@/app/router/RouteError";
import { LoginPage } from "@/features/auth/LoginPage";
import { AssessmentPage } from "@/features/assessments/AssessmentPage";
import { StudentDashboard } from "@/features/dashboard/StudentDashboard";
import { StudentProgressPage } from "@/features/dashboard/StudentProgressPage";
import { StudentCoursesPage } from "@/features/courses/StudentCoursesPage";
import { TeacherDashboard } from "@/features/dashboard/TeacherDashboard";
import { TeacherAnalyticsPage } from "@/features/dashboard/TeacherAnalyticsPage";
import { TeacherCoursesPage } from "@/features/dashboard/TeacherCoursesPage";
import { CourseReviewPage } from "@/features/courses/CourseReviewPage";
import { TeacherUploadPage } from "@/features/courses/TeacherUploadPage";
import { LandingPage } from "@/features/landing/LandingPage";
import { HeartLessonPage } from "@/features/lessons/HeartLessonPage";
import { CellLessonPage } from "@/features/lessons/CellLessonPage";

const HeartARPage = lazy(() =>
  import("@/features/ar/HeartARPage").then((module) => ({ default: module.HeartARPage })),
);

function RolePage({ role, children }: { role: "teacher" | "student"; children: React.ReactNode }) {
  const { role: currentRole } = useDemo();
  if (!currentRole) return <Navigate to="/login" replace />;
  if (currentRole !== role) return <Navigate to={`/${currentRole}`} replace />;
  return children;
}

function SignedInPage({ children }: { children: React.ReactNode }) {
  const { role } = useDemo();
  if (!role) return <Navigate to="/login" replace />;
  return children;
}

export const router = createBrowserRouter([
  {
    errorElement: <RouteError />,
    children: [
      { path: "/login", element: <LoginPage /> },
      { path: "/", element: <LandingPage /> },
      {
        element: <AppLayout />,
        children: [
          {
            path: "/teacher",
            element: <RolePage role="teacher"><TeacherDashboard /></RolePage>,
          },
          {
            path: "/teacher/courses",
            element: <RolePage role="teacher"><TeacherCoursesPage /></RolePage>,
          },
          {
            path: "/teacher/upload",
            element: <RolePage role="teacher"><TeacherUploadPage /></RolePage>,
          },
          {
            path: "/teacher/courses/:courseId/review",
            element: <RolePage role="teacher"><CourseReviewPage /></RolePage>,
          },
          {
            path: "/teacher/insights",
            element: <RolePage role="teacher"><TeacherAnalyticsPage /></RolePage>,
          },
          {
            path: "/student",
            element: <RolePage role="student"><StudentDashboard /></RolePage>,
          },
          {
            path: "/student/progress",
            element: <RolePage role="student"><StudentProgressPage /></RolePage>,
          },
          {
            path: "/student/courses",
            element: <RolePage role="student"><StudentCoursesPage /></RolePage>,
          },
          {
            path: "/student/courses/cell-biology/lessons/cell-structure",
            element: <RolePage role="student"><CellLessonPage /></RolePage>,
          },
          {
            path: "/student/courses/:courseId/assessment",
            element: <RolePage role="student"><AssessmentPage /></RolePage>,
          },
          {
            path: "/student/courses/:courseId/lessons/:lessonId/ar",
            element: <SignedInPage><Suspense fallback={<p className="page-loading" role="status">Preparing augmented reality…</p>}><HeartARPage /></Suspense></SignedInPage>,
          },
          {
            path: "/student/courses/:courseId/lessons/:lessonId",
            element: <SignedInPage><HeartLessonPage /></SignedInPage>,
          },
        ],
      },
    ],
  },
]);
