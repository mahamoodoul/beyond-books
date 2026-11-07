/**
 * Visual, interactive lesson reading, for any subject and with no extra AI calls. It is built
 * from the lesson's own structure:
 * - LessonJourney: sticky map of the lesson's parts, with reading progress and jump links
 * - VisualMarkdown: numbered lists -> step timeline, bullet lists -> cards, "Picture/Imagine..."
 *   -> picture-this callouts, "For example" -> example callouts, quotes -> tips, bold key terms
 *   -> highlightable terms
 * - ConceptMap: the part's topic in the centre with its key terms around it (click = highlight)
 * - TermFlashcards: flip cards from the key terms, the back is the sentence that explains it
 * - Takeaways: summary points revealed one at a time
 */
import { Children, isValidElement, useEffect, useMemo, useState, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";

export interface Section {
  title: string;
  body_markdown: string;
  key_terms?: string[];
}

const plain = (md: string) => md.replace(/\*\*|__|\*|_|`|#+\s/g, "");
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export const readMinutes = (md: string) => Math.max(1, Math.round(plain(md).split(/\s+/).length / 200));

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return "";
}

const CALLOUTS: { test: RegExp; icon: string; label: string; tone: string }[] = [
  { test: /^(picture|imagine|think of|think about|visuali[sz]e)\b/i, icon: "🖼", label: "Picture this", tone: "picture" },
  { test: /^(for example|for instance|e\.g\.)/i, icon: "🔎", label: "Example", tone: "example" },
  { test: /^(remember|note|important|key idea|tip)\b/i, icon: "💡", label: "Remember", tone: "tip" },
  { test: /^(did you know|fun fact|interestingly)\b/i, icon: "✨", label: "Did you know?", tone: "fact" },
];

/** Lesson markdown with visual building blocks. `activeTerm` highlights matching bold terms. */
export function VisualMarkdown({
  markdown,
  activeTerm,
  onTerm,
  terms = [],
}: {
  markdown: string;
  activeTerm?: string | null;
  onTerm?: (term: string) => void;
  terms?: string[];
}) {
  const known = useMemo(() => new Map(terms.map((t) => [norm(t), t])), [terms]);
  const components: Components = useMemo(
    () => ({
      p({ children }) {
        const text = textOf(children).trim();
        const c = CALLOUTS.find((x) => x.test.test(text));
        if (!c) return <p>{children}</p>;
        return (
          <div className={`lv-callout lv-callout-${c.tone}`}>
            <span className="lv-callout-icon" aria-hidden>{c.icon}</span>
            <div>
              <span className="lv-callout-label">{c.label}</span>
              <p>{children}</p>
            </div>
          </div>
        );
      },
      ol({ children }) {
        return <ol className="lv-steps">{children}</ol>;
      },
      ul({ children }) {
        const items = Children.toArray(children).filter(isValidElement);
        return <ul className={`lv-cards ${items.length <= 2 ? "lv-cards-wide" : ""}`}>{children}</ul>;
      },
      blockquote({ children }) {
        return (
          <div className="lv-callout lv-callout-tip">
            <span className="lv-callout-icon" aria-hidden>💡</span>
            <div>{children}</div>
          </div>
        );
      },
      strong({ children }) {
        const text = textOf(children);
        const n = norm(text);
        const term = known.get(n) ?? (n.length >= 3 ? [...known.values()].find((k) => norm(k).length >= 3 && (n.includes(norm(k)) || norm(k).includes(n))) : undefined);
        if (!term) return <strong>{children}</strong>;
        const active = activeTerm && norm(activeTerm) === norm(term);
        return (
          <button type="button" className={`lv-term ${active ? "lv-term-active" : ""}`} onClick={() => onTerm?.(term)} title={`Key term: ${term}`}>
            {children}
          </button>
        );
      },
      table({ children }) {
        return <div className="lv-table"><table>{children}</table></div>;
      },
    }),
    [known, activeTerm, onTerm],
  );
  return <ReactMarkdown skipHtml components={components}>{markdown}</ReactMarkdown>;
}

/** Topic in the middle, key terms around it. */
export function ConceptMap({ title, terms, active, onTerm }: { title: string; terms: string[]; active?: string | null; onTerm: (t: string) => void }) {
  const nodes = terms.slice(0, 8);
  if (nodes.length < 2) return null;
  const W = 640, H = 300, cx = W / 2, cy = H / 2, rx = 235, ry = 105;
  const pos = nodes.map((_, i) => {
    const a = (i / nodes.length) * Math.PI * 2 - Math.PI / 2;
    return { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) };
  });
  const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
  return (
    <figure className="lv-map" aria-label={`Concept map: ${title}`}>
      <figcaption>Concept map · tap a term to find it in the text</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="group">
        {pos.map((p, i) => (
          <line key={`l${i}`} x1={cx} y1={cy} x2={p.x} y2={p.y} className={`lv-map-line ${active === nodes[i] ? "lv-map-line-active" : ""}`} />
        ))}
        <g className="lv-map-center">
          <rect x={cx - 110} y={cy - 26} width={220} height={52} rx={26} />
          <text x={cx} y={cy + 5} textAnchor="middle">{short(title, 30)}</text>
        </g>
        {nodes.map((t, i) => {
          const p = pos[i] as { x: number; y: number };
          const w = Math.min(170, 26 + short(t, 22).length * 7.4);
          return (
            <g
              key={t}
              className={`lv-map-node ${active === t ? "lv-map-node-active" : ""}`}
              role="button"
              tabIndex={0}
              aria-pressed={active === t}
              onClick={() => onTerm(t)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onTerm(t))}
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <rect x={p.x - w / 2} y={p.y - 17} width={w} height={34} rx={17} />
              <text x={p.x} y={p.y + 5} textAnchor="middle">{short(t, 22)}</text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

/** Sticky lesson map: which part you are reading, which you have seen, jump to any part. */
export function LessonJourney({ sections, ids }: { sections: Section[]; ids: string[] }) {
  const [current, setCurrent] = useState(0);
  const [seen, setSeen] = useState<Set<number>>(new Set());
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const els = ids.map((id) => document.getElementById(id)).filter((e): e is HTMLElement => !!e);
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const i = ids.indexOf(e.target.id);
          setCurrent(i);
          setSeen((s) => (s.has(i) ? s : new Set(s).add(i)));
        }
      },
      { rootMargin: "-35% 0px -55% 0px" },
    );
    els.forEach((e) => io.observe(e));
    const onScroll = () => {
      const first = els[0], last = els[els.length - 1];
      if (!first || !last) return;
      const start = first.getBoundingClientRect().top + window.scrollY - 200;
      const end = last.getBoundingClientRect().bottom + window.scrollY - window.innerHeight * 0.6;
      setProgress(Math.min(100, Math.max(0, ((window.scrollY - start) / Math.max(1, end - start)) * 100)));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, [ids]);
  if (sections.length < 2) return null;
  return (
    <nav className="lv-journey" aria-label="Lesson parts">
      <div className="lv-journey-steps">
        {sections.map((s, i) => (
          <a
            key={ids[i]}
            href={`#${ids[i]}`}
            className={`lv-journey-step ${i === current ? "is-current" : ""} ${seen.has(i) && i !== current ? "is-seen" : ""}`}
            aria-current={i === current ? "step" : undefined}
            onClick={(e) => {
              e.preventDefault();
              document.getElementById(ids[i] ?? "")?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          >
            <span className="lv-journey-dot">{seen.has(i) && i !== current ? "✓" : i + 1}</span>
            <span className="lv-journey-label">{s.title}</span>
          </a>
        ))}
      </div>
      <div className="lv-journey-bar" aria-hidden><span style={{ width: `${progress}%` }} /></div>
    </nav>
  );
}

