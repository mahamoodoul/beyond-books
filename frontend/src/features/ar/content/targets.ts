import { HEART_CT } from "./ctProfiles";
import { HEART_PARTS } from "./heartParts";

export interface ARTarget {
  id: string;
  title: string;
  chapter: string;
  pageUrl: string;
  modelUrl: string;
  parts: typeof HEART_PARTS;
  heartbeat: boolean;
  surfaceParts: string[];
  explodeDistance: number;
  explodeTurn: number;
  ct: typeof HEART_CT;
  partColors: boolean;
  meshColors?: [RegExp, string][];
  colorNote?: string;
  size: number;
  offset: { x: number; y: number };
  lift: number;
}

const base = import.meta.env.BASE_URL;

export const TARGETS_MIND_URL = `${base}targets/pages.mind`;

export const TARGETS: ARTarget[] = [
  {
    id: "heart",
    title: "The Human Heart",
    chapter: "The Circulatory System",
    pageUrl: `${base}targets/heart-page.png`,
    modelUrl: `${base}models/heart.glb`,
    parts: HEART_PARTS,
    heartbeat: true,
    surfaceParts: ["CoronaryArteries", "CardiacVeins"],
    explodeDistance: 0.32,
    explodeTurn: 0,
    ct: HEART_CT,
    partColors: true,
    meshColors: [[/_Fat\d*$/, "#f1e2b3"]],
    colorNote: "Reds and pinks carry oxygen-rich blood; blues and violet carry oxygen-poor blood.",
    size: 0.78,
    offset: { x: 0.02, y: 0.03 },
    lift: 0.18,
  },
];
