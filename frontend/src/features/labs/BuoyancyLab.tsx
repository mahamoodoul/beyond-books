/**
 * Buoyancy and pressure tank: pick an object and a liquid, watch the object settle (floating
 * partly submerged, or sinking to the bottom), drag the pressure probe down the depth scale.
 * Forces and pressure are shown as readouts and as arrows on the object.
 */
import { useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

import { LIQUIDS, MATERIALS, TANK_DEPTH_M, TASKS, type BuoyancyResult, type BuoyancyState } from "./engines/buoyancy";

const W = 720;
const H = 400;
const TANK = { x: 60, y: 40, w: 420, h: 320 };
const SURFACE_Y = TANK.y + 30; // liquid surface
const BOTTOM_Y = TANK.y + TANK.h - 10;
const DEPTH_PX = BOTTOM_Y - SURFACE_Y; // = TANK_DEPTH_M

const LIQUID_COLORS: Record<string, [string, string]> = {
  "fresh water": ["rgba(96,165,250,0.55)", "rgba(29,78,216,0.75)"],
  "salt water": ["rgba(45,212,191,0.55)", "rgba(13,148,136,0.8)"],
  oil: ["rgba(250,204,21,0.5)", "rgba(202,138,4,0.7)"],
  honey: ["rgba(251,146,60,0.6)", "rgba(154,52,18,0.85)"],
  custom: ["rgba(167,139,250,0.55)", "rgba(109,40,217,0.75)"],
};
const MATERIAL_COLORS: Record<string, [string, string]> = {
  wood: ["#d6a05a", "#8a5a1e"], ice: ["#e0f2fe", "#7dd3fc"], plastic: ["#f9a8d4", "#be185d"], wax: ["#fef3c7", "#d97706"],
  rubber: ["#4b5563", "#111827"], glass: ["#e2e8f0", "#64748b"], aluminium: ["#e5e7eb", "#6b7280"], steel: ["#9ca3af", "#1f2937"], custom: ["#c4b5fd", "#5b21b6"],
};

export function BuoyancyLab({
  state,
  onChange,
  result,
  allowCustom = true,
  materials,
  liquids,
  tasks,
  readOnly = false,
  toolbar,
}: {
  state: BuoyancyState;
  onChange: (s: BuoyancyState) => void;
  result: BuoyancyResult | null;
  allowCustom?: boolean;
  materials?: string[];
  liquids?: string[];
  tasks?: string[];
  readOnly?: boolean;
  toolbar?: ReactNode;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  const mats = materials ?? Object.keys(MATERIALS);
  const liqs = liquids ?? Object.keys(LIQUIDS);
  const r = result;
  // object size from volume: a cube, scaled so 1 L ≈ 70 px
  const side = Math.max(36, Math.min(130, 70 * Math.cbrt(state.volume_l)));
  const sub = r?.submerged_fraction ?? 0.5;
  const floats = r?.floats ?? true;
  const objTop = floats ? SURFACE_Y - side * (1 - sub) : BOTTOM_Y - side;
  const objX = TANK.x + TANK.w / 2 - side / 2;
  const probeY = SURFACE_Y + (state.probe_depth_m / TANK_DEPTH_M) * DEPTH_PX;
  const [lc1, lc2] = LIQUID_COLORS[state.liquid] ?? LIQUID_COLORS.custom!;
  const [mc1, mc2] = MATERIAL_COLORS[state.material] ?? MATERIAL_COLORS.custom!;
  const update = (patch: Partial<BuoyancyState>) => {
    if (readOnly) return;
    const next = { ...state, ...patch };
    if (patch.liquid && patch.liquid !== state.liquid && !state.tried_liquids.includes(state.liquid)) next.tried_liquids = [...state.tried_liquids, state.liquid].slice(-10);
    onChange(next);
  };
  const probeFromEvent = (e: ReactPointerEvent) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const y = ((e.clientY - rect.top) / rect.height) * H;
    const depth = Math.min(TANK_DEPTH_M, Math.max(0, ((y - SURFACE_Y) / DEPTH_PX) * TANK_DEPTH_M));
    update({ probe_depth_m: Math.round(depth * 100) / 100 });
  };
  const arrow = (y1: number, y2: number, color: string, label: string, x: number) => (
    <g>
      <line x1={x} y1={y1} x2={x} y2={y2} stroke={color} strokeWidth={4} strokeLinecap="round" />
      <polygon points={`${x - 7},${y2 + (y2 > y1 ? -10 : 10)} ${x + 7},${y2 + (y2 > y1 ? -10 : 10)} ${x},${y2}`} fill={color} />
      <text x={x + 10} y={(y1 + y2) / 2 + 4} fontSize={11} fill="#fff">{label}</text>
    </g>
  );

  return (
    <div className="space-y-2">
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="inline-flex items-center gap-1.5">Object
            <select className="rounded-md border border-slate-300 bg-white px-2 py-1.5" value={state.material} onChange={(e) => update({ material: e.target.value })}>
              {mats.map((m) => <option key={m} value={m}>{m} ({MATERIALS[m]} kg/m³)</option>)}
              {allowCustom && <option value="custom">custom density…</option>}
            </select>
          </label>
          {state.material === "custom" && (
            <label className="inline-flex items-center gap-1.5">ρ<sub>object</sub>
              <input type="range" min={100} max={3000} step={10} value={state.object_density} onChange={(e) => update({ object_density: Number(e.target.value) })} />
              <span className="tabular-nums">{state.object_density} kg/m³</span>
            </label>
          )}
          <label className="inline-flex items-center gap-1.5">Volume
            <input type="range" min={0.2} max={10} step={0.1} value={state.volume_l} onChange={(e) => update({ volume_l: Number(e.target.value) })} />
            <span className="tabular-nums">{state.volume_l.toFixed(1)} L</span>
          </label>
          <label className="inline-flex items-center gap-1.5">Liquid
            <select className="rounded-md border border-slate-300 bg-white px-2 py-1.5" value={state.liquid} onChange={(e) => update({ liquid: e.target.value })}>
              {liqs.map((l) => <option key={l} value={l}>{l} ({LIQUIDS[l]} kg/m³)</option>)}
              {allowCustom && <option value="custom">custom density…</option>}
            </select>
          </label>
          {state.liquid === "custom" && (
            <label className="inline-flex items-center gap-1.5">ρ<sub>liquid</sub>
              <input type="range" min={500} max={2000} step={10} value={state.liquid_density} onChange={(e) => update({ liquid_density: Number(e.target.value) })} />
              <span className="tabular-nums">{state.liquid_density} kg/m³</span>
            </label>
          )}
          {toolbar}
        </div>
      )}

      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="lab-bench w-full select-none" role="img"
        aria-label={`${state.material} in ${state.liquid}: ${floats ? "floats" : "sinks"}`}
        onPointerMove={(e) => { if (dragging.current) probeFromEvent(e); }}
        onPointerUp={() => { dragging.current = false; }}
        onPointerLeave={() => { dragging.current = false; }}>
        <defs>
          <linearGradient id="bl-bench" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2b2a42" /><stop offset="100%" stopColor="#1b1a29" /></linearGradient>
          <linearGradient id="bl-liquid" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={lc1} /><stop offset="100%" stopColor={lc2} /></linearGradient>
          <linearGradient id="bl-glass" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="rgba(255,255,255,0.25)" /><stop offset="15%" stopColor="rgba(255,255,255,0.03)" /><stop offset="85%" stopColor="rgba(255,255,255,0.03)" /><stop offset="100%" stopColor="rgba(255,255,255,0.2)" /></linearGradient>
          <linearGradient id="bl-object" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor={mc1} /><stop offset="100%" stopColor={mc2} /></linearGradient>
          <filter id="bl-shadow" x="-30%" y="-30%" width="160%" height="180%"><feDropShadow dx="0" dy="5" stdDeviation="4" floodColor="#000" floodOpacity="0.45" /></filter>
        </defs>
        <style>{`.bl-obj { transition: transform 0.9s cubic-bezier(.3,1.4,.4,1); } @media (prefers-reduced-motion: reduce) { .bl-obj { transition: none; } }`}</style>
        <rect width={W} height={H} rx={16} fill="url(#bl-bench)" />
        <rect x={1} y={1} width={W - 2} height={H - 2} rx={15} fill="none" stroke="rgba(255,255,255,0.12)" />

        {/* tank */}
        <rect x={TANK.x} y={TANK.y} width={TANK.w} height={TANK.h} rx={8} fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.35)" strokeWidth={3} />
        <rect x={TANK.x + 3} y={SURFACE_Y} width={TANK.w - 6} height={BOTTOM_Y - SURFACE_Y + 7} rx={4} fill="url(#bl-liquid)" />
        <path d={`M ${TANK.x + 3} ${SURFACE_Y} q 30 -6 60 0 t 60 0 t 60 0 t 60 0 t 60 0 t 60 0 t 60 0`} fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth={2} />
        <rect x={TANK.x + 3} y={TANK.y + 3} width={TANK.w - 6} height={TANK.h - 6} rx={6} fill="url(#bl-glass)" />
        <text x={TANK.x + TANK.w - 10} y={BOTTOM_Y - 4} textAnchor="end" fontSize={11} fill="rgba(255,255,255,0.8)">{state.liquid === "custom" ? `liquid ${state.liquid_density} kg/m³` : `${state.liquid} · ${LIQUIDS[state.liquid]} kg/m³`}</text>

        {/* object */}
        <g className="bl-obj" style={{ transform: `translate(${objX}px, ${objTop}px)` }}>
          <rect width={side} height={side} rx={8} fill="url(#bl-object)" filter="url(#bl-shadow)" stroke="rgba(0,0,0,0.4)" />
          <rect x={4} y={4} width={side - 8} height={side * 0.25} rx={5} fill="rgba(255,255,255,0.25)" />
          <text x={side / 2} y={side / 2 + 5} textAnchor="middle" fontSize={13} fontWeight={700} fill={state.material === "ice" || state.material === "aluminium" || state.material === "glass" || state.material === "wax" ? "#1f2937" : "#fff"}>{state.material}</text>
        </g>
        {/* forces */}
        {r && (
          <>
            {arrow(objTop + side / 2, objTop + side / 2 + 20 + Math.min(80, r.weight_n * 2), "#f87171", `weight ${r.weight_n} N`, objX + side + 24)}
            {arrow(objTop + side / 2, objTop + side / 2 - 20 - Math.min(80, r.buoyant_force_n * 2), "#34d399", `buoyancy ${r.buoyant_force_n} N`, objX - 24)}
          </>
        )}

        {/* depth scale + probe */}
        <g>
          <line x1={TANK.x + TANK.w + 40} y1={SURFACE_Y} x2={TANK.x + TANK.w + 40} y2={BOTTOM_Y} stroke="rgba(255,255,255,0.4)" strokeWidth={2} />
          {[0, 0.5, 1, 1.5, 2].map((d) => {
            const y = SURFACE_Y + (d / TANK_DEPTH_M) * DEPTH_PX;
            return <g key={d}><line x1={TANK.x + TANK.w + 34} y1={y} x2={TANK.x + TANK.w + 46} y2={y} stroke="rgba(255,255,255,0.5)" /><text x={TANK.x + TANK.w + 52} y={y + 4} fontSize={11} fill="rgba(255,255,255,0.7)">{d} m</text></g>;
          })}
          <g className={readOnly ? "" : "cursor-ns-resize"} onPointerDown={(e) => { if (!readOnly) { dragging.current = true; probeFromEvent(e); } }}>
            <line x1={TANK.x + 3} y1={probeY} x2={TANK.x + TANK.w + 40} y2={probeY} stroke="#fde68a" strokeWidth={1.5} strokeDasharray="4 4" />
            <circle cx={TANK.x + TANK.w + 40} cy={probeY} r={10} fill="#fbbf24" stroke="#78350f" strokeWidth={2} filter="url(#bl-shadow)" />
            <rect x={TANK.x + 10} y={Math.min(BOTTOM_Y - 50, Math.max(TANK.y + 6, probeY - 24))} width={132} height={46} rx={8} fill="rgba(0,0,0,0.55)" stroke="rgba(253,230,138,0.5)" />
            <text x={TANK.x + 18} y={Math.min(BOTTOM_Y - 50, Math.max(TANK.y + 6, probeY - 24)) + 16} fontSize={11} fill="rgba(255,255,255,0.75)">probe at {state.probe_depth_m.toFixed(2)} m</text>
            <text x={TANK.x + 18} y={Math.min(BOTTOM_Y - 50, Math.max(TANK.y + 6, probeY - 24)) + 37} fontSize={18} fontWeight={700} fill="#fde68a">{r?.pressure_kpa ?? 0} kPa</text>
          </g>
          <text x={TANK.x + TANK.w + 40} y={BOTTOM_Y + 22} textAnchor="middle" fontSize={10} fill="rgba(255,255,255,0.5)">{readOnly ? "" : "drag the probe"}</text>
        </g>

        {/* readouts */}
        {r && (
          <g transform={`translate(${TANK.x + TANK.w + 70} ${TANK.y + 20})`}>
            <rect width={150} height={118} rx={10} fill="rgba(0,0,0,0.35)" stroke="rgba(255,255,255,0.15)" />
            {[
              ["object", `${r.object_density.toFixed(0)} kg/m³`],
              ["liquid", `${r.liquid_density.toFixed(0)} kg/m³`],
              ["mass", `${r.mass_kg} kg`],
              ["submerged", `${Math.round(r.submerged_fraction * 100)}%`],
              ["result", floats ? "floats" : "sinks"],
            ].map(([k, v], i) => (
              <g key={k} transform={`translate(10 ${20 + i * 20})`}>
                <text fontSize={11} fill="rgba(255,255,255,0.6)">{k}</text>
                <text x={130} textAnchor="end" fontSize={12} fontWeight={600} fill={k === "result" ? (floats ? "#93cfad" : "#e8a4af") : "#fff"}>{v}</text>
              </g>
            ))}
          </g>
        )}
      </svg>
      {tasks && r && (
        <ul className="flex flex-wrap gap-2 text-xs">
          {tasks.map((t) => {
            const done = r.achieved.includes(t);
            return <li key={t} className={`lab-chip ${done ? "is-done" : ""}`}>{done ? "✓ " : ""}{TASKS[t] ?? t}</li>;
          })}
        </ul>
      )}
    </div>
  );
}
