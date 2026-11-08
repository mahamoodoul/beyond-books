import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router";

const SITE = "Beyond Books";

/** The current page's name: an explicit `data-page-title`, else its first <h1>. */
function pageName(): string | null {
  const explicit = document.querySelector("[data-page-title]")?.getAttribute("data-page-title");
  if (explicit) return explicit;
  return document.querySelector("h1")?.textContent?.replace(/\s+/g, " ").trim() || null;
}

/** The element the skip link and route changes move focus to. */
function mainContent(): HTMLElement | null {
  const main = document.getElementById("main-content") ?? document.querySelector("main");
  if (main && !main.hasAttribute("tabindex")) main.setAttribute("tabindex", "-1");
  return main;
}

/**
 * Client-side navigation is silent for screen readers and keeps the old tab title. After each
 * route change this names the browser tab after the new page ("My courses · Beyond Books"),
 * announces the page in a polite live region, and moves focus to the main content, so the next
 * Tab starts in the new page rather than on the link that was just used.
 */
export function RouteAnnouncer() {
  const { pathname } = useLocation();
  const [message, setMessage] = useState("");
  const firstLoad = useRef(true);

  useEffect(() => {
    let tries = 0;
    let timer = 0;
    const settle = () => {
      const loading = !!document.querySelector('main [role="status"]')?.textContent?.startsWith("Loading");
      const name = pageName();
      // lazy pages show a loading state first: wait (up to ~3 s) for the real page
      if ((!name || loading) && tries++ < 20) {
        timer = window.setTimeout(settle, 150);
        return;
      }
      document.title = name ? `${name} · ${SITE}` : SITE;
      if (firstLoad.current) {
        firstLoad.current = false; // a full page load is announced by the browser itself
        return;
      }
      setMessage(name ?? SITE);
      mainContent()?.focus({ preventScroll: true });
    };
    timer = window.setTimeout(settle, 0);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  return (
    <p className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
      {message}
    </p>
  );
}

/** First focusable element on every page: jumps keyboard users past the navigation. */
export function SkipLink() {
  return (
    <a
      className="skip-link"
      href="#main-content"
      onClick={(e) => {
        const main = mainContent();
        if (!main) return;
        e.preventDefault();
        main.focus();
      }}
    >
      Skip to main content
    </a>
  );
}