const DECK_THEMES = ["lv-deck-violet", "lv-deck-teal", "lv-deck-sunset", "lv-deck-ocean", "lv-deck-rose"];

/** Study deck: key term on the front, the lesson sentence that explains it on the back.
 *  Flip (tap / Space), swipe off with "Got it" or "Again", shuffle, study missed cards again. */
export function TermFlashcards({ sections }: { sections: Section[] }) {
  const all = useMemo(() => {
    const out: { term: string; back: string; part: string }[] = [];
    const seen = new Set<string>();
    for (const s of sections) {
      const sentences = plain(s.body_markdown).replace(/\n+/g, " ").split(/(?<=[.!?])\s+/);
      for (const term of s.key_terms ?? []) {
        if (seen.has(norm(term))) continue;
        const hit = sentences.find((x) => norm(x).includes(norm(term)) && x.length > term.length + 12);
        if (!hit) continue;
        seen.add(norm(term));
        out.push({ term, back: hit.trim(), part: s.title });
      }
    }
    return out.slice(0, 24);
  }, [sections]);
  const [order, setOrder] = useState<number[]>(() => all.map((_, n) => n));
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState<Set<number>>(new Set());
  const [leaving, setLeaving] = useState<"left" | "right" | null>(null);
  useEffect(() => setOrder(all.map((_, n) => n)), [all]);

  const done = pos >= order.length;
  const cardIndex = order[pos] ?? 0;
  const card = all[cardIndex];
  const answer = (ok: boolean) => {
    if (done || leaving) return;
    setKnown((k) => {
      const n = new Set(k);
      if (ok) n.add(cardIndex);
      else n.delete(cardIndex);
      return n;
    });
    setLeaving(ok ? "right" : "left");
    window.setTimeout(() => {
      setLeaving(null);
      setFlipped(false);
      setPos((p) => p + 1);
    }, 280);
  };
  const restart = (cards: number[]) => {
    setOrder(cards);
    setPos(0);
    setFlipped(false);
  };
  const shuffle = () => restart([...order].sort(() => Math.random() - 0.5));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.getElementById("lv-flash");
      if (!el || (e.target as HTMLElement | null)?.closest("input, textarea")) return;
      const r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) return; // only while the deck is on screen
      if (e.key === " " && !done) { e.preventDefault(); setFlipped((f) => !f); }
      else if (e.key === "ArrowRight") answer(true);
      else if (e.key === "ArrowLeft") answer(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  if (all.length < 2) return null;
  const missed = all.map((_, n) => n).filter((n) => !known.has(n));
  const progress = Math.round((Math.min(pos, order.length) / Math.max(1, order.length)) * 100);

  return (
    <section id="lv-flash" className="lv-flash" aria-labelledby="lv-flash-title">
      <div className="lv-flash-head">
        <div>
          <span className="lv-flash-kicker">✦ Practice</span>
          <h2 id="lv-flash-title">Flashcards</h2>
          <p>{all.length} key terms from this lesson. Flip, then tell yourself honestly.</p>
        </div>
        <div className="lv-flash-meter" aria-label={`${known.size} of ${all.length} known`}>
          <strong>{known.size}</strong><span>/ {all.length} known</span>
        </div>
      </div>
      <div className="lv-flash-progress" aria-hidden><span style={{ width: `${progress}%` }} /></div>

      {!done && card ? (
        <>
          <div className="lv-deck">
            {order.slice(pos + 1, pos + 3).map((n, k) => (
              <span key={n} className={`lv-deck-back ${DECK_THEMES[n % DECK_THEMES.length]}`} style={{ transform: `translateY(${(k + 1) * 10}px) scale(${1 - (k + 1) * 0.04})`, zIndex: 2 - k }} aria-hidden />
            ))}
            <button
              key={cardIndex}
              type="button"
              className={`lv-card ${flipped ? "is-flipped" : ""} ${leaving ? `is-leaving-${leaving}` : ""}`}
              onClick={() => setFlipped((f) => !f)}
              aria-label={flipped ? `Explanation of ${card.term}. Tap to see the term.` : `${card.term}. Tap to see the explanation.`}
            >
              <span className="lv-card-inner">
                <span className={`lv-card-face lv-card-front ${DECK_THEMES[cardIndex % DECK_THEMES.length]}`}>
                  <small>{pos + 1} / {order.length} · {card.part}</small>
                  <strong>{card.term}</strong>
                  <em>Tap or press Space to flip ↻</em>
                </span>
                <span className="lv-card-face lv-card-back">
                  <small>{card.term}</small>
                  <span>{card.back}</span>
                </span>
              </span>
            </button>
          </div>
          <div className="lv-flash-actions">
            <button type="button" className="lv-answer lv-answer-again" onClick={() => answer(false)}>
              <span aria-hidden>↻</span> Again <kbd>←</kbd>
            </button>
            <button type="button" className="lv-icon-btn" onClick={shuffle} title="Shuffle" aria-label="Shuffle the cards">⤨</button>
            <button type="button" className="lv-answer lv-answer-ok" onClick={() => answer(true)}>
              <span aria-hidden>✓</span> Got it <kbd>→</kbd>
            </button>
          </div>
        </>
      ) : (
        <div className="lv-flash-done">
          <span className="lv-flash-trophy" aria-hidden>{missed.length === 0 ? "🏆" : "🌱"}</span>
          <h3>{missed.length === 0 ? "You know them all!" : `${known.size} of ${all.length} known`}</h3>
          <p>{missed.length === 0 ? "Every key term in this lesson. Great job." : `${missed.length} term${missed.length === 1 ? "" : "s"} to practise again.`}</p>
          <div className="lv-flash-actions">
            {missed.length > 0 && <button type="button" className="lv-answer lv-answer-ok" onClick={() => restart(missed)}>Practise the {missed.length} missed</button>}
            <button type="button" className="lv-answer lv-answer-again" onClick={() => { setKnown(new Set()); restart(all.map((_, n) => n)); }}>Start over</button>
          </div>
        </div>
      )}
    </section>
  );
}

