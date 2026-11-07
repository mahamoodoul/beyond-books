/**
 * Exploded-view layout. Each component moves by `amount * offset` (amount 0..1).
 *
 * Offsets come from asset metadata (`explode_offset`) when authored. Otherwise:
 *  - components away from the centre move outward along their direction from the centre;
 *  - concentric components (shells such as a cell wall around a membrane) peel back along -Z,
 *    biggest furthest, so nested layers separate instead of staying stacked.
 */
import type { Vec3 } from "./types";

export interface ComponentBounds {
  id: string;
  center: Vec3;
  size: Vec3;
}

export function computeExplodeOffsets(
  items: readonly ComponentBounds[],
  authored: Readonly<Record<string, Vec3 | undefined>> = {},
  spread = 1,
): Record<string, Vec3> {
  const out: Record<string, Vec3> = {};
  if (items.length === 0) return out;

  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const it of items) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k]!, it.center[k]! - it.size[k]! / 2);
      max[k] = Math.max(max[k]!, it.center[k]! + it.size[k]! / 2);
    }
  }
  const mid: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const radius = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2 || 1;

  const central: ComponentBounds[] = [];
  for (const it of items) {
    const given = authored[it.id];
    if (given) {
      out[it.id] = [given[0] * spread, given[1] * spread, given[2] * spread];
      continue;
    }
    const d: Vec3 = [it.center[0] - mid[0], it.center[1] - mid[1], it.center[2] - mid[2]];
    const len = Math.hypot(...d);
    if (len < radius * 0.12) {
      central.push(it);
      continue;
    }
    const push = (radius * 0.8 + len * 0.6) * spread;
    out[it.id] = [(d[0] / len) * push, (d[1] / len) * push, (d[2] / len) * push];
  }

  // Concentric layers: smallest stays, each larger one steps further back and slightly up.
  const volume = (b: ComponentBounds) => b.size[0] * b.size[1] * b.size[2];
  central.sort((a, b) => volume(a) - volume(b));
  central.forEach((it, rank) => {
    out[it.id] = [0, rank * radius * 0.25 * spread, -rank * radius * 1.1 * spread];
  });
  return out;
}

/** Union bounds after applying offsets at `amount`, for fitting the camera. */
export function explodedBounds(
  items: readonly ComponentBounds[],
  offsets: Readonly<Record<string, Vec3>>,
  amount: number,
): { center: Vec3; radius: number } {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const it of items) {
    const o = offsets[it.id] ?? [0, 0, 0];
    for (let k = 0; k < 3; k++) {
      const c = it.center[k]! + o[k]! * amount;
      min[k] = Math.min(min[k]!, c - it.size[k]! / 2);
      max[k] = Math.max(max[k]!, c + it.size[k]! / 2);
    }
  }
  if (!Number.isFinite(min[0])) return { center: [0, 0, 0], radius: 1 };
  return {
    center: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2],
    radius: Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2 || 1,
  };
}
