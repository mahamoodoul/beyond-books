/**
 * Render quality tiers (design §7.7: test on representative student devices). "auto" starts at
 * high and steps down only when the frame rate stays low; a fixed choice is never changed.
 *
 * Medium and high deliberately share the same effect chain, lights and shadow setup and differ
 * only in pixel density and AO sample count. Switching between them therefore never rebuilds
 * passes or recompiles shaders, which is what made the view flash when "auto" stepped down.
 * Only dropping to "low" (no post-processing, no shadows) rebuilds.
 */
export type QualityTier = "low" | "medium" | "high";
export type QualitySetting = QualityTier | "auto";

export interface QualityProfile {
  /** Device-pixel-ratio range. */
  dpr: [number, number];
  /** Post-processing (ambient occlusion, SMAA, bloom, AgX tone mapping in the composer). */
  postprocessing: boolean;
  /** N8AO quality preset; only read when post-processing is on. */
  aoQuality: "performance" | "high";
  /** Soft shadows from the key light (shadow map redrawn only when something moves). */
  shadows: boolean;
}

export const QUALITY: Record<QualityTier, QualityProfile> = {
  low: { dpr: [1, 1], postprocessing: false, aoQuality: "performance", shadows: false },
  medium: { dpr: [1, 1.5], postprocessing: true, aoQuality: "performance", shadows: true },
  high: { dpr: [1, 1.75], postprocessing: true, aoQuality: "high", shadows: true },
};

const ORDER: QualityTier[] = ["low", "medium", "high"];

export function lowerTier(t: QualityTier): QualityTier {
  return ORDER[Math.max(0, ORDER.indexOf(t) - 1)]!;
}

/** Auto quality only reacts to sustained low frame rates, never to one-off hitches. */
export const AUTO_QUALITY = {
  /** Wait after the model is ready before judging performance (load and compile hitches). */
  startDelayMs: 4000,
  /** Step down only when the average frame rate stays below this. */
  minFps: 30,
  /** Sample window: `iterations` × `sampleMs`. */
  sampleMs: 500,
  iterations: 8,
};
