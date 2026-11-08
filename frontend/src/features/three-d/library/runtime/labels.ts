/** Screen-space placement of part labels: beside the part, not on top of it. */

/** Gap between a part and its label, in px: scales with the viewer, within limits. */
export function labelGap(width: number, height: number): number {
  return Math.round(Math.min(96, Math.max(44, Math.min(width, height) * 0.11)));
}

/**
 * Label position for an anchor at (ax, ay): pushed `gap` px away from the model's centre
 * (straight up when the anchor is at the centre), kept inside the viewer.
 */
export function labelSpot(
  ax: number,
  ay: number,
  centre: { x: number; y: number },
  view: { width: number; height: number },
  half: { w: number; h: number },
): { x: number; y: number } {
  let dx = ax - centre.x;
  let dy = ay - centre.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) {
    dx = 0;
    dy = -1;
  } else {
    dx /= len;
    dy /= len;
  }
  const gap = labelGap(view.width, view.height);
  const m = 4;
  const clamp = (v: number, lo: number, hi: number) => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)));
  return {
    x: clamp(ax + dx * gap, half.w + m, view.width - half.w - m),
    y: clamp(ay + dy * gap, half.h + m, view.height - half.h - m),
  };
}
