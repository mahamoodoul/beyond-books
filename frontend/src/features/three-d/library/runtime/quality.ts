/**
 * Render quality tiers (design §7.7: test on representative student devices). "auto" starts at
 * high and steps down when the frame rate drops; a fixed choice is never changed.
 */
export type QualityTier = "low" | "medium" | "high";
export type QualitySetting = QualityTier | "auto";

export interface QualityProfile {
  /** Device-pixel-ratio range. */
  dpr: [number, number];
  /** Post-processing (ambient occlusion, AgX tone mapping in the composer, anti-aliasing). */
  postprocessing: boolean;
  /** "fast" uses N8AO's performance preset (fewer samples), "full" its high preset. */
  ambientOcclusion: "off" | "fast" | "full";
  shadows: boolean;
  bloom: boolean;
  /** MSAA samples inside the composer; 0 uses SMAA instead. */
  multisampling: number;
}

export const QUALITY: Record<QualityTier, QualityProfile> = {
  low: {
    dpr: [1, 1],
    postprocessing: false,
    ambientOcclusion: "off",
    shadows: false,
    bloom: false,
    multisampling: 0,
  },
  medium: {
    dpr: [1, 1.5],
    postprocessing: true,
    ambientOcclusion: "fast",
    shadows: false,
    bloom: false,
    multisampling: 0,
  },
  high: {
    dpr: [1, 2],
    postprocessing: true,
    ambientOcclusion: "full",
    shadows: true,
    bloom: true,
    multisampling: 4,
  },
};

const ORDER: QualityTier[] = ["low", "medium", "high"];

export function lowerTier(t: QualityTier): QualityTier {
  return ORDER[Math.max(0, ORDER.indexOf(t) - 1)]!;
}
