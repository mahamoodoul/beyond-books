/**
 * Astronomy lab board, three views:
 * - Solar system: the inner planets on their orbits with real periods; Play, the Time slider, or
 *   drag Earth along its orbit.
 * - Sun–Earth–Moon: drag the Moon round Earth; phases, and solar or lunar eclipses with shadow cones.
 * - Seasons: Earth's tilted axis on its orbit, and a big globe lit from the side showing day and
 *   night at the chosen latitude.
 * Distances and sizes are not to scale; the board says so.
 */
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

import { compute, MAX_DAYS, orbitsDone, PLANETS, seasonAt, TASKS, YEAR, type OrbitsResult, type OrbitsState, type Season } from "./engines/orbits";
import { LabSegment, LabSlider, TaskChips } from "./LabSlider";
import { useLabClock } from "./useLabClock";
import "./labs-sci.css";

const W = 760;
const H = 440;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const mod = (a: number, n: number) => ((a % n) + n) % n;
const PLAY_SPEED = 45; // days per second

const ORBIT = { cx: 270, cy: 222 };
const PLANET_LOOK: Record<string, { r: number; orbit: number; color: [string, string] }> = {
  Mercury: { r: 5, orbit: 55, color: ["#e7e5e4", "#78716c"] },
  Venus: { r: 8, orbit: 92, color: ["#fef3c7", "#d97706"] },
  Earth: { r: 9, orbit: 136, color: ["#93c5fd", "#1d4ed8"] },
  Mars: { r: 7, orbit: 186, color: ["#fdba74", "#c2410c"] },
};

