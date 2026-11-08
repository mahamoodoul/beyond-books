/**
 * Earth-science lab board, three views:
 * - Plates: a cross-section (a map for transform faults) that changes as million years pass:
 *   subduction with trench, sinking slab, volcanoes and deep quakes; continental collision
 *   building mountains; a mid-ocean ridge making new crust with magnetic stripes; a transform
 *   fault offsetting a river and a road. The mantle convects underneath.
 * - Earth's layers: click crust, mantle, outer core, inner core.
 * - Seismic waves: P and S rays and wavefronts from an earthquake, the shadow zones, and a
 *   seismometer the student moves round the Earth.
 */
import { useEffect, useState, type ReactNode } from "react";

import { BOUNDARIES, LAYERS, MAX_MYR, P_SHADOW, S_LIMIT, TASKS, compute, type TectonicsResult, type TectonicsState } from "./engines/tectonics";
import { LabSegment, LabSlider, TaskChips } from "./LabSlider";
import { useLabClock } from "./useLabClock";
import "./labs-sci.css";

const W = 760;
const H = 440;
const X = 380; // boundary position
const SEA = 150; // sea level
const rad = (d: number) => (d * Math.PI) / 180;
const frac = (x: number) => x - Math.floor(x);
const PLAY_SPEED = 2; // million years per second
const SHORT: Record<string, string> = { subduction: "Subduction", collision: "Collision", divergent: "Divergent", transform: "Transform" };

function Mantle({ t }: { t: number }) {
  return (
    <g>
      <rect x={0} y={220} width={W} height={H - 220} fill="url(#tc-mantle)" />
      {[[230, 1], [530, -1]].map(([cx, dir]) => (
        <ellipse key={cx} cx={cx} cy={340} rx={130} ry={58} fill="none" stroke="rgba(255,237,213,0.35)" strokeWidth={2.5} strokeDasharray="10 12" strokeDashoffset={(dir as number) * -t * 18} />
      ))}
      <text x={14} y={H - 14} fontSize={10} fill="rgba(255,255,255,0.65)">mantle: hot rock creeps in slow loops (convection) and drags the plates</text>
    </g>
  );
}

function Arrow({ x, y, dir, label }: { x: number; y: number; dir: 1 | -1; label: string }) {
  return (
    <g>
      <line x1={x - dir * 28} y1={y} x2={x + dir * 22} y2={y} stroke="#fff" strokeWidth={3} strokeLinecap="round" />
      <polygon points={`${x + dir * 30},${y} ${x + dir * 20},${y - 6} ${x + dir * 20},${y + 6}`} fill="#fff" />
      <text x={x} y={y - 10} textAnchor="middle" fontSize={11} fill="#fff" fontWeight={600}>{label}</text>
    </g>
  );
}

function Quakes({ points, t }: { points: [number, number][]; t: number }) {
  return (
    <g>
      {points.map(([x, y], i) => {
        const on = frac(t * 0.7 + i * 0.37) < 0.35;
        return <circle key={i} cx={x} cy={y} r={on ? 6 : 3.5} fill={on ? "#fde047" : "rgba(253,224,71,0.5)"} stroke="#78350f" strokeWidth={1} />;
      })}
    </g>
  );
}

function Volcano({ x, base, h, active, t }: { x: number; base: number; h: number; active: boolean; t: number }) {
  return (
    <g>
      <polygon points={`${x - h * 1.3 - 14},${base} ${x - 7},${base - h} ${x + 7},${base - h} ${x + h * 1.3 + 14},${base}`} fill="url(#tc-rock)" stroke="rgba(0,0,0,0.35)" />
      {active && (
        <>
          <ellipse cx={x} cy={base - h} rx={7} ry={3} fill="#f97316" />
          {[0, 1, 2].map((i) => {
            const u = frac(t * 0.4 + i / 3);
            return <circle key={i} cx={x + Math.sin(u * 6 + i) * 6} cy={base - h - 6 - u * 34} r={4 + u * 8} fill="rgba(148,163,184,0.5)" opacity={1 - u} />;
          })}
        </>
      )}
    </g>
  );
}

