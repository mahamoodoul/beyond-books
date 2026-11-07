/**
 * Lesson reader help: select 1-3 words in the lesson text, click "Explain with AI", and a panel
 * on the right explains them in the context of the sentence, with images from Wikimedia Commons
 * (openly licensed, credited). Answers are cached on the server per lesson and words.
 */
import { useMutation } from "@tanstack/react-query";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

import { api, errorMessage } from "@/api/client";
import type { JobOut } from "@/api/generated/schema";
import { useJob } from "@/features/jobs/useJob";

const MAX_WORDS = 3;
const MAX_CHARS = 60;

interface Card {
  title: string;
  explanation: string;
  in_this_lesson: string;
  key_points: string[];
  analogy: string;
  image_query: string;
}
interface Picture {
  title: string;
  thumb_url: string;
  full_url: string;
  source_url: string;
  description: string;
  license: string;
  author: string;
}
interface Result {
  words: string;
  sentence: string;
  card: Card;
  images: Picture[];
}

/** 1-3 words of lesson text, or null. */
export function validSelection(text: string): string | null {
  const t = text.replace(/\s+/g, " ").trim().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
  if (!t || t.length > MAX_CHARS) return null;
  return t.split(" ").length <= MAX_WORDS ? t : null;
}

const GAP = 14;
const MIN_DOCK = 340; // narrower than this beside the text: use the default floating panel
const MIN_HEIGHT = 300;

/** Laptop/desktop: dock the panel in all the space right of the reading column (small gap),
 *  vertically only beside the reading area, so it never covers the 3D viewer above the text.
 *  Re-measured on resize and scroll. */
function useDock(reading: RefObject<HTMLElement | null>): CSSProperties | undefined {
  const [style, setStyle] = useState<CSSProperties | undefined>();
  useLayoutEffect(() => {
    const measure = () => {
      const el = reading.current;
      const nav = document.querySelector(".topbar")?.getBoundingClientRect().bottom ?? 72;
      if (!el || window.innerWidth < 900) return setStyle(undefined);
      const rect = el.getBoundingClientRect();
      const left = Math.round(rect.right + GAP);
      const width = window.innerWidth - left - GAP;
      if (width < MIN_DOCK) return setStyle(undefined);
      // Only beside the reading area: never over the 3D viewer above it (or the pager below).
      const top = Math.max(nav + GAP, rect.top);
      let bottom = Math.max(GAP, window.innerHeight - rect.bottom);
      if (window.innerHeight - top - bottom < MIN_HEIGHT) bottom = Math.max(GAP, window.innerHeight - top - MIN_HEIGHT);
      setStyle({ left, right: GAP, width: "auto", top: Math.round(top), bottom: Math.round(bottom) });
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, { passive: true });
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure);
    };
  }, [reading]);
  return style;
}

