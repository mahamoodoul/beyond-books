import { useEffect, useState } from "react";

export const prefersReducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Seconds since mount, updated every animation frame while `running` (frozen when the user
 *  prefers reduced motion). Drives the animated lab boards; never stored or saved. */
export function useLabClock(running = true): number {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!running || prefersReducedMotion()) return;
    let raf = 0;
    const start = performance.now() - t * 1000;
    const tick = (now: number) => {
      setT((now - start) / 1000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);
  return t;
}
