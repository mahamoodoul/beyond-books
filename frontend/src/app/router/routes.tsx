import { createBrowserRouter, Navigate } from "react-router";

import { AppLayout } from "@/app/layouts/AppLayout";
import { RouteError } from "@/app/router/RouteError";
import { RequireAuth } from "@/features/auth/auth";
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
      { path: "/student", element: student(<StudentDashboard />) },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);
