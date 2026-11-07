import { lazy, Suspense } from "react";
import { createBrowserRouter } from "react-router";

import { AppLayout } from "@/app/layouts/AppLayout";
import { RouteError } from "@/app/router/RouteError";
import { HomePage } from "@/features/dashboard/HomePage";
import { PlaceholderPage } from "@/features/dashboard/PlaceholderPage";

// three.js is only downloaded when a 3D page is opened (design §7.7).
const ViewerDemoPage = lazy(() => import("@/features/three-d/pages/ViewerDemoPage"));
const viewer = (
  <Suspense fallback={<p className="text-slate-600">Loading 3D viewer…</p>}>
    <ViewerDemoPage />
  </Suspense>
);

export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    errorElement: <RouteError />,
    children: [
      { path: "/", element: <HomePage /> },
      { path: "/viewer", element: viewer },
      { path: "/viewer/:sceneId", element: viewer },
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
