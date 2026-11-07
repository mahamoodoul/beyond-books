/**
 * A tiny 3D renderer for the landing page subject icons: shapes are built in 3D, turned around
 * the vertical (Y) axis, tilted slightly towards the viewer, projected with a little perspective
 * and drawn back to front into an SVG string. No WebGL, so it costs almost nothing.
 */

export type Vec3 = [number, number, number];

export type Prim =
  | { kind: "sphere"; c: Vec3; r: number; fill: string; stroke?: string }
  | { kind: "line"; a: Vec3; b: Vec3; width: number; stroke: string; opacity?: number; dash?: boolean; cull?: boolean }
  | { kind: "poly"; pts: Vec3[]; fill: string; opacity?: number; stroke?: string; strokeWidth?: number }
  | { kind: "dot"; c: Vec3; r: number; fill: string; opacity?: number; cull?: boolean };

/** A scene returns its shapes in model space for time t (seconds); the renderer turns them.
 *  `angle`/`tilt` are passed for scenes that need to know which side faces the viewer. */
export type Scene = (t: number, angle: number, tilt: number) => Prim[];

const SIZE = 360;
const CENTRE = SIZE / 2;
const FOCAL = 760;

export function rotY([x, y, z]: Vec3, a: number): Vec3 {
  const c = Math.cos(a), s = Math.sin(a);
  return [x * c + z * s, y, -x * s + z * c];
}

export function rotX([x, y, z]: Vec3, a: number): Vec3 {
  const c = Math.cos(a), s = Math.sin(a);
  return [x, y * c - z * s, y * s + z * c];
}

export function rotZ([x, y, z]: Vec3, a: number): Vec3 {
  const c = Math.cos(a), s = Math.sin(a);
  return [x * c - y * s, x * s + y * c, z];
}

const f = (n: number) => n.toFixed(1);

function project([x, y, z]: Vec3): [number, number, number] {
  const s = FOCAL / (FOCAL - z);
  return [CENTRE + x * s, CENTRE - y * s, s];
}

/** Turn every point of a shape: around Y by `angle`, then tilt around X by `tilt`. */
function view(p: Vec3, angle: number, tilt: number): Vec3 {
  return rotX(rotY(p, angle), tilt);
}

function depth(p: Prim): number {
  switch (p.kind) {
    case "sphere":
    case "dot":
      return p.c[2];
    case "line":
      return (p.a[2] + p.b[2]) / 2;
    case "poly":
      return p.pts.reduce((s, q) => s + q[2], 0) / p.pts.length;
  }
}

/** Render a scene at time t, turned by `angle` (radians) around its vertical axis. */
export function renderScene(scene: Scene, t: number, angle: number, tilt = 0.32): string {
  const prims = scene(t, angle, tilt).map((p): Prim => {
    switch (p.kind) {
      case "sphere":
      case "dot":
        return { ...p, c: view(p.c, angle, tilt) };
      case "line":
        return { ...p, a: view(p.a, angle, tilt), b: view(p.b, angle, tilt) };
      case "poly":
        return { ...p, pts: p.pts.map((q) => view(q, angle, tilt)) };
    }
  });
  prims.sort((a, b) => depth(a) - depth(b));
  let out = "";
  for (const p of prims) {
    // shapes on the surface of a sphere: skip the far side, fade towards the edge
    if ((p.kind === "dot" || p.kind === "line") && p.cull) {
      const z = depth(p);
      if (z <= 0) continue;
      if (p.kind === "dot") {
        const len = Math.hypot(...p.c) || 1;
        p.opacity = (p.opacity ?? 1) * (0.3 + 0.7 * (z / len));
      }
    }
    if (p.kind === "sphere" || p.kind === "dot") {
      const [x, y, s] = project(p.c);
      const extra = p.kind === "dot" ? ` opacity="${f(p.opacity ?? 1)}"` : p.stroke ? ` stroke="${p.stroke}" stroke-width="1"` : "";
      out += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(p.r * s)}" fill="${p.fill}"${extra}/>`;
    } else if (p.kind === "line") {
      const [x1, y1, s1] = project(p.a);
      const [x2, y2, s2] = project(p.b);
      out += `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${p.stroke}" stroke-width="${f(p.width * (s1 + s2) / 2)}" stroke-linecap="round"${p.opacity !== undefined ? ` opacity="${f(p.opacity)}"` : ""}${p.dash ? ' stroke-dasharray="6 6"' : ""}/>`;
    } else {
      const pts = p.pts.map((q) => project(q)).map(([x, y]) => `${f(x)},${f(y)}`).join(" ");
      out += `<polygon points="${pts}" fill="${p.fill}"${p.opacity !== undefined ? ` fill-opacity="${f(p.opacity)}"` : ""}${p.stroke ? ` stroke="${p.stroke}" stroke-width="${p.strokeWidth ?? 1.5}" stroke-linejoin="round"` : ""}/>`;
    }
  }
  return out;
}

// ------------------------------------------------------------------- scenes