/** "The short version": takeaways revealed one at a time. */
export function Takeaways({ points, headerExtra, reading = false }: { points: string[]; headerExtra?: ReactNode; reading?: boolean }) {
  const [shown, setShown] = useState(1);
  // Reading the takeaways aloud reveals them all, so the text matches the voice.
  useEffect(() => {
    if (reading) setShown(points.length);
  }, [reading, points.length]);
  if (!points.length) return null;
  const all = shown >= points.length;
  return (
    <section aria-labelledby="lesson-summary" className={`lv-takeaways${reading ? " ring-2 ring-[#38b2ac] ring-offset-2 rounded-2xl" : ""}`}>
      <div className="lv-flash-head">
        <div>
          <span className="eyebrow">KEY TAKEAWAYS</span>
          <h2 id="lesson-summary">The short version</h2>
        </div>
        <div className="flex items-center gap-2">
          {headerExtra}
          {!all && <button type="button" className="lv-link" onClick={() => setShown(points.length)}>Show all</button>}
        </div>
      </div>
      <ol>
        {points.slice(0, shown).map((p, i) => (
          <li key={i} style={{ animationDelay: i === shown - 1 ? "0ms" : undefined }}>
            <span className="lv-takeaway-num">{i + 1}</span>
            <span>{p}</span>
          </li>
        ))}
      </ol>
      {!all && (
        <button type="button" className="button button-primary lv-reveal" onClick={() => setShown((n) => n + 1)}>
          Reveal takeaway {shown + 1} of {points.length}
        </button>
      )}
    </section>
  );
}

