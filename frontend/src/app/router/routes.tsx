import { createBrowserRouter } from "react-router";

import { AppLayout } from "@/app/layouts/AppLayout";
import { RouteError } from "@/app/router/RouteError";
import { HomePage } from "@/features/dashboard/HomePage";
import { PlaceholderPage } from "@/features/dashboard/PlaceholderPage";

export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    errorElement: <RouteError />,
    children: [
      { path: "/", element: <HomePage /> },
      {
        path: "/teacher",
        element: <PlaceholderPage title="Teacher dashboard" phase="Phase 2 — courses & documents" />,
      },
      {
        path: "/student",
        element: <PlaceholderPage title="Student dashboard" phase="Phase 7 — student learning" />,
      },
    ],
  },
]);