/** Shared sphere shading (radial gradients defined once in the SVG <defs>). */
export const SPHERE_GRADIENTS: Record<string, [string, string, string]> = {
  proton: ["#ffd0cf", "#ec6f72", "#9f2f45"],
  neutron: ["#e4e7f5", "#9aa3c7", "#5b6390"],
  electron: ["#e6fbff", "#5ed3ef", "#1f7ea8"],
  carbon: ["#9a9cb4", "#474a66", "#1f2033"],
  hydrogen: ["#ffffff", "#dfe4f5", "#9ba5c9"],
  planet: ["#fbe3b5", "#e0a96a", "#8a5a37"],
  moon: ["#f5f5fa", "#c7c9d9", "#7f8199"],
  ocean: ["#9fd8ff", "#3f86d6", "#1d3f86"],
};

/** Circle of radius r in the XZ plane (y = 0), as `n` points. */
function ring(r: number, n: number): Vec3[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [r * Math.cos(a), 0, r * Math.sin(a)] as Vec3;
  });
}

function segments(pts: Vec3[], width: number, stroke: string, opacity?: number): Prim[] {
  return pts.map((a, i) => ({ kind: "line", a, b: pts[(i + 1) % pts.length]!, width, stroke, opacity }));
}

/** Physics: a nucleus of protons and neutrons with three electron orbits. */
export const atomScene: Scene = (t) => {
  const prims: Prim[] = [];
  const nucleus: [Vec3, string][] = [
    [[0, 0, 0], "proton"], [[14, 6, 4], "neutron"], [[-12, 8, -6], "proton"], [[4, -13, 8], "neutron"],
    [[-6, -6, 14], "proton"], [[8, 10, -13], "neutron"], [[-14, -8, -4], "neutron"], [[10, -4, -12], "proton"],
  ];
  for (const [c, kind] of nucleus) prims.push({ kind: "sphere", c, r: 13, fill: `url(#g-${kind})` });
  const tilts = [0, Math.PI / 3, (2 * Math.PI) / 3];
  tilts.forEach((z, i) => {
    const place = (p: Vec3) => rotZ(rotX(p, 1.2), z);
    const orbit = ring(128, 72).map(place);
    prims.push(...segments(orbit, 2.4, ["#a78bfa", "#8b5cf6", "#7c3aed"][i]!, 0.9));
    const u = t * (0.9 + i * 0.25) + i * 2.1;
    prims.push({ kind: "sphere", c: place([128 * Math.cos(u), 0, 128 * Math.sin(u)]), r: 8, fill: "url(#g-electron)" });
  });
  return prims;
};

/** Chemistry: a methane molecule (CH4), hydrogens at the corners of a tetrahedron. */
export const moleculeScene: Scene = () => {
  const d = 112;
  const k = d / Math.sqrt(3);
  const hs: Vec3[] = [[k, k, k], [-k, -k, k], [-k, k, -k], [k, -k, -k]];
  const prims: Prim[] = [{ kind: "sphere", c: [0, 0, 0], r: 46, fill: "url(#g-carbon)" }];
  for (const h of hs) {
    // bond as a short tube: a few parallel lines read as a cylinder from any angle
    const a: Vec3 = [h[0] * 0.3, h[1] * 0.3, h[2] * 0.3];
    const b: Vec3 = [h[0] * 0.78, h[1] * 0.78, h[2] * 0.78];
    prims.push({ kind: "line", a, b, width: 15, stroke: "#c8cbe0" });
    prims.push({ kind: "line", a, b, width: 6, stroke: "#eef0fb", opacity: 0.8 });
    prims.push({ kind: "sphere", c: h, r: 31, fill: "url(#g-hydrogen)" });
  }
  return prims;
};

// rough continent outlines (longitude, latitude) for a stylised dotted globe
const LAND: [number, number][][] = [
  [[-168, 66], [-140, 70], [-95, 72], [-80, 62], [-60, 55], [-66, 45], [-81, 25], [-97, 18], [-105, 22], [-117, 32], [-125, 48], [-150, 58]],
  [[-81, 8], [-60, 10], [-35, -6], [-40, -22], [-58, -38], [-70, -54], [-75, -40], [-71, -18], [-81, -4]],
  [[-55, 60], [-20, 70], [-30, 83], [-60, 80]],
  [[-10, 36], [0, 44], [-5, 48], [5, 54], [10, 58], [25, 70], [40, 66], [45, 45], [30, 40], [20, 36]],
  [[-17, 21], [-5, 36], [10, 37], [33, 31], [43, 12], [51, 12], [40, -15], [32, -29], [20, -35], [12, -6], [-8, 4], [-17, 14]],
  [[45, 45], [40, 66], [70, 73], [110, 77], [140, 72], [180, 68], [160, 58], [140, 50], [130, 35], [120, 22], [106, 10], [100, 15], [92, 22], [80, 8], [72, 20], [57, 25], [50, 30]],
  [[114, -22], [130, -12], [142, -11], [153, -27], [146, -39], [135, -35], [115, -34]],
];