function Panel({ lessonId, words, onClose, onAsk, reading }: { lessonId: string; words: string; onClose: () => void; onAsk: (w: string) => void; reading: RefObject<HTMLElement | null> }) {
  const dock = useDock(reading);
  const [jobId, setJobId] = useState<string | null>(null);
  const [zoom, setZoom] = useState<Picture | null>(null);
  const start = useMutation({
    mutationFn: () => api.post<JobOut>(`/lessons/${lessonId}/ai/explain-selection`, { text: words }),
    onSuccess: (j) => setJobId(j.id),
  });
  const { mutate } = start;
  const asked = useRef<string | null>(null);
  useEffect(() => {
    if (asked.current === words) return; // React dev mode runs effects twice: ask once
    asked.current = words;
    setJobId(null);
    setZoom(null);
    mutate();
  }, [words, mutate]);
  const job = useJob(jobId);
  const result = job.data?.status === "completed" ? (job.data.result as unknown as Result) : null;
  const failed = start.error ? errorMessage(start.error) : job.data?.status === "failed" ? (job.data.error_message ?? "The AI could not explain this.") : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (zoom) setZoom(null);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom, onClose]);

  return (
    <aside className={`ex-panel ${dock ? "ex-panel-docked" : ""}`} style={dock} role="dialog" aria-label={`Pictures: ${words}`}>
      <header className="ex-head">
        <div>
          <span className="ex-kicker">✦ Pictures</span>
          <h2>{result?.card.title ?? words}</h2>
        </div>
        <button type="button" className="ex-close" onClick={onClose} aria-label="Close">×</button>
      </header>

      <div className="ex-body">
        {failed ? (
          <p className="ex-error" role="alert">{failed}</p>
        ) : !result ? (
          <div className="ex-grid" aria-live="polite" aria-label="Finding pictures">
            {Array.from({ length: 5 }, (_, i) => <div key={i} className={`ex-tile ex-skel ${i === 0 ? "ex-tile-hero" : ""}`} />)}
          </div>
        ) : result.images.length === 0 ? (
          <p className="ex-empty">No pictures found for “{words}”. Try another word.</p>
        ) : (
          <div className="ex-grid">
            {result.images.slice(0, 5).map((img, i) => (
              <button
                key={img.thumb_url}
                type="button"
                className={`ex-tile ${i === 0 ? "ex-tile-hero" : ""}`}
                onClick={() => setZoom(img)}
                title={img.title}
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <img src={img.thumb_url} alt={img.description || img.title} loading="lazy" />
                <span className="ex-tile-cap">{img.title}</span>
              </button>
            ))}
          </div>
        )}
        {result && result.images.length > 0 && <p className="ex-credit">Wikimedia Commons · tap a picture for licence and author</p>}
      </div>

      <form
        className="ex-ask"
        onSubmit={(e) => {
          e.preventDefault();
          const v = validSelection(String(new FormData(e.currentTarget).get("w") ?? ""));
          if (v) onAsk(v);
        }}
      >
        <input name="w" placeholder="Show pictures for another word…" maxLength={MAX_CHARS} aria-label="Explain another word" />
        <button type="submit">Go</button>
      </form>

      {zoom && (
        <div className="ex-zoom" role="dialog" aria-label={zoom.title} onClick={() => setZoom(null)}>
          <figure onClick={(e) => e.stopPropagation()}>
            <img src={zoom.thumb_url} alt={zoom.description || zoom.title} />
            <figcaption>
              <strong>{zoom.title}</strong>
              {zoom.description && <span>{zoom.description}</span>}
              <small>
                {[zoom.author, zoom.license].filter(Boolean).join(" · ")} ·{" "}
                <a href={zoom.source_url || zoom.full_url} target="_blank" rel="noopener noreferrer">Source</a>
              </small>
            </figcaption>
            <button type="button" className="ex-close" onClick={() => setZoom(null)} aria-label="Close image">×</button>
          </figure>
        </div>
      )}
    </aside>
  );
}

/** Wraps the lesson text: shows the "Explain with AI" button for 1-3 selected words. */
export function ExplainSelection({ lessonId, children }: { lessonId: string; children: ReactNode }) {
  const area = useRef<HTMLDivElement>(null);
  const [pick, setPick] = useState<{ text: string; x: number; y: number } | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const read = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount || !area.current) return setPick(null);
    const range = sel.getRangeAt(0);
    if (!area.current.contains(range.commonAncestorContainer)) return setPick(null);
    const text = validSelection(sel.toString());
    if (!text) return setPick(null);
    const r = range.getBoundingClientRect();
    setPick({ text, x: r.left + r.width / 2, y: r.top });
  }, []);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const onChange = () => {
      clearTimeout(t);
      t = setTimeout(read, 180);
    };
    const hide = () => setPick(null);
    document.addEventListener("selectionchange", onChange);
    window.addEventListener("scroll", hide, { passive: true });
    return () => {
      clearTimeout(t);
      document.removeEventListener("selectionchange", onChange);
      window.removeEventListener("scroll", hide);
    };
  }, [read]);

  // outside the transformed lesson page, but inside the theme wrapper (keeps dark-mode colours)
  const host = (area.current?.closest(".theme-root") as HTMLElement | null) ?? document.body;
  // the reading column the panel docks beside (the lesson text, not the sidebar)
  const reading = useRef<HTMLElement | null>(null);
  reading.current = (area.current?.closest(".lesson-content") as HTMLElement | null) ?? area.current;
  const ask = (w: string) => {
    setOpen(w);
    setPick(null);
    window.getSelection()?.removeAllRanges();
  };

  return (
    <div ref={area as RefObject<HTMLDivElement>} className="ex-area">
      {!open && <p className="ex-hint">🖼 Tip: select up to 3 words in the text to see pictures of them.</p>}
      {children}
      {/* Portalled out of the lesson: the lesson page keeps a CSS transform from its entrance animation,
          which would otherwise position these "fixed" elements relative to the page, not the screen. */}
      {pick &&
        createPortal(
          <button
            type="button"
            className="ex-pop"
            style={{ left: pick.x, top: pick.y }}
            onMouseDown={(e) => e.preventDefault()} // keep the selection
            onClick={() => ask(pick.text)}
          >
            🖼 Show pictures of “{pick.text}”
          </button>,
          host,
        )}
      {open && createPortal(<Panel key={open} lessonId={lessonId} words={open} onClose={() => setOpen(null)} onAsk={setOpen} reading={reading} />, host)}
    </div>
  );
}
