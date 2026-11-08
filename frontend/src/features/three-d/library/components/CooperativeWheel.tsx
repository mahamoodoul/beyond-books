import { useThree } from "@react-three/fiber";
import { useEffect } from "react";

const MODIFIER = typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.userAgent) ? "⌘" : "Ctrl";

/** True when the page, or a panel around `el`, can scroll: then the wheel belongs to it. */
function canScrollAround(el: HTMLElement): boolean {
  for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
    const { overflowY } = getComputedStyle(n);
    if (/(auto|scroll|overlay)/.test(overflowY) && n.scrollHeight > n.clientHeight + 1) return true;
  }
  const root = document.scrollingElement;
  return !!root && root.scrollHeight > root.clientHeight + 1;
}

/**
 * Wheel over an embedded 3D view scrolls the page; Ctrl/⌘ + wheel (and a trackpad pinch, which
 * browsers send as Ctrl + wheel) zooms. Without this the orbit controls swallow every wheel event
 * and the page can't be scrolled past a large viewer. In fullscreen, or when nothing around the
 * view can scroll, the plain wheel zooms as before. Render inside a <Canvas>.
 */
export function CooperativeWheel() {
  const gl = useThree((s) => s.gl);
  const connected = useThree((s) => s.events.connected) as HTMLElement | null | undefined;

  useEffect(() => {
    const surface = connected ?? gl.domElement.parentElement ?? gl.domElement;
    const outer = surface.parentElement ?? surface;
    let hint: HTMLDivElement | null = null;
    let timer = 0;

    const showHint = () => {
      if (!hint) {
        hint = document.createElement("div");
        hint.className = "viewer-wheel-hint";
        hint.setAttribute("aria-hidden", "true"); // pointer guidance only; keyboard users are unaffected
        hint.textContent = `Hold ${MODIFIER} and scroll to zoom`;
        surface.appendChild(hint);
      }
      hint.dataset.visible = "true";
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (hint) hint.dataset.visible = "false";
      }, 1400);
    };

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) return; // zoom
      const full = document.fullscreenElement;
      if (full?.contains(surface)) return;
      if (!canScrollAround(surface)) return;
      // Capture phase on an ancestor: the orbit controls never see it, so the page scrolls.
      e.stopPropagation();
      showHint();
    };

    outer.addEventListener("wheel", onWheel, { capture: true, passive: true });
    return () => {
      outer.removeEventListener("wheel", onWheel, { capture: true });
      window.clearTimeout(timer);
      hint?.remove();
    };
  }, [gl, connected]);

  return null;
}
