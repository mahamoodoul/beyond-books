import { Navigate, createBrowserRouter } from "react-router";

import { AppLayout } from "@/app/layouts/AppLayout";
import { useDemo } from "@/app/providers/DemoProvider";
import { RouteError } from "@/app/router/RouteError";
import { LoginPage } from "@/features/auth/LoginPage";
import { StudentDashboard } from "@/features/dashboard/StudentDashboard";
import { TeacherDashboard } from "@/features/dashboard/TeacherDashboard";
import { CellLessonPage } from "@/features/lessons/CellLessonPage";

function RoleHome() {
  const { role } = useDemo();
  return <Navigate to={role ? `/${role}` : "/login"} replace />;
}

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
      {
        element: <AppLayout />,
        children: [
          { path: "/", element: <RoleHome /> },
          {
            path: "/teacher",
            element: <RolePage role="teacher"><TeacherDashboard /></RolePage>,
          },
          {
            path: "/teacher/courses",
            element: <RolePage role="teacher"><TeacherDashboard /></RolePage>,
          },
          {
            path: "/teacher/insights",
            element: <RolePage role="teacher"><TeacherDashboard /></RolePage>,
          },
          {
            path: "/student",
            element: <RolePage role="student"><StudentDashboard /></RolePage>,
          },
          {
            path: "/student/progress",
            element: <RolePage role="student"><StudentDashboard /></RolePage>,
          },
          {
            path: "/student/courses/:courseId/lessons/:lessonId",
            element: <SignedInPage><CellLessonPage /></SignedInPage>,
          },
        ],
      },
    ],
  },
]);
