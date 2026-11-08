import { useEffect, useState } from "react";

/**
 * For horizontal strips that scroll (phone nav, tab bars): marks the element with
 * `data-fade-start` / `data-fade-end` while items are hidden on that side (CSS `.scroll-fade`
 * fades that edge, so it's visible that there is more), and scrolls the active item
 * (`aria-current="page"` or `aria-selected="true"`) into view whenever `activeKey` changes.
 * Returns a callback ref.
 */
export function useScrollFade<T extends HTMLElement>(activeKey?: unknown) {
  const [el, setEl] = useState<T | null>(null);

  useEffect(() => {
    if (!el) return;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      el.toggleAttribute("data-fade-start", el.scrollLeft > 2);
      el.toggleAttribute("data-fade-end", max > 2 && el.scrollLeft < max - 2);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [el]);

  useEffect(() => {
    const active = el?.querySelector<HTMLElement>('[aria-current="page"], [aria-selected="true"]');
    if (!el || !active) return;
    const box = el.getBoundingClientRect();
    const item = active.getBoundingClientRect();
    if (item.left < box.left || item.right > box.right) {
      // horizontal only: scrollIntoView() could also scroll the page
      el.scrollLeft += item.left - box.left - (box.width - item.width) / 2;
    }
  }, [el, activeKey]);

  return setEl;
}