function inside(lon: number, lat: number, poly: [number, number][]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!, [xj, yj] = poly[j]!;
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

const GLOBE_R = 128;
const sphere = (lon: number, lat: number, r = GLOBE_R): Vec3 => {
  const la = (lat * Math.PI) / 180, lo = (lon * Math.PI) / 180;
  return [r * Math.cos(la) * Math.sin(lo), r * Math.sin(la), r * Math.cos(la) * Math.cos(lo)];
};
const LAND_DOTS: Vec3[] = [];
for (let lat = -58; lat <= 82; lat += 4.2) {
  const step = 4.2 / Math.max(0.25, Math.cos((lat * Math.PI) / 180));
  for (let lon = -180; lon < 180; lon += step) {
    if (LAND.some((p) => inside(lon, lat, p))) LAND_DOTS.push(sphere(lon, lat));
  }
}

/** Geography: a dotted Earth. Only the half facing the viewer is drawn. */
export const globeScene: Scene = () => {
  const prims: Prim[] = [];
  // the ocean sphere sits behind everything on the near hemisphere
  prims.push({ kind: "sphere", c: [0, 0, 0], r: GLOBE_R, fill: "url(#g-ocean)" });
  for (const lat of [-60, -30, 0, 30, 60]) {
    const pts = Array.from({ length: 60 }, (_, i) => sphere((i / 60) * 360 - 180, lat, GLOBE_R + 1));
    prims.push(...segments(pts, 0.9, "#cfe6ff", 0.35).map((s) => ({ ...s, cull: true }) as Prim));
  }
  for (const d of LAND_DOTS) prims.push({ kind: "dot", c: d, r: 2.6, fill: "#b8f0c8", cull: true });
  return prims;
};

/** Space: a ringed planet with a moving storm and a small moon. */
export const planetScene: Scene = (t) => {
  const R = 92;
  const prims: Prim[] = [{ kind: "sphere", c: [0, 0, 0], r: R, fill: "url(#g-planet)" }];
  // cloud bands: latitude circles on the surface
  [-50, -25, -8, 12, 34].forEach((lat, i) => {
    const pts = Array.from({ length: 48 }, (_, k) => sphere((k / 48) * 360 - 180, lat, R + 0.5));
    prims.push(...segments(pts, i % 2 ? 6 : 3.5, i % 2 ? "#d39a66" : "#f1d2a2").map((p) => ({ ...p, cull: true }) as Prim));
  });
  prims.push({ kind: "dot", c: sphere(40, -22, R + 1), r: 9, fill: "#b3643f", opacity: 0.85 });
  [128, 140, 152, 164].forEach((r, i) => {
    prims.push(...segments(ring(r, 120), i === 1 ? 10 : 7, ["#e7d3ad", "#cdb08a", "#e9dcc0", "#b99d7d"][i]!));
  });
  const m = t * 0.6;
  prims.push({ kind: "sphere", c: [190 * Math.cos(m), 30, 190 * Math.sin(m)], r: 14, fill: "url(#g-moon)" });
  return prims;
};

/** Maths: a cube with hidden edges dashed, like a geometry diagram. */
export const cubeScene: Scene = (_t, angle, tilt) => {
  const s = 92;
  const v: Vec3[] = [
    [-s, -s, -s], [s, -s, -s], [s, s, -s], [-s, s, -s],
    [-s, -s, s], [s, -s, s], [s, s, s], [-s, s, s],
  ];
  const faces: [number[], Vec3, string][] = [
    [[4, 5, 6, 7], [0, 0, 1], "#8b5cf6"], [[1, 0, 3, 2], [0, 0, -1], "#8b5cf6"],
    [[5, 1, 2, 6], [1, 0, 0], "#7c3aed"], [[0, 4, 7, 3], [-1, 0, 0], "#7c3aed"],
    [[7, 6, 2, 3], [0, 1, 0], "#a78bfa"], [[0, 1, 5, 4], [0, -1, 0], "#6d28d9"],
  ];
  const facing = faces.map(([, n]) => view(n, angle, tilt)[2] > 0);
  const prims: Prim[] = [];
  faces.forEach(([idx, , color], i) => {
    if (facing[i]) prims.push({ kind: "poly", pts: idx.map((k) => v[k]!), fill: color, opacity: 0.32 });
  });
  const edges: [number, number][] = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
  for (const [a, b] of edges) {
    // an edge is hidden when both faces that share it face away
    const shared = faces.map(([idx], i) => (idx.includes(a) && idx.includes(b) ? i : -1)).filter((i) => i >= 0);
    const hidden = shared.every((i) => !facing[i]);
    prims.push({ kind: "line", a: v[a]!, b: v[b]!, width: hidden ? 1.6 : 3, stroke: hidden ? "#b9a8f5" : "#ede9fe", opacity: hidden ? 0.7 : 1, dash: hidden });
  }
  for (const p of v) prims.push({ kind: "dot", c: p, r: 4, fill: "#ede9fe" });
  return prims;
};
