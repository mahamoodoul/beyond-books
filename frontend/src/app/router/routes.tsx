import { createBrowserRouter } from "react-router";
import { appRoutes } from "./appRoutes";
// Preserve previously shared /demo links while using the same real API and authentication.
const isDemo = /^\/demo(?:\/|$)/.test(window.location.pathname);
export const router = createBrowserRouter(appRoutes, { basename: isDemo ? "/demo" : "/" });