export function dateOf(days: number): string {
  const d = new Date(Date.UTC(2026, 2, 20) + Math.round(mod(days, YEAR)) * 86_400_000);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

/** SVG path of the lit part of the Moon seen from Earth, for an angle (0 new, 180 full). */
export function moonPhasePath(cx: number, cy: number, R: number, a: number): string {
  const right = mod(a, 360) < 180; // waxing: lit on the right
  const rx = Math.abs(Math.cos(rad(a))) * R;
  const crescent = Math.cos(rad(a)) > 0;
  const outer = right ? 1 : 0;
  const inner = crescent ? (right ? 0 : 1) : right ? 1 : 0;
  return `M ${cx} ${cy - R} A ${R} ${R} 0 0 ${outer} ${cx} ${cy + R} A ${rx} ${R} 0 0 ${inner} ${cx} ${cy - R} Z`;
}

function Defs() {
  return (
    <defs>
      <linearGradient id="ob-bench" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0f172a" /><stop offset="100%" stopColor="#020617" /></linearGradient>
      <radialGradient id="ob-sun" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#fffbeb" /><stop offset="35%" stopColor="#fde047" /><stop offset="70%" stopColor="#f59e0b" /><stop offset="100%" stopColor="rgba(245,158,11,0)" /></radialGradient>
      <radialGradient id="ob-earth" cx="35%" cy="35%" r="75%"><stop offset="0%" stopColor="#bfdbfe" /><stop offset="55%" stopColor="#2563eb" /><stop offset="100%" stopColor="#1e3a8a" /></radialGradient>
      {Object.entries(PLANET_LOOK).map(([n, p]) => (
        <radialGradient key={n} id={`ob-${n}`} cx="35%" cy="35%" r="70%"><stop offset="0%" stopColor={p.color[0]} /><stop offset="100%" stopColor={p.color[1]} /></radialGradient>
      ))}
      <filter id="ob-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6" /></filter>
    </defs>
  );
}

function Stars() {
  const stars = Array.from({ length: 70 }, (_, i) => ({ x: (i * 137.5) % W, y: (i * 89.3 + (i % 7) * 31) % H, r: i % 9 === 0 ? 1.4 : 0.8 }));
  return <g opacity={0.6}>{stars.map((s, i) => <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#fff" />)}</g>;
}

function SystemView({ days, onDragEarth, readOnly }: { days: number; onDragEarth: (e: ReactPointerEvent) => void; readOnly: boolean }) {
  return (
    <g>
      <circle cx={ORBIT.cx} cy={ORBIT.cy} r={46} fill="url(#ob-sun)" filter="url(#ob-glow)" opacity={0.8} />
      <circle cx={ORBIT.cx} cy={ORBIT.cy} r={24} fill="url(#ob-sun)" />
      {Object.entries(PLANETS).map(([name, period]) => {
        const look = PLANET_LOOK[name]!;
        const a = rad((360 * days) / period);
        const x = ORBIT.cx + look.orbit * Math.cos(a);
        const y = ORBIT.cy - look.orbit * Math.sin(a);
        const earth = name === "Earth";
        return (
          <g key={name}>
            <circle cx={ORBIT.cx} cy={ORBIT.cy} r={look.orbit} fill="none" stroke={earth ? "rgba(147,197,253,0.55)" : "rgba(255,255,255,0.18)"} strokeDasharray={earth ? undefined : "3 5"} />
            <g className={earth && !readOnly ? "cursor-grab" : ""} onPointerDown={earth && !readOnly ? onDragEarth : undefined}>
              {earth && !readOnly && <circle cx={x} cy={y} r={20} fill="rgba(147,197,253,0.15)" stroke="rgba(147,197,253,0.6)" strokeDasharray="3 3" />}
              <circle cx={x} cy={y} r={look.r} fill={`url(#ob-${name})`} />
            </g>
            <text x={x} y={y - look.r - 6} textAnchor="middle" fontSize={11} fill="rgba(255,255,255,0.85)">{name}</text>
          </g>
        );
      })}
    </g>
  );
}

const MOON = { ex: 330, ey: 222, R: 135 };
function moonXY(a: number): [number, number] {
  return [MOON.ex - MOON.R * Math.cos(rad(a)), MOON.ey + MOON.R * Math.sin(rad(a))];
}

function MoonView({ angle, eclipse, onDragMoon, readOnly }: { angle: number; eclipse: OrbitsResult["eclipse"]; onDragMoon: (e: ReactPointerEvent) => void; readOnly: boolean }) {
  const [mx, my] = moonXY(angle);
  const er = 34;
  const mr = 13;
  return (
    <g>
      {/* the Sun, far to the left; sunlight */}
      <circle cx={-30} cy={MOON.ey} r={120} fill="url(#ob-sun)" filter="url(#ob-glow)" opacity={0.75} />
      <circle cx={-40} cy={MOON.ey} r={80} fill="url(#ob-sun)" />
      {[-150, -100, -50, 0, 50, 100, 150].map((dy) => <line key={dy} x1={70} x2={500} y1={MOON.ey + dy} y2={MOON.ey + dy} stroke="rgba(253,224,71,0.12)" strokeWidth={2} />)}
      <text x={52} y={MOON.ey + 104} fontSize={11} fill="rgba(253,224,71,0.8)">sunlight →</text>
      {/* shadow cones */}
      {eclipse === "lunar" && <polygon points={`${MOON.ex} ${MOON.ey - er} ${MOON.ex} ${MOON.ey + er} ${MOON.ex + MOON.R + 60} ${MOON.ey + 8} ${MOON.ex + MOON.R + 60} ${MOON.ey - 8}`} fill="rgba(2,6,23,0.75)" />}
      {eclipse === "solar" && <polygon points={`${mx} ${my - mr} ${mx} ${my + mr} ${MOON.ex - er + 2} ${MOON.ey + 3} ${MOON.ex - er + 2} ${MOON.ey - 3}`} fill="rgba(2,6,23,0.85)" />}
      {/* Moon orbit */}
      <circle cx={MOON.ex} cy={MOON.ey} r={MOON.R} fill="none" stroke="rgba(255,255,255,0.25)" strokeDasharray="4 6" />
      {/* Earth: lit half faces the Sun */}
      <circle cx={MOON.ex} cy={MOON.ey} r={er} fill="url(#ob-earth)" />
      <path d={`M ${MOON.ex} ${MOON.ey - er} A ${er} ${er} 0 0 1 ${MOON.ex} ${MOON.ey + er} Z`} fill="rgba(2,6,23,0.6)" />
      {eclipse === "solar" && <circle cx={MOON.ex - er + 5} cy={MOON.ey} r={5} fill="#020617" stroke="#fde047" strokeWidth={1} />}
      <text x={MOON.ex} y={MOON.ey + er + 18} textAnchor="middle" fontSize={11} fill="rgba(255,255,255,0.85)">Earth</text>
      {/* Moon */}
      <g className={readOnly ? "" : "cursor-grab"} onPointerDown={readOnly ? undefined : onDragMoon}>
        {!readOnly && <circle cx={mx} cy={my} r={24} fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.45)" strokeDasharray="3 3" />}
        <circle cx={mx} cy={my} r={mr} fill={eclipse === "lunar" ? "#7f1d1d" : "#e5e7eb"} />
        {eclipse !== "lunar" && <path d={`M ${mx} ${my - mr} A ${mr} ${mr} 0 0 1 ${mx} ${my + mr} Z`} fill="rgba(2,6,23,0.7)" />}
        {eclipse === "lunar" && <circle cx={mx} cy={my} r={mr + 5} fill="none" stroke="rgba(248,113,113,0.6)" strokeWidth={3} />}
      </g>
      <text x={mx} y={my - 22} textAnchor="middle" fontSize={11} fill="rgba(255,255,255,0.85)">Moon</text>
      {eclipse && (
        <g>
          <rect x={150} y={18} width={250} height={28} rx={8} fill="rgba(0,0,0,0.6)" stroke="rgba(253,224,71,0.6)" />
          <text x={275} y={37} textAnchor="middle" fontSize={13} fontWeight={700} fill="#fde047">{eclipse === "solar" ? "☀ Solar eclipse" : "🌑 Lunar eclipse"}</text>
        </g>
      )}
    </g>
  );
}

const SEASON_ORBIT = { sx: 150, sy: 210, rx: 112, ry: 54 };
function earthOnSeasonOrbit(earthAngle: number): [number, number] {
  return [SEASON_ORBIT.sx + SEASON_ORBIT.rx * Math.sin(rad(earthAngle)), SEASON_ORBIT.sy + SEASON_ORBIT.ry * Math.cos(rad(earthAngle))];
}

function SeasonsView({ earthAngle, tilt, declination, latitude, dayHours, onDragEarth, readOnly }: { earthAngle: number; tilt: number; declination: number; latitude: number; dayHours: number; onDragEarth: (e: ReactPointerEvent) => void; readOnly: boolean }) {
  const { sx, sy, rx, ry } = SEASON_ORBIT;
  const [ex, ey] = earthOnSeasonOrbit(earthAngle);
  const G = { cx: 420, cy: 222, R: 96 };
  const latY = -G.R * Math.sin(rad(latitude));
  const latW = G.R * Math.cos(rad(latitude));
  const marks: [number, string][] = [[0, "Mar"], [90, "Jun"], [180, "Sep"], [270, "Dec"]];
  return (
    <g>
      {/* orbit seen at an angle; the axis always leans the same way in space */}
      <ellipse cx={sx} cy={sy} rx={rx} ry={ry} fill="none" stroke="rgba(255,255,255,0.3)" strokeDasharray="4 5" />
      <circle cx={sx} cy={sy} r={34} fill="url(#ob-sun)" filter="url(#ob-glow)" opacity={0.8} />
      <circle cx={sx} cy={sy} r={18} fill="url(#ob-sun)" />
      {marks.map(([a, label]) => {
        const [x, y] = earthOnSeasonOrbit(a);
        return (
          <g key={label} opacity={0.5}>
            <circle cx={x} cy={y} r={6} fill="#64748b" />
            <line x1={x} y1={y - 10} x2={x} y2={y + 10} stroke="#94a3b8" transform={`rotate(${-tilt} ${x} ${y})`} />
            <text x={x} y={y + (a === 0 ? 24 : a === 180 ? -14 : 4)} dx={a === 90 ? 14 : a === 270 ? -14 : 0} textAnchor={a === 90 ? "start" : a === 270 ? "end" : "middle"} fontSize={10} fill="rgba(255,255,255,0.8)">{label}</text>
          </g>
        );
      })}
      <g className={readOnly ? "" : "cursor-grab"} onPointerDown={readOnly ? undefined : onDragEarth}>
        {!readOnly && <circle cx={ex} cy={ey} r={20} fill="rgba(147,197,253,0.15)" stroke="rgba(147,197,253,0.6)" strokeDasharray="3 3" />}
        <circle cx={ex} cy={ey} r={10} fill="url(#ob-earth)" />
        <line x1={ex} y1={ey - 17} x2={ex} y2={ey + 17} stroke="#fde68a" strokeWidth={2} transform={`rotate(${-tilt} ${ex} ${ey})`} />
      </g>
      <text x={sx} y={sy + ry + 40} textAnchor="middle" fontSize={10} fill="rgba(255,255,255,0.55)">{readOnly ? "" : "drag Earth along its orbit"}</text>

      {/* big globe: sunlight from the left, north pole leaning toward the Sun by the declination */}
      {[-70, -35, 0, 35, 70].map((dy) => <line key={dy} x1={290} x2={318} y1={G.cy + dy} y2={G.cy + dy} stroke="rgba(253,224,71,0.55)" strokeWidth={2} markerEnd="url(#ob-ray)" />)}
      <text x={290} y={G.cy - 88} fontSize={10} fill="rgba(253,224,71,0.8)">sunlight</text>
      <g transform={`rotate(${-declination} ${G.cx} ${G.cy})`}>
        <circle cx={G.cx} cy={G.cy} r={G.R} fill="url(#ob-earth)" />
        <line x1={G.cx} y1={G.cy - G.R - 22} x2={G.cx} y2={G.cy + G.R + 22} stroke="#fde68a" strokeWidth={2.5} />
        <text x={G.cx + 6} y={G.cy - G.R - 12} fontSize={10} fill="#fde68a">N</text>
        <ellipse cx={G.cx} cy={G.cy} rx={G.R} ry={G.R * 0.1} fill="none" stroke="rgba(255,255,255,0.45)" />
        <ellipse cx={G.cx} cy={G.cy + latY} rx={latW} ry={latW * 0.1} fill="none" stroke="#f472b6" strokeWidth={2.5} />
        <circle cx={G.cx} cy={G.cy + latY + latW * 0.1} r={5} fill="#f472b6" stroke="#fff" />
      </g>
      {/* night side: the half away from the Sun */}
      <path d={`M ${G.cx} ${G.cy - G.R} A ${G.R} ${G.R} 0 0 1 ${G.cx} ${G.cy + G.R} Z`} fill="rgba(2,6,23,0.62)" />
      <line x1={G.cx} y1={G.cy - G.R} x2={G.cx} y2={G.cy + G.R} stroke="rgba(253,224,71,0.35)" strokeDasharray="3 4" />
      <text x={G.cx - G.R + 6} y={G.cy + G.R + 22} fontSize={10} fill="rgba(253,224,71,0.85)">day side</text>
      <text x={G.cx + G.R - 6} y={G.cy + G.R + 22} textAnchor="end" fontSize={10} fill="rgba(148,163,184,0.9)">night side</text>
      <text x={G.cx} y={G.cy + G.R + 40} textAnchor="middle" fontSize={11} fill="#f9a8d4">{latitude}° N: {dayHours} h of daylight</text>
    </g>
  );
}

export function OrbitsLab({
  state, onChange, result, allowTilt = true, readOnly = false, toolbar,
}: {
  state: OrbitsState; onChange: (s: OrbitsState) => void; result: OrbitsResult | null;
  allowTilt?: boolean; readOnly?: boolean; toolbar?: ReactNode;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [preview, setPreview] = useState<Partial<OrbitsState>>({});
  const [play, setPlay] = useState<{ t0: number; from: number } | null>(null);
  const t = useLabClock(true);
  const dragging = useRef<"earth" | "season-earth" | "moon" | null>(null);
  const playDays = play ? Math.min(MAX_DAYS, Math.round(play.from + (t - play.t0) * PLAY_SPEED)) : null;
  const s: OrbitsState = { ...state, ...preview, ...(playDays !== null ? { days: playDays } : {}) };
  // while previewing (drag, slider, play) the board follows the local state at once
  const live = Object.keys(preview).length || play ? compute(s) : null;
  const r = result ? (live ? { ...result, ...live } : result) : null;

  const set = (patch: Partial<OrbitsState>) => {
    if (readOnly) return;
    const next = { ...state, ...patch };
    if (next.tilt >= 10) {
      const seen = new Set<Season>(next.seen_seasons);
      if (state.tilt >= 10) seen.add(seasonAt(state.days));
      seen.add(seasonAt(next.days));
      next.seen_seasons = (["spring", "summer", "autumn", "winter"] as Season[]).filter((x) => seen.has(x));
    }
    onChange(next);
  };
  const ended = playDays !== null && playDays >= MAX_DAYS;
  useEffect(() => {
    if (!ended) return;
    setPlay(null);
    set({ days: MAX_DAYS });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ended]);
  const togglePlay = () => {
    if (play) {
      setPlay(null);
      if (playDays !== null) set({ days: playDays });
    } else {
      setPlay({ t0: t, from: state.days >= MAX_DAYS ? 0 : state.days });
    }
  };

  const svgPoint = (e: ReactPointerEvent | PointerEvent): [number, number] => {
    const rect = svgRef.current!.getBoundingClientRect();
    return [((e.clientX - rect.left) / rect.width) * W, ((e.clientY - rect.top) / rect.height) * H];
  };
  const daysFromAngle = (a: number) => {
    const base = orbitsDone(state.days, YEAR) * YEAR;
    return Math.max(0, Math.min(MAX_DAYS, Math.round(base + (mod(a, 360) / 360) * YEAR)));
  };
  const onMove = (e: ReactPointerEvent) => {
    if (!dragging.current) return;
    const [x, y] = svgPoint(e);
    if (dragging.current === "earth") setPreview({ days: daysFromAngle(deg(Math.atan2(-(y - ORBIT.cy), x - ORBIT.cx))) });
    if (dragging.current === "season-earth") setPreview({ days: daysFromAngle(deg(Math.atan2((x - SEASON_ORBIT.sx) / SEASON_ORBIT.rx, (y - SEASON_ORBIT.sy) / SEASON_ORBIT.ry))) });
    if (dragging.current === "moon") setPreview({ moon_angle: Math.round(mod(deg(Math.atan2(y - MOON.ey, -(x - MOON.ex))), 360)) % 360 });
  };
  const endDrag = () => {
    if (!dragging.current) return;
    dragging.current = null;
    const p = preview;
    setPreview({});
    if (Object.keys(p).length) set(p);
  };
  const startDrag = (kind: "earth" | "season-earth" | "moon") => (e: ReactPointerEvent) => {
    e.preventDefault();
    if (play) togglePlay();
    dragging.current = kind;
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  const timeSlider = (
    <LabSlider label={s.view === "seasons" ? "Date" : "Time"} value={state.days} min={0} max={MAX_DAYS} step={1} format={(v) => (s.view === "seasons" ? dateOf(v) : `day ${v}`)} disabled={!!play}
      onPreview={(v) => setPreview((p) => ({ ...p, days: v ?? undefined }))} onCommit={(v) => set({ days: v })} />
  );

  return (
    <div className="space-y-2">
      {!readOnly && (
        <div className="lab-controls">
          <LabSegment label="View" value={s.view} options={[{ value: "system", label: "Solar system" }, { value: "moon", label: "Sun–Earth–Moon" }, { value: "seasons", label: "Seasons" }]} onChange={(v) => set({ view: v })} />
          {s.view === "system" && (
            <>
              <button type="button" className="lab-action" onClick={togglePlay}>{play ? "■ Stop" : "▶ Play"}</button>
              {timeSlider}
              <div className="lab-seg-btns">
                <button type="button" disabled={!!play} onClick={() => set({ days: Math.min(MAX_DAYS, state.days + 30) })}>+1 month</button>
                <button type="button" disabled={!!play} onClick={() => set({ days: Math.min(MAX_DAYS, state.days + 365) })}>+1 year</button>
                <button type="button" disabled={!!play || state.days === 0} onClick={() => set({ days: 0 })}>Reset</button>
              </div>
            </>
          )}
          {s.view === "moon" && (
            <LabSlider label="Moon" value={state.moon_angle} min={0} max={359} step={1} unit="°" onPreview={(v) => setPreview((p) => ({ ...p, moon_angle: v ?? undefined }))} onCommit={(v) => set({ moon_angle: v })} />
          )}
          {s.view === "seasons" && (
            <>
              {timeSlider}
              {allowTilt && <LabSlider label="Tilt" value={state.tilt} min={0} max={45} step={0.1} unit="°" format={(v) => v.toFixed(1)} onPreview={(v) => setPreview((p) => ({ ...p, tilt: v ?? undefined }))} onCommit={(v) => set({ tilt: Math.round(v * 10) / 10 })} />}
              <LabSlider label="Latitude" value={state.latitude} min={0} max={80} step={1} unit="° N" onPreview={(v) => setPreview((p) => ({ ...p, latitude: v ?? undefined }))} onCommit={(v) => set({ latitude: v })} />
            </>
          )}
          {toolbar}
        </div>
      )}

      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full touch-none select-none rounded-2xl shadow-lg ring-1 ring-slate-900/40" role="img"
        aria-label={s.view === "system" ? `Solar system on day ${s.days}` : s.view === "moon" ? `Moon: ${r?.moon_phase ?? ""}` : `Seasons: ${r?.season ?? ""}`}
        onPointerMove={onMove} onPointerUp={endDrag} onPointerLeave={endDrag}>
        <Defs />
        <defs><marker id="ob-ray" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill="rgba(253,224,71,0.7)" /></marker></defs>
        <rect width={W} height={H} rx={16} fill="url(#ob-bench)" />
        <Stars />
        <rect x={1} y={1} width={W - 2} height={H - 2} rx={15} fill="none" stroke="rgba(255,255,255,0.12)" />
        {s.view === "system" && <SystemView days={s.days} onDragEarth={startDrag("earth")} readOnly={readOnly} />}
        {s.view === "moon" && <MoonView angle={s.moon_angle} eclipse={r?.eclipse ?? null} onDragMoon={startDrag("moon")} readOnly={readOnly} />}
        {s.view === "seasons" && r && <SeasonsView earthAngle={r.earth_angle} tilt={s.tilt} declination={r.declination} latitude={s.latitude} dayHours={r.day_hours} onDragEarth={startDrag("season-earth")} readOnly={readOnly} />}

        {/* readouts */}
        {r && (
          <g transform="translate(540 24)">
            <rect width={204} height={s.view === "system" ? 196 : 236} rx={12} fill="rgba(15,23,42,0.75)" stroke="rgba(255,255,255,0.15)" />
            {s.view === "system" && (
              <>
                <text x={14} y={24} fontSize={12} fontWeight={700} fill="#fff">Day {s.days} · {dateOf(s.days)}</text>
                <text x={14} y={48} fontSize={10} fill="rgba(255,255,255,0.55)">planet</text>
                <text x={120} y={48} textAnchor="end" fontSize={10} fill="rgba(255,255,255,0.55)">1 year =</text>
                <text x={190} y={48} textAnchor="end" fontSize={10} fill="rgba(255,255,255,0.55)">orbits</text>
                {r.planets.map((p, i) => (
                  <g key={p.name} transform={`translate(14 ${72 + i * 26})`}>
                    <circle cx={5} cy={-4} r={5} fill={`url(#ob-${p.name})`} />
                    <text x={16} fontSize={12} fill="#fff">{p.name}</text>
                    <text x={106} textAnchor="end" fontSize={12} fill="rgba(255,255,255,0.8)">{Math.round(p.period_days)} d</text>
                    <text x={176} textAnchor="end" fontSize={14} fontWeight={700} fill="#fde68a">{p.orbits}</text>
                  </g>
                ))}
                <text x={14} y={186} fontSize={10} fill="rgba(255,255,255,0.45)">sizes and distances not to scale</text>
              </>
            )}
            {s.view === "moon" && (
              <>
                <text x={14} y={24} fontSize={12} fontWeight={700} fill="#fff">Seen from Earth</text>
                <circle cx={102} cy={92} r={46} fill="#1f2937" />
                {r.eclipse === "lunar" ? <circle cx={102} cy={92} r={46} fill="#991b1b" /> : r.illuminated > 0.005 && <path d={moonPhasePath(102, 92, 46, s.moon_angle)} fill="#f1f5f9" />}
                {r.eclipse === "solar" && <circle cx={102} cy={92} r={52} fill="none" stroke="#fde68a" strokeWidth={3} opacity={0.8} />}
                <text x={102} y={160} textAnchor="middle" fontSize={14} fontWeight={700} fill="#fde68a">{r.moon_phase}</text>
                <text x={102} y={180} textAnchor="middle" fontSize={11} fill="rgba(255,255,255,0.7)">{Math.round(r.illuminated * 100)} % lit · {s.moon_angle}° from new</text>
                <text x={14} y={208} fontSize={9.5} fill="rgba(255,255,255,0.5)">Real orbit is tilted ~5°, so most new</text>
                <text x={14} y={222} fontSize={9.5} fill="rgba(255,255,255,0.5)">and full moons miss the eclipse line.</text>
              </>
            )}
            {s.view === "seasons" && (
              <>
                <text x={14} y={24} fontSize={12} fontWeight={700} fill="#fff">{dateOf(s.days)} · {s.tilt === 0 ? "no seasons" : `northern ${r.season}`}</text>
                <text x={14} y={50} fontSize={11} fill="rgba(255,255,255,0.6)">Sun overhead at</text>
                <text x={190} y={50} textAnchor="end" fontSize={12} fontWeight={600} fill="#fff">{Math.abs(r.declination)}° {r.declination >= 0 ? "N" : "S"}</text>
                <text x={14} y={78} fontSize={11} fill="rgba(255,255,255,0.6)">daylight at {s.latitude}° N</text>
                <text x={190} y={78} textAnchor="end" fontSize={16} fontWeight={800} fill="#fde68a">{r.day_hours} h</text>
                <rect x={14} y={86} width={176} height={10} rx={5} fill="#1e293b" />
                <rect x={14} y={86} width={176 * (r.day_hours / 24)} height={10} rx={5} fill="#fbbf24" style={{ transition: "width .4s" }} />
                <text x={14} y={122} fontSize={11} fill="rgba(255,255,255,0.6)">Sun at noon</text>
                <text x={190} y={122} textAnchor="end" fontSize={12} fontWeight={600} fill="#fff">{r.noon_sun}° high</text>
                {/* noon sun height */}
                <line x1={30} y1={214} x2={180} y2={214} stroke="#64748b" strokeWidth={2} />
                <path d="M 120 214 A 60 60 0 0 0 60 214" fill="none" stroke="rgba(255,255,255,0.15)" />
                <line x1={120} y1={214} x2={120 - 70 * Math.cos(rad(r.noon_sun))} y2={214 - 70 * Math.sin(rad(r.noon_sun))} stroke="#fde047" strokeWidth={2} strokeDasharray="4 3" />
                <circle cx={120 - 70 * Math.cos(rad(r.noon_sun))} cy={214 - 70 * Math.sin(rad(r.noon_sun))} r={8} fill="url(#ob-sun)" />
                <rect x={114} y={202} width={12} height={12} rx={2} fill="#94a3b8" />
                <text x={30} y={230} fontSize={9.5} fill="rgba(255,255,255,0.5)">horizon (looking south)</text>
              </>
            )}
          </g>
        )}
      </svg>
      {r && <TaskChips tasks={r.tasks} achieved={r.achieved} labels={TASKS} />}
    </div>
  );
}