function Subduction({ myr, r, t }: { myr: number; r: TectonicsResult; t: number }) {
  const len = 30 + myr * 10;
  const a = rad(38);
  const sx = X + 40;
  const sy = 236;
  const ex = sx + len * Math.cos(a);
  const ey = sy + len * Math.sin(a);
  const trench = 190 + r.trench_km * 5;
  const vx = X + 150;
  const vh = myr > 0 ? 12 + r.arc_km * 16 : 0;
  const quakes: [number, number][] = myr >= 1 ? Array.from({ length: Math.min(6, 1 + Math.floor(myr / 2)) }, (_, i) => { const u = (i + 0.5) / Math.min(6, 1 + Math.floor(myr / 2)); return [sx + len * u * Math.cos(a) - 8, sy + len * u * Math.sin(a) - 14]; }) : [];
  return (
    <g>
      {/* ocean */}
      <path d={`M 0 ${SEA} L ${X + 30} ${SEA} L ${X + 30} 178 Q ${X + 6} ${trench} ${X - 40} 190 L 0 190 Z`} fill="url(#tc-water)" />
      {/* ocean plate and the sinking slab */}
      <path d={`M 0 205 L ${X - 40} 205 Q ${X + 8} 205 ${sx} ${sy} L ${ex} ${ey}`} fill="none" stroke="url(#tc-basalt)" strokeWidth={30} />
      <path d={`M 0 191 L ${X - 40} 191 Q ${X + 4} ${trench - 6} ${sx + 6} ${sy - 14}`} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={2} />
      {/* continent */}
      <path d={`M ${X - 6} 166 Q ${X + 20} 150 ${X + 60} 142 L ${W} 140 L ${W} 224 L ${X + 70} 224 Q ${X + 20} 204 ${X - 6} 178 Z`} fill="url(#tc-cont)" stroke="rgba(0,0,0,0.3)" />
      <path d={`M ${X + 40} 143 L ${W} 140`} stroke="#4d7c0f" strokeWidth={4} />
      {/* magma rising to the volcano */}
      {myr >= 2 && [0, 1, 2, 3].map((i) => {
        const u = frac(t * 0.25 + i / 4);
        return <circle key={i} cx={vx + Math.sin(u * 7 + i) * 4} cy={300 - u * 150} r={5 - u * 2} fill="#f97316" opacity={0.85} />;
      })}
      {vh > 0 && <Volcano x={vx} base={142} h={vh} active={myr >= 2} t={t} />}
      <Quakes points={quakes} t={t} />
      <Arrow x={140} y={176} dir={1} label="ocean plate" />
      <Arrow x={640} y={126} dir={-1} label="continent" />
      <g fontSize={10} fill="rgba(255,255,255,0.85)">
        <text x={X - 34} y={trench + 18}>trench {r.trench_km} km</text>
        {myr >= 3 && <text x={ex - 20} y={ey + 26}>sinking plate</text>}
        {vh > 0 && <text x={vx + 20} y={142 - vh - 6}>volcano</text>}
      </g>
    </g>
  );
}

function Collision({ myr, r, t }: { myr: number; r: TectonicsResult; t: number }) {
  const h = 6 + r.mountain_km * 14;
  const root = 226 + r.mountain_km * 7;
  const peaks = [-110, -70, -32, 0, 34, 76, 112].map((dx, i) => ({ x: X + dx, h: h * (1 - Math.abs(dx) / 150) * (i % 2 ? 0.86 : 1) }));
  const ridge = `M ${X - 170} 150 ${peaks.map((p) => `L ${p.x} ${150 - p.h}`).join(" ")} L ${X + 170} 150 Z`;
  const quakes: [number, number][] = myr >= 1 ? [[X - 50, 186], [X + 30, 196], [X - 10, 172], [X + 70, 184]] : [];
  return (
    <g>
      <path d={`M 0 150 L ${W} 150 L ${W} 224 Q ${X + 120} 224 ${X} ${root} Q ${X - 120} 224 0 224 Z`} fill="url(#tc-cont)" stroke="rgba(0,0,0,0.3)" />
      <line x1={X} y1={152} x2={X} y2={root - 6} stroke="rgba(0,0,0,0.25)" strokeDasharray="4 4" />
      {myr > 0 && <path d={ridge} fill="url(#tc-rock)" stroke="rgba(0,0,0,0.3)" />}
      {r.mountain_km >= 4 && peaks.filter((p) => p.h > h * 0.7).map((p) => <polygon key={p.x} points={`${p.x - 9},${150 - p.h + 14} ${p.x},${150 - p.h} ${p.x + 9},${150 - p.h + 14}`} fill="#f8fafc" />)}
      <path d="M 0 150 L 200 150" stroke="#4d7c0f" strokeWidth={4} /><path d={`M ${W - 200} 150 L ${W} 150`} stroke="#4d7c0f" strokeWidth={4} />
      <Quakes points={quakes} t={t} />
      <Arrow x={110} y={138} dir={1} label="continent" />
      <Arrow x={650} y={132} dir={-1} label="continent" />
      {myr > 0 && <text x={X + 120} y={150 - h * 0.6} fontSize={10} fill="rgba(255,255,255,0.9)">mountains {r.mountain_km} km</text>}
      {myr > 0 && <text x={X + 24} y={root - 4} fontSize={10} fill="rgba(255,255,255,0.75)">thick crust "root"</text>}
    </g>
  );
}

