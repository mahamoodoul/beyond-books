import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";

import { AppProviders } from "@/app/providers/AppProviders";
import { router } from "@/app/router/routes";
import "@/styles/index.css";

// Development only: `__a11yAudit()` in the browser console (docs/ACCESSIBILITY.md).
if (import.meta.env.DEV) void import("@/dev/a11yAudit").then((m) => m.installA11yAudit());

const root = document.getElementById("root");
if (!root) throw new Error("#root element missing");

createRoot(root).render(
  <StrictMode>
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
);
