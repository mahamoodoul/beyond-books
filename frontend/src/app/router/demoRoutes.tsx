import { lazy, Suspense } from "react";
import { Navigate } from "react-router";

import { DemoAppLayout } from "@/app/layouts/DemoAppLayout";
import { useDemo } from "@/app/providers/DemoProvider";
import { RouteError } from "@/app/router/RouteError";
import { DemoLoginPage } from "@/features/auth/DemoLoginPage";
import { AssessmentPage } from "@/features/assessments/AssessmentPage";
import { DemoStudentDashboard } from "@/features/dashboard/DemoStudentDashboard";
import { StudentProgressPage } from "@/features/dashboard/StudentProgressPage";
import { DemoTeacherDashboard } from "@/features/dashboard/DemoTeacherDashboard";
import { TeacherAnalyticsPage } from "@/features/dashboard/TeacherAnalyticsPage";
import { TeacherCoursesPage } from "@/features/dashboard/TeacherCoursesPage";
import { CourseReviewPage } from "@/features/courses/CourseReviewPage";
import { TeacherUploadPage } from "@/features/courses/TeacherUploadPage";
import { LandingPage } from "@/features/landing/LandingPage";
import { HeartLessonPage } from "@/features/lessons/HeartLessonPage";

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

export const demoRoutes = [
  {
    errorElement: <RouteError />,
    children: [
      { path: "/login", element: <DemoLoginPage /> },
      { path: "/", element: <LandingPage /> },
      {
        element: <DemoAppLayout />,
        children: [
          {
            path: "/teacher",
            element: <RolePage role="teacher"><DemoTeacherDashboard /></RolePage>,
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
            element: <RolePage role="student"><DemoStudentDashboard /></RolePage>,
          },
          {
            path: "/student/progress",
            element: <RolePage role="student"><StudentProgressPage /></RolePage>,
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
];