function Divergent({ myr, t }: { myr: number; t: number }) {
  const stripes = Math.min(MAX_MYR, myr);
  const w = 8;
  return (
    <g>
      <rect x={0} y={SEA} width={W} height={42} fill="url(#tc-water)" />
      {/* old plates pushed outward */}
      <rect x={0} y={190} width={X - stripes * w - 6} height={30} fill="url(#tc-basalt)" />
      <rect x={X + stripes * w + 6} y={190} width={W} height={30} fill="url(#tc-basalt)" />
      {/* new crust, striped by magnetic polarity, youngest in the middle */}
      {Array.from({ length: stripes }, (_, i) => (
        <g key={i}>
          <rect x={X - 6 - (i + 1) * w} y={186 - (stripes - i) * 0.4} width={w} height={34} fill={i % 2 ? "#1e293b" : "#64748b"} />
          <rect x={X + 6 + i * w} y={186 - (stripes - i) * 0.4} width={w} height={34} fill={i % 2 ? "#1e293b" : "#64748b"} />
        </g>
      ))}
      {/* ridge crest and rising magma */}
      <path d={`M ${X - 70} 190 Q ${X - 20} 168 ${X - 6} 172 L ${X + 6} 172 Q ${X + 20} 168 ${X + 70} 190`} fill="#475569" />
      <rect x={X - 6} y={170} width={12} height={60} fill="#f97316" />
      {[0, 1, 2, 3, 4].map((i) => {
        const u = frac(t * 0.3 + i / 5);
        return <circle key={i} cx={X + Math.sin(u * 8 + i) * 18 * (1 - u)} cy={330 - u * 150} r={7 - u * 3} fill="#fb923c" opacity={0.9} />;
      })}
      {myr > 0 && <Volcano x={X} base={172} h={10} active t={t} />}
      <Quakes points={myr >= 1 ? [[X - 16, 200], [X + 18, 206]] : []} t={t} />
      <Arrow x={150} y={176} dir={-1} label="ocean plate" />
      <Arrow x={610} y={176} dir={1} label="ocean plate" />
      {stripes > 0 && <text x={X + stripes * w + 14} y={238} fontSize={10} fill="rgba(255,255,255,0.85)">new ocean floor, striped by Earth's flipping magnetic field</text>}
      <text x={X + 12} y={164} fontSize={10} fill="rgba(255,255,255,0.85)">mid-ocean ridge</text>
    </g>
  );
}

function Transform({ myr, t }: { myr: number; t: number }) {
  const off = myr * 5; // 20 Myr -> 100 px
  return (
    <g>
      {/* seen from above */}
      <rect x={0} y={0} width={W} height={H} fill="url(#tc-land)" />
      <rect x={X - 2} y={0} width={4} height={H} fill="#7f1d1d" />
      <line x1={X} y1={0} x2={X} y2={H} stroke="#fca5a5" strokeDasharray="8 6" strokeWidth={2} />
      {/* a river and a road cut by the fault: the right side has moved down */}
      <path d={`M 0 180 C 120 160, 240 200, ${X} 186`} fill="none" stroke="#38bdf8" strokeWidth={10} strokeLinecap="round" />
      <path d={`M ${X} ${186 + off} C ${X + 140} ${172 + off}, ${X + 260} ${212 + off}, ${W} ${190 + off}`} fill="none" stroke="#38bdf8" strokeWidth={10} strokeLinecap="round" />
      <line x1={0} y1={316} x2={X} y2={316} stroke="#475569" strokeWidth={12} />
      <line x1={X} y1={316 + off} x2={W} y2={316 + off} stroke="#475569" strokeWidth={12} />
      <line x1={0} y1={316} x2={X} y2={316} stroke="#e2e8f0" strokeWidth={1.5} strokeDasharray="10 8" />
      <line x1={X} y1={316 + off} x2={W} y2={316 + off} stroke="#e2e8f0" strokeWidth={1.5} strokeDasharray="10 8" />
      {off > 0 && (
        <g>
          <line x1={X + 26} y1={316} x2={X + 26} y2={316 + off} stroke="#fde047" strokeWidth={1.5} strokeDasharray="3 3" />
          <text x={X + 32} y={316 + off / 2 + 4} fontSize={11} fill="#fde047">{myr * 50} km</text>
        </g>
      )}
      <Quakes points={myr >= 1 ? [[X, 90], [X, 180], [X, 290], [X, 400]] : []} t={t} />
      <g transform="rotate(-90 120 130)"><Arrow x={120} y={130} dir={1} label="" /></g>
      <g transform="rotate(90 720 170)"><Arrow x={720} y={170} dir={1} label="" /></g>
      <text x={150} y={120} fontSize={11} fill="#fff" fontWeight={600}>plate moves north</text>
      <text x={704} y={150} textAnchor="end" fontSize={11} fill="#fff" fontWeight={600}>plate moves south</text>
      <text x={14} y={H - 14} fontSize={11} fill="rgba(255,255,255,0.85)">seen from above (a map)</text>
      <text x={X + 8} y={60} fontSize={10} fill="#fecaca">fault</text>
    </g>
  );
}

/* ---------------------------------------------------------------- layers */
const LC = { cx: 280, cy: 224, R: 196 };
const LAYER_LOOK: Record<string, { r: number; fill: string }> = {
  crust: { r: LC.R, fill: "url(#tc-cont)" },
  mantle: { r: LC.R - 12, fill: "url(#tc-mantle-r)" }, // crust drawn 12 px thick: far thicker than real
  outer_core: { r: (LC.R * 3481) / 6371, fill: "url(#tc-outer)" },
  inner_core: { r: (LC.R * 1221) / 6371, fill: "url(#tc-inner)" },
};

function Layers({ layer, inspected, onPick, readOnly }: { layer: string | null; inspected: string[]; onPick: (k: string) => void; readOnly: boolean }) {
  const labels: [string, number][] = [["crust", -22], ["mantle", -6], ["outer_core", 8], ["inner_core", 30]];
  return (
    <g>
      {Object.entries(LAYER_LOOK).map(([k, l]) => (
        <circle key={k} cx={LC.cx} cy={LC.cy} r={l.r} fill={l.fill} stroke={layer === k ? "#fde047" : "rgba(0,0,0,0.35)"} strokeWidth={layer === k ? 4 : 1}
          className={readOnly ? "" : "cursor-pointer"} onClick={readOnly ? undefined : () => onPick(k)} style={{ filter: layer === k ? "drop-shadow(0 0 10px rgba(253,224,71,0.7))" : undefined }} />
      ))}
      {labels.map(([k, ang]) => {
        const l = LAYER_LOOK[k]!;
        const inner = k === "crust" ? LC.R - 6 : k === "inner_core" ? l.r - 14 : k === "mantle" ? l.r - 20 : l.r - 12;
        const x1 = LC.cx + inner * Math.cos(rad(ang));
        const y1 = LC.cy + inner * Math.sin(rad(ang));
        const lx = 500;
        const ly = LC.cy + (labels.findIndex(([n]) => n === k) - 1.5) * 44;
        return (
          <g key={k} className={readOnly ? "" : "cursor-pointer"} onClick={readOnly ? undefined : () => onPick(k)}>
            <circle cx={x1} cy={y1} r={3} fill="#fff" />
            <path d={`M ${x1} ${y1} L ${lx - 8} ${ly}`} fill="none" stroke="rgba(255,255,255,0.55)" />
            <text x={lx} y={ly + 4} fontSize={12} fontWeight={layer === k ? 700 : 500} fill={layer === k ? "#fde047" : "#fff"}>{inspected.includes(k) ? "✓ " : ""}{LAYERS[k]!.name}</text>
          </g>
        );
      })}
      <text x={LC.cx} y={LC.cy + LC.R + 18} textAnchor="middle" fontSize={10} fill="rgba(255,255,255,0.55)">{readOnly ? "" : "click a layer · "}crust drawn much thicker than real</text>
    </g>
  );
}

/* ----------------------------------------------------------------- waves */
const WC = { cx: 270, cy: 228, R: 190 };
const surf = (deg: number, side: 1 | -1 = 1): [number, number] => [WC.cx + side * WC.R * Math.sin(rad(deg)), WC.cy - WC.R * Math.cos(rad(deg))];

function arcPath(from: number, to: number, side: 1 | -1, r = WC.R): string {
  const p = (d: number) => [WC.cx + side * r * Math.sin(rad(d)), WC.cy - r * Math.cos(rad(d))];
  const [x1, y1] = p(from);
  const [x2, y2] = p(to);
  return `M ${x1} ${y1} A ${r} ${r} 0 0 ${side === 1 ? 1 : 0} ${x2} ${y2}`;
}

function Waves({ wave, station, t, t0 }: { wave: "P" | "S"; station: number; t: number; t0: number }) {
  const core = (WC.R * 3481) / 6371;
  const inner = (WC.R * 1221) / 6371;
  const E = surf(0);
  const ray = (deg: number, side: 1 | -1) => {
    const [x, y] = surf(deg, side);
    const mx = (E[0] + x) / 2;
    const my = (E[1] + y) / 2;
    const cx = mx + (WC.cx - mx) * 0.25;
    const cy = my + (WC.cy - my) * 0.25;
    return `M ${E[0]} ${E[1]} Q ${cx} ${cy} ${x} ${y}`;
  };
  const coreRay = (deg: number, side: 1 | -1) => {
    const [x, y] = surf(deg, side);
    return `M ${E[0]} ${E[1]} Q ${WC.cx + side * (deg - 160) * 1.4} ${WC.cy + 10} ${x} ${y}`;
  };
  const speed = wave === "P" ? 95 : 58;
  const radius = frac(Math.max(0, t - t0) / 5) * 5 * speed;
  const color = wave === "P" ? "#38bdf8" : "#f472b6";
  const pArr = station < P_SHADOW[0] || station > P_SHADOW[1];
  const sArr = station < S_LIMIT;
  const arrives = wave === "P" ? pArr : sArr;
  const [stx, sty] = surf(station, 1);
  return (
    <g>
      <defs><clipPath id="tc-earth-clip"><circle cx={WC.cx} cy={WC.cy} r={WC.R} /></clipPath></defs>
      <circle cx={WC.cx} cy={WC.cy} r={WC.R} fill="url(#tc-mantle-r)" />
      {/* shadow zones on the surface */}
      {([1, -1] as const).map((side) => (
        <g key={side}>
          {wave === "P"
            ? <path d={arcPath(P_SHADOW[0], P_SHADOW[1], side, WC.R + 7)} fill="none" stroke="rgba(239,68,68,0.85)" strokeWidth={9} />
            : <path d={arcPath(S_LIMIT, 180, side, WC.R + 7)} fill="none" stroke="rgba(239,68,68,0.85)" strokeWidth={9} />}
        </g>
      ))}
      {/* rays */}
      <g clipPath="url(#tc-earth-clip)" fill="none" stroke={color} strokeWidth={1.6} opacity={0.75}>
        {([1, -1] as const).map((side) => [15, 35, 55, 75, 95, 103].map((d) => <path key={`${side}${d}`} d={ray(d, side)} />))}
        {wave === "P" && ([1, -1] as const).map((side) => [145, 158, 170].map((d) => <path key={`c${side}${d}`} d={coreRay(d, side)} />))}
        {wave === "P" && <path d={`M ${E[0]} ${E[1]} L ${surf(180)[0]} ${surf(180)[1]}`} />}
        {wave === "P" && radius > 0 && <circle cx={E[0]} cy={E[1]} r={radius} stroke={color} strokeWidth={3} opacity={0.9} />}
      </g>
      {/* core on top: S waves stop at it */}
      <circle cx={WC.cx} cy={WC.cy} r={core} fill="url(#tc-outer)" opacity={wave === "P" ? 0.75 : 1} />
      <circle cx={WC.cx} cy={WC.cy} r={inner} fill="url(#tc-inner)" opacity={wave === "P" ? 0.8 : 1} />
      {wave === "S" && (
        <g clipPath="url(#tc-earth-clip)">
          {radius > 0 && <circle cx={E[0]} cy={E[1]} r={radius} fill="none" stroke={color} strokeWidth={3} opacity={0.9} mask="url(#tc-no-core)" />}
          {[-1, 0, 1].map((k) => {
            const [x, y] = [WC.cx + k * core * 0.62, WC.cy - core * (k === 0 ? 1 : 0.78)];
            return <g key={k}><path d={`M ${E[0]} ${E[1]} L ${x} ${y}`} stroke={color} strokeWidth={1.6} opacity={0.75} /><text x={x} y={y + 4} textAnchor="middle" fontSize={13} fontWeight={800} fill="#ef4444">✕</text></g>;
          })}
        </g>
      )}
      <mask id="tc-no-core"><rect width={W} height={H} fill="#fff" /><circle cx={WC.cx} cy={WC.cy} r={core} fill="#000" /></mask>
      <text x={WC.cx} y={WC.cy + (WC.R * 1221) / 6371 + 18} textAnchor="middle" fontSize={11} fontWeight={700} fill="#7c2d12">{wave === "S" ? "liquid outer core stops S" : "core bends P"}</text>
      {/* epicentre */}
      <polygon points={`${E[0]},${E[1] - 12} ${E[0] + 4},${E[1] - 3} ${E[0] + 13},${E[1] - 3} ${E[0] + 6},${E[1] + 3} ${E[0] + 9},${E[1] + 12} ${E[0]},${E[1] + 6} ${E[0] - 9},${E[1] + 12} ${E[0] - 6},${E[1] + 3} ${E[0] - 13},${E[1] - 3} ${E[0] - 4},${E[1] - 3}`} fill="#fde047" stroke="#78350f" />
      <text x={E[0] + 16} y={E[1] - 8} fontSize={11} fill="#fde047">earthquake</text>
      {/* seismometer */}
      <g>
        <circle cx={stx} cy={sty} r={9} fill={arrives ? "#22c55e" : "#ef4444"} stroke="#fff" strokeWidth={2} />
        <text x={stx + (station > 160 ? -14 : 14)} y={sty + (station > 90 ? 18 : -4)} textAnchor={station > 160 ? "end" : "start"} fontSize={11} fontWeight={600} fill={arrives ? "#86efac" : "#fca5a5"}>seismometer {station}°: {arrives ? `${wave} waves arrive` : `no ${wave} waves`}</text>
      </g>
      <text x={14} y={H - 14} fontSize={10} fill="rgba(255,255,255,0.6)">red on the surface: {wave === "P" ? "P-wave shadow zone (104°–140°)" : "S-wave shadow zone (beyond 104°)"}</text>
    </g>
  );
}

export function TectonicsLab({
  state, onChange, result, boundaries, readOnly = false, toolbar,
}: {
  state: TectonicsState; onChange: (s: TectonicsState) => void; result: TectonicsResult | null;
  boundaries?: string[]; readOnly?: boolean; toolbar?: ReactNode;
}) {
  const [preview, setPreview] = useState<Partial<TectonicsState>>({});
  const [play, setPlay] = useState<{ t0: number; from: number } | null>(null);
  const [quakeAt, setQuakeAt] = useState(0);
  const t = useLabClock(true);
  const playMyr = play ? Math.min(MAX_MYR, Math.floor(play.from + (t - play.t0) * PLAY_SPEED)) : null;
  const s: TectonicsState = { ...state, ...preview, ...(playMyr !== null ? { myr: playMyr } : {}) };
  const live = Object.keys(preview).length || play ? compute(s) : null;
  const r = result ? (live ? { ...result, ...live } : result) : null;
  const allowed = boundaries ?? Object.keys(BOUNDARIES);

  const set = (patch: Partial<TectonicsState>) => {
    if (readOnly) return;
    const next = { ...state, ...patch };
    if (patch.boundary && patch.boundary !== state.boundary) next.myr = 0; // fresh plates
    const seen = new Set(next.seen_boundaries);
    if (state.myr >= 5) seen.add(state.boundary);
    if (next.myr >= 5) seen.add(next.boundary);
    next.seen_boundaries = Object.keys(BOUNDARIES).filter((b) => seen.has(b));
    if (next.layer) next.inspected = Object.keys(LAYERS).filter((k) => k === next.layer || next.inspected.includes(k));
    if (next.view === "waves") {
      const w = new Set([...next.seen_waves, next.wave, ...(state.view === "waves" ? [state.wave] : [])]);
      next.seen_waves = (["P", "S"] as const).filter((x) => w.has(x));
    }
    onChange(next);
  };
  const ended = playMyr !== null && playMyr >= MAX_MYR;
  useEffect(() => {
    if (!ended) return;
    setPlay(null);
    set({ myr: MAX_MYR });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ended]);
  const togglePlay = () => {
    if (play) {
      setPlay(null);
      if (playMyr !== null) set({ myr: playMyr });
    } else {
      setPlay({ t0: t, from: state.myr >= MAX_MYR ? 0 : state.myr });
    }
  };

  return (
    <div className="space-y-2">
      {!readOnly && (
        <div className="lab-controls">
          <LabSegment label="View" value={s.view} options={[{ value: "plates", label: "Plates" }, { value: "layers", label: "Earth's layers" }, { value: "waves", label: "Seismic waves" }]} onChange={(v) => { if (play) togglePlay(); set({ view: v }); if (v === "waves") setQuakeAt(t); }} />
          {s.view === "plates" && (
            <>
              <LabSegment label="Boundary" value={s.boundary} disabled={!!play} options={allowed.map((b) => ({ value: b, label: SHORT[b] ?? b }))} onChange={(v) => set({ boundary: v })} />
              <button type="button" className="lab-action" onClick={togglePlay}>{play ? "■ Stop" : "▶ Run"}</button>
              <LabSlider label="Time" value={state.myr} min={0} max={MAX_MYR} step={1} unit=" Myr" disabled={!!play} onPreview={(v) => setPreview((p) => ({ ...p, myr: v ?? undefined }))} onCommit={(v) => set({ myr: v })} />
            </>
          )}
          {s.view === "layers" && (
            <LabSegment label="Layer" value={s.layer ?? ""} options={Object.entries(LAYERS).map(([k, l]) => ({ value: k, label: l.name }))} onChange={(v) => set({ layer: v })} />
          )}
          {s.view === "waves" && (
            <>
              <LabSegment label="Wave" value={s.wave} options={[{ value: "P", label: "P wave" }, { value: "S", label: "S wave" }]} onChange={(v) => { set({ wave: v }); setQuakeAt(t); }} />
              <button type="button" className="lab-action" onClick={() => setQuakeAt(t)}>⚡ Earthquake</button>
              <LabSlider label="Seismometer" value={state.station} min={0} max={180} step={1} unit="°" onPreview={(v) => setPreview((p) => ({ ...p, station: v ?? undefined }))} onCommit={(v) => set({ station: v })} />
            </>
          )}
          {toolbar}
        </div>
      )}

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full select-none rounded-2xl shadow-lg ring-1 ring-slate-900/40" role="img"
        aria-label={s.view === "plates" ? `${BOUNDARIES[s.boundary]} after ${s.myr} million years` : s.view === "layers" ? "Cross-section of the Earth" : `${s.wave} waves through the Earth`}>
        <defs>
          <linearGradient id="tc-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#1e3a5f" /><stop offset="100%" stopColor="#3b6a8f" /></linearGradient>
          <linearGradient id="tc-space" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0f172a" /><stop offset="100%" stopColor="#020617" /></linearGradient>
          <linearGradient id="tc-water" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="rgba(56,189,248,0.75)" /><stop offset="100%" stopColor="rgba(3,105,161,0.9)" /></linearGradient>
          <linearGradient id="tc-mantle" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#c2410c" /><stop offset="100%" stopColor="#7c2d12" /></linearGradient>
          <radialGradient id="tc-mantle-r" cx="50%" cy="50%" r="50%"><stop offset="40%" stopColor="#ea580c" /><stop offset="100%" stopColor="#9a3412" /></radialGradient>
          <radialGradient id="tc-outer" cx="50%" cy="50%" r="50%"><stop offset="30%" stopColor="#fbbf24" /><stop offset="100%" stopColor="#f59e0b" /></radialGradient>
          <radialGradient id="tc-inner" cx="40%" cy="40%" r="60%"><stop offset="0%" stopColor="#fffbeb" /><stop offset="100%" stopColor="#fde68a" /></radialGradient>
          <linearGradient id="tc-basalt" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#475569" /><stop offset="100%" stopColor="#1e293b" /></linearGradient>
          <linearGradient id="tc-cont" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#a16207" /><stop offset="100%" stopColor="#713f12" /></linearGradient>
          <linearGradient id="tc-rock" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#78716c" /><stop offset="100%" stopColor="#57534e" /></linearGradient>
          <linearGradient id="tc-land" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#65a30d" /><stop offset="100%" stopColor="#3f6212" /></linearGradient>
        </defs>
        <rect width={W} height={H} rx={16} fill={s.view === "plates" ? "url(#tc-sky)" : "url(#tc-space)"} />
        {s.view === "plates" && r && (
          <>
            {s.boundary !== "transform" && <Mantle t={t} />}
            {s.boundary === "subduction" && <Subduction myr={s.myr} r={r} t={t} />}
            {s.boundary === "collision" && <Collision myr={s.myr} r={r} t={t} />}
            {s.boundary === "divergent" && <Divergent myr={s.myr} t={t} />}
            {s.boundary === "transform" && <Transform myr={s.myr} t={t} />}
            <g transform={s.boundary === "transform" ? "translate(546 14)" : "translate(14 14)"}>
              <rect width={200} height={104} rx={10} fill="rgba(15,23,42,0.78)" stroke="rgba(255,255,255,0.15)" />
              <text x={12} y={20} fontSize={12} fontWeight={700} fill="#fff">{SHORT[s.boundary]} · {s.myr} Myr</text>
              {([
                ["moved", `${r.distance_km} km`],
                ...(s.boundary === "subduction" ? [["trench", `${r.trench_km} km deep`], ["quakes down to", `${r.slab_km} km`]] : []),
                ...(s.boundary === "collision" ? [["mountains", `${r.mountain_km} km high`], ["quakes", "shallow"]] : []),
                ...(s.boundary === "divergent" ? [["new ocean floor", `${r.new_crust_km} km`], ["quakes", "shallow"]] : []),
                ...(s.boundary === "transform" ? [["fault offset", `${r.offset_km} km`], ["quakes", "shallow"]] : []),
                ["volcanoes", r.volcanoes ? "yes" : "no"],
              ] as [string, string][]).map(([k, v], i) => (
                <g key={k} transform={`translate(12 ${40 + i * 18})`}>
                  <text fontSize={11} fill="rgba(255,255,255,0.6)">{k}</text>
                  <text x={176} textAnchor="end" fontSize={11.5} fontWeight={600} fill="#fff">{v}</text>
                </g>
              ))}
            </g>
            {s.boundary !== "transform" && <text x={W - 14} y={H - 14} textAnchor="end" fontSize={10} fill="rgba(255,255,255,0.6)">1 Myr = 50 km at 5 cm a year (as fast as fingernails grow) · not to scale</text>}
          </>
        )}
        {s.view === "layers" && (
          <>
            <Layers layer={s.layer} inspected={s.inspected} onPick={(k) => set({ layer: k })} readOnly={readOnly} />
            {s.layer && (
              <g transform="translate(546 330)">
                <rect width={200} height={96} rx={10} fill="rgba(15,23,42,0.85)" stroke="rgba(253,224,71,0.5)" />
                <text x={12} y={22} fontSize={13} fontWeight={700} fill="#fde047">{LAYERS[s.layer]!.name}</text>
                <text x={12} y={42} fontSize={11} fill="#fff">{LAYERS[s.layer]!.from_km}–{LAYERS[s.layer]!.to_km} km deep</text>
                <text x={12} y={60} fontSize={11} fill="#fff">{LAYERS[s.layer]!.state}</text>
                <text x={12} y={78} fontSize={11} fill="#fff">about {LAYERS[s.layer]!.temp_c} °C</text>
              </g>
            )}
            <text x={546} y={40} fontSize={11} fill="rgba(255,255,255,0.7)">{s.inspected.length}/4 layers inspected</text>
          </>
        )}
        {s.view === "waves" && <Waves wave={s.wave} station={s.station} t={t} t0={quakeAt} />}
        <rect x={1} y={1} width={W - 2} height={H - 2} rx={15} fill="none" stroke="rgba(255,255,255,0.12)" />
      </svg>
      {r && <TaskChips tasks={r.tasks} achieved={r.achieved} labels={TASKS} />}
    </div>
  );
}
