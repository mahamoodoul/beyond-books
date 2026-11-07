/**
 * Minimal chart primitives (dataviz skill rules): single-hue blue for magnitude, thin 8px bars
 * with a 4px rounded data-end and square baseline, values always printed as text in ink colour,
 * hover/focus tooltips, and a status palette that always carries an icon + label.
 */
import type { ReactNode } from "react";

export const SEQ = "#2a78d6"; // blue 450
export const SEQ_TRACK = "#cde2fb"; // blue 100 (lighter step of the same ramp)
export const STATUS = {
  gap: { color: "#d03b3b", label: "Gap", icon: "▲" },
  developing: { color: "#fab219", label: "Developing", icon: "◆" },
  mastered: { color: "#0ca30c", label: "Mastered", icon: "●" },
} as const;

const pct = (v: number | null | undefined) => (v == null ? "—" : `${Math.round(v * 100)}%`);

export function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-sm text-slate-600">{label}</p>
      <p className="mt-1 text-3xl font-semibold text-slate-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

/** One row per item; bar = rate (0–1). The printed value doubles as the table view. */
export function RateBars({
  rows,
  emptyLabel = "No data yet",
}: {
  rows: { id: string; label: ReactNode; rate: number | null; detail?: string }[];
  emptyLabel?: string;
}) {
  if (!rows.length) return <p className="text-sm text-slate-500">{emptyLabel}</p>;
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.id} className="group relative grid grid-cols-[minmax(0,1fr)_8rem_3rem] items-center gap-3 text-sm" tabIndex={0}
          aria-label={`${typeof r.label === "string" ? r.label : ""} ${pct(r.rate)}${r.detail ? `, ${r.detail}` : ""}`}>
          <span className="truncate text-slate-800">{r.label}</span>
          <span className="block h-2 overflow-hidden rounded-r-[4px] bg-[var(--track)]" style={{ ["--track" as string]: SEQ_TRACK }}>
            {r.rate != null && <span className="block h-full rounded-r-[4px]" style={{ width: `${Math.max(0, Math.min(1, r.rate)) * 100}%`, background: SEQ }} />}
          </span>
          <span className="text-right tabular-nums text-slate-700">{pct(r.rate)}</span>
          {r.detail && (
            <span role="tooltip" className="pointer-events-none absolute right-0 top-full z-10 mt-1 hidden rounded bg-slate-900 px-2 py-1 text-xs text-white shadow group-hover:block group-focus:block">
              {r.detail}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Thin segmented bar (gap / developing / mastered) with a legend that names and counts parts. */
export function MasteryBar({ gaps, developing, mastered }: { gaps: number; developing: number; mastered: number }) {
  const total = gaps + developing + mastered;
  const parts = [
    { key: "gap", n: gaps },
    { key: "developing", n: developing },
    { key: "mastered", n: mastered },
  ] as const;
  if (!total) return <span className="text-xs text-slate-500">No graded evidence yet</span>;
  return (
    <div>
      <div className="flex h-2 gap-[2px]" role="img"
        aria-label={parts.map((p) => `${STATUS[p.key].label} ${p.n}`).join(", ")}>
        {parts.filter((p) => p.n > 0).map((p) => (
          <span key={p.key} title={`${STATUS[p.key].label}: ${p.n} of ${total}`} className="h-full rounded-full"
            style={{ width: `${(p.n / total) * 100}%`, background: STATUS[p.key].color }} />
        ))}
      </div>
      <p className="mt-1 flex flex-wrap gap-3 text-xs text-slate-700">
        {parts.map((p) => (
          <span key={p.key}><span aria-hidden style={{ color: STATUS[p.key].color }}>{STATUS[p.key].icon}</span> {STATUS[p.key].label} {p.n}</span>
        ))}
      </p>
    </div>
  );
}

export { pct };
