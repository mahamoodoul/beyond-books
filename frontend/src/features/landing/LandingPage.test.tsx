import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

import { LandingPage } from "./LandingPage";

const demoMode = vi.hoisted(() => ({ enabled: true }));
vi.mock("@/features/auth/auth", () => ({ useDemoMode: () => ({ enabled: demoMode.enabled, pending: false }) }));
vi.mock("@/app/providers/PreferencesProvider", () => ({ usePreferences: () => ({ theme: "light", toggleTheme: () => {} }) }));
vi.mock("./HeroSubjects", () => ({
  HeartTurntable: () => null,
  HeroSubjects: () => null,
  usePrefersReducedMotion: () => true,
}));

const hrefs = () =>
  [...renderToStaticMarkup(<MemoryRouter><LandingPage /></MemoryRouter>).matchAll(/href="([^"]*)"/g)].map((m) => m[1]);

describe("LandingPage entry buttons", () => {
  it("goes straight to the portals in demo mode, with no sign-in links", () => {
    demoMode.enabled = true;
    const links = hrefs();
    expect(links).toEqual(expect.arrayContaining(["/teacher", "/student"]));
    expect(links.filter((h) => h?.startsWith("/login") || h === "/register")).toEqual([]);
  });

  it("keeps sign-in and registration when demo mode is off", () => {
    demoMode.enabled = false;
    expect(hrefs()).toEqual(expect.arrayContaining(["/login", "/register", "/login?role=teacher", "/login?role=student"]));
  });
});
