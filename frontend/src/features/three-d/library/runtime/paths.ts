import type { Vec3 } from "./types";

/** Point at fraction `t` (0..1) of a polyline, by arc length. */
export function samplePath(points: readonly Vec3[], t: number): Vec3 {
  const first = points[0];
  if (!first) return [0, 0, 0];
  if (points.length === 1) return [...first];
  const lengths: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    lengths.push(d);
    total += d;
  }
  if (total === 0) return [...first];
  let remaining = Math.min(Math.max(t, 0), 1) * total;
  for (let i = 0; i < lengths.length; i++) {
    const seg = lengths[i]!;
    if (remaining <= seg || i === lengths.length - 1) {
      const a = points[i]!;
      const b = points[i + 1]!;
      const f = seg === 0 ? 0 : Math.min(remaining / seg, 1);
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
    }
    remaining -= seg;
  }
  return [...points[points.length - 1]!];
}
