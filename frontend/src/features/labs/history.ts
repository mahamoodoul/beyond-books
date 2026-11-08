/**
 * Undo/redo history for a lab state. Dragging produces many position-only changes; those
 * collapse into the previous entry so one Undo reverts the whole move, not one pixel of it.
 */
export type LabState = Record<string, unknown>;
export interface History<T = LabState> { past: T[]; present: T; future: T[] }

const LIMIT = 100;

/** Same state apart from x/y of items in any list (parts, atoms ...). */
export function positionOnlyChange(a: object, b: object): boolean {
  const strip = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(strip);
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(o).sort()) if (k !== "x" && k !== "y") out[k] = strip(o[k]);
      return out;
    }
    return v;
  };
  return JSON.stringify(strip(a)) === JSON.stringify(strip(b)) && JSON.stringify(a) !== JSON.stringify(b);
}

export function initHistory<T extends object>(present: T): History<T> {
  return { past: [], present, future: [] };
}

export function push<T extends object>(h: History<T>, next: T): History<T> {
  if (positionOnlyChange(h.present, next) && h.past.length > 0 && positionOnlyChange(h.past[h.past.length - 1]!, next)) {
    return { past: h.past, present: next, future: [] }; // mid-drag: keep the entry that started the move
  }
  const past = [...h.past, h.present].slice(-LIMIT);
  return { past, present: next, future: [] };
}

export function undo<T extends object>(h: History<T>): History<T> {
  const prev = h.past[h.past.length - 1];
  if (!prev) return h;
  return { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future] };
}

export function redo<T extends object>(h: History<T>): History<T> {
  const next = h.future[0];
  if (!next) return h;
  return { past: [...h.past, h.present], present: next, future: h.future.slice(1) };
}
