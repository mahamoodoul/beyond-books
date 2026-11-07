import { createBrowserRouter, Navigate } from "react-router";

import { AppLayout } from "@/app/layouts/AppLayout";
import { RouteError } from "@/app/router/RouteError";
import { RequireAuth } from "@/features/auth/auth";
import { ChapterPage } from "@/features/chapters/ChapterPage";
import { CoursePage } from "@/features/courses/CoursePage";
import { LessonEditorPage } from "@/features/lessons/LessonEditorPage";
import { AssetsPage } from "@/features/three-d/AssetsPage";
import { LoginPage } from "@/features/auth/LoginPage";
import { RegisterPage } from "@/features/auth/RegisterPage";
import { HomePage } from "@/features/dashboard/HomePage";
import { StudentDashboard } from "@/features/dashboard/StudentDashboard";
import { TeacherDashboard } from "@/features/dashboard/TeacherDashboard";

const teacher = (el: React.ReactNode) => <RequireAuth role="teacher">{el}</RequireAuth>;
const student = (el: React.ReactNode) => <RequireAuth role="student">{el}</RequireAuth>;

export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    errorElement: <RouteError />,
    children: [
      { path: "/", element: <HomePage /> },
      { path: "/login", element: <LoginPage /> },
      { path: "/register", element: <RegisterPage /> },
      { path: "/teacher", element: teacher(<TeacherDashboard />) },
      { path: "/teacher/courses/:courseId", element: teacher(<CoursePage />) },
      { path: "/teacher/chapters/:chapterId", element: teacher(<ChapterPage />) },
      { path: "/teacher/lessons/:lessonId", element: teacher(<LessonEditorPage />) },
      { path: "/teacher/assets", element: teacher(<AssetsPage />) },
      { path: "/student", element: student(<StudentDashboard />) },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);
