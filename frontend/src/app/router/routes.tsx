import { createBrowserRouter } from "react-router";
import { appRoutes } from "./appRoutes";
import { demoRoutes } from "./demoRoutes";

// The demo has its own role and mock data; keep the authenticated app intact.
const isDemo = /^\/demo(?:\/|$)/.test(window.location.pathname);
export const router = createBrowserRouter(isDemo ? demoRoutes : appRoutes, {
  basename: isDemo ? "/demo" : "/",
});
