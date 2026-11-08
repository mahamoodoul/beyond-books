import { useEffect, useState } from "react";

/**
 * Keyboard behaviour for a role="tablist" (the WAI-ARIA tabs pattern): the whole list is one Tab
 * stop (the selected tab), Left/Right (also Up/Down) select the previous/next tab and Home/End the
 * first/last; selection follows focus. Works with any tabs rendered as role="tab" with
 * aria-selected. Returns a callback ref for the tablist element.
 */
export function useRovingTabs<T extends HTMLElement>() {
  const [list, setList] = useState<T | null>(null);

  useEffect(() => {
    if (!list) return;
    const tabs = () =>
      [...list.querySelectorAll<HTMLElement>('[role="tab"]')].filter((t) => !t.hasAttribute("disabled"));
    const sync = () => {
      const all = tabs();
      const selected = all.find((t) => t.getAttribute("aria-selected") === "true") ?? all[0];
      for (const t of all) {
        const index = t === selected ? 0 : -1;
        if (t.tabIndex !== index) t.tabIndex = index;
      }
    };
    const onKey = (e: KeyboardEvent) => {
      const all = tabs();
      const i = all.indexOf(e.target as HTMLElement);
      if (i < 0) return;
      const moves: Record<string, number> = {
        ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: all.length - 1,
      };
      const move = moves[e.key];
      if (move === undefined) return;
      const next = all[(move + all.length) % all.length];
      if (!next) return;
      e.preventDefault();
      next.focus();
      next.click();
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(list, { subtree: true, childList: true, attributes: true, attributeFilter: ["aria-selected"] });
    list.addEventListener("keydown", onKey);
    return () => {
      observer.disconnect();
      list.removeEventListener("keydown", onKey);
    };
  }, [list]);

  return setList;
}