const PART_ICONS = ["📘", "🧩", "💡", "🔬", "🧭", "⚙️", "🌍", "🎯"];

/** One lesson part: header with reading time, visual text, concept map, key terms and sources. */
export function LessonPart({
  section,
  index,
  id,
  sourceRefs = [],
  headerExtra,
  reading = false,
}: {
  section: Section;
  index: number;
  id: string;
  sourceRefs?: { page: number }[];
  /** Extra controls in the header, e.g. a Listen button. */
  headerExtra?: ReactNode;
  /** Highlight the card while the voice reads it. */
  reading?: boolean;
}) {
  const [active, setActive] = useState<string | null>(null);
  const [map, setMap] = useState(false);
  const terms = section.key_terms ?? [];
  const toggle = (t: string) => {
    setActive((a) => (a === t ? null : t));
    // bring the first occurrence into view
    requestAnimationFrame(() => document.querySelector(`#${id} .lv-term-active`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };
  const hasMap = terms.length >= 2;
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={`lesson-card panel lv-part${reading ? " ring-2 ring-[#38b2ac] ring-offset-2" : ""}`} style={{ scrollMarginTop: 150 }}>
      <div className="lv-part-head">
        <span className={`lv-part-icon lv-part-icon-${index % 4}`} aria-hidden>{PART_ICONS[index % PART_ICONS.length]}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span className="lv-part-meta">Part {index + 1} · {readMinutes(section.body_markdown)} min read</span>
          <h2 id={`${id}-title`}>{section.title}</h2>
        </div>
        {headerExtra}
        {hasMap && (
          <button type="button" className={`lv-map-toggle ${map ? "is-on" : ""}`} aria-expanded={map} onClick={() => setMap((m) => !m)}>
            <span aria-hidden>◎</span> {map ? "Hide map" : "Concept map"}
          </button>
        )}
      </div>
      {map && <ConceptMap title={section.title} terms={terms} active={active} onTerm={toggle} />}
      <div className="lesson-prose lv-prose">
        <VisualMarkdown markdown={section.body_markdown} terms={terms} activeTerm={active} onTerm={toggle} />
      </div>
      {(terms.length > 0 || sourceRefs.length > 0) && (
        <div className="lv-foot">
          {terms.length > 0 && <span className="lv-foot-label">Key terms</span>}
          {terms.map((k) => (
            <button key={k} type="button" className={`lv-chip ${active === k ? "is-active" : ""}`} aria-pressed={active === k} onClick={() => toggle(k)}>{k}</button>
          ))}
          {sourceRefs.length > 0 && <span className="lv-source">📄 Textbook p. {sourceRefs.map((r) => r.page).join(", ")}</span>}
        </div>
      )}
    </section>
  );
}
