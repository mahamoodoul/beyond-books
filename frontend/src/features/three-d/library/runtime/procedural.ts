/**
 * Allowlisted procedural generators (design §7.1-A). A scene can only name a generator listed
 * here; params are flat scalars, clamped by each generator. No generator evaluates scene data.
 */
import * as THREE from "three";

import type { ProceduralCatalog } from "./sceneResolver";

export interface ProceduralInstance {
  root: THREE.Object3D;
  /** Advance time-based motion; skipped when reduced motion is on. */
  update?: (dtSeconds: number) => void;
}

interface Generator {
  meshNames(params: Record<string, unknown>): string[];
  build(params: Record<string, unknown>): ProceduralInstance;
}

const num = (v: unknown, def: number, lo: number, hi: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(Math.max(v, lo), hi) : def;
const bool = (v: unknown, def: boolean) => (typeof v === "boolean" ? v : def);

const PLANETS = [
  { name: "mercury", radius: 0.25, orbit: 3, color: "#a8a29e", period: 0.24 },
  { name: "venus", radius: 0.42, orbit: 4.6, color: "#e7c08a", period: 0.62 },
  { name: "earth", radius: 0.45, orbit: 6.4, color: "#3b82f6", period: 1 },
  { name: "mars", radius: 0.32, orbit: 8.2, color: "#c2410c", period: 1.88 },
  { name: "jupiter", radius: 1.1, orbit: 12, color: "#d6a77a", period: 11.9 },
  { name: "saturn", radius: 0.95, orbit: 16, color: "#e9d5a1", period: 29.4 },
  { name: "uranus", radius: 0.7, orbit: 19.5, color: "#7dd3fc", period: 84 },
  { name: "neptune", radius: 0.68, orbit: 23, color: "#3b5bdb", period: 165 },
] as const;

const solarSystem: Generator = {
  meshNames(params) {
    const n = Math.round(num(params.planet_count, 4, 1, PLANETS.length));
    return ["sun", ...PLANETS.slice(0, n).map((p) => p.name)];
  },
  build(params) {
    const n = Math.round(num(params.planet_count, 4, 1, PLANETS.length));
    const root = new THREE.Group();
    root.name = "solar_system";
    const sun = new THREE.Mesh(
      new THREE.SphereGeometry(1.4, 48, 24),
      new THREE.MeshStandardMaterial({
        color: "#fbbf24",
        emissive: new THREE.Color("#f59e0b"),
        emissiveIntensity: 1.2,
      }),
    );
    sun.name = "sun";
    root.add(sun);
    const sunLight = new THREE.PointLight("#fff7e0", 60, 0, 1.2);
    root.add(sunLight);

    const pivots: { pivot: THREE.Object3D; speed: number }[] = [];
    PLANETS.slice(0, n).forEach((p, i) => {
      const pivot = new THREE.Group();
      pivot.rotation.y = i * 1.7;
      const planet = new THREE.Mesh(
        new THREE.SphereGeometry(p.radius, 32, 16),
        new THREE.MeshStandardMaterial({
          color: p.color,
          roughness: 0.8,
          emissive: new THREE.Color("#000000"),
        }),
      );
      planet.name = p.name;
      planet.position.set(p.orbit, 0, 0);
      pivot.add(planet);
      root.add(pivot);
      pivots.push({ pivot, speed: (2 * Math.PI) / (p.period * 20) });
      if (bool(params.show_orbits, true)) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(p.orbit - 0.02, p.orbit + 0.02, 128),
          new THREE.MeshBasicMaterial({
            color: "#94a3b8",
            transparent: true,
            opacity: 0.35,
            side: THREE.DoubleSide,
          }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.raycast = () => {};
        root.add(ring);
      }
    });
    return {
      root,
      update(dt) {
        for (const { pivot, speed } of pivots) pivot.rotation.y += speed * dt;
      },
    };
  },
};

const GENERATORS: Record<string, Generator> = { solar_system: solarSystem };

export const proceduralCatalog: ProceduralCatalog = {
  has: (g) => Object.hasOwn(GENERATORS, g),
  meshNames: (g, params) => GENERATORS[g]?.meshNames(params) ?? [],
};

export function buildProcedural(
  generator: string,
  params: Record<string, unknown>,
): ProceduralInstance | null {
  const g = Object.hasOwn(GENERATORS, generator) ? GENERATORS[generator] : undefined;
  return g ? g.build(params) : null;
}
