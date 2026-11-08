/**
 * Full-screen lab playground. Uses the browser Fullscreen API on the lab area (board, feedback,
 * step guide); where it is missing (e.g. iPad Safari) the area is pinned over the whole window
 * instead. Esc leaves either mode.
 */
import { useCallback, useEffect, useState, type RefObject } from "react";

import { Icon } from "@/components/ui/Icon";

import "./labs-sci.css";

export function useFullscreen(ref: RefObject<HTMLElement | null>): { on: boolean; toggle: () => void } {
  const [native, setNative] = useState(false);
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    const onChange = () => setNative(!!document.fullscreenElement && document.fullscreenElement === ref.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [ref]);

  useEffect(() => {
    if (!pinned) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPinned(false);
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [pinned]);

  const toggle = useCallback(() => {
    if (native) return void document.exitFullscreen?.();
    if (pinned) return setPinned(false);
    const el = ref.current;
    if (el && document.fullscreenEnabled && el.requestFullscreen) {
      el.requestFullscreen().catch(() => setPinned(true));
    } else {
      setPinned(true);
    }
  }, [native, pinned, ref]);

  return { on: native || pinned, toggle };
}

export function FullscreenButton({ on, toggle, className }: { on: boolean; toggle: () => void; className?: string }) {
  return (
    <button type="button" onClick={toggle} className={className} title={on ? "Exit full screen (Esc)" : "Full screen"} aria-pressed={on}>
      <Icon name={on ? "shrink" : "expand"} size={14} /> {on ? "Exit full screen" : "Full screen"}
    </button>
  );
}
