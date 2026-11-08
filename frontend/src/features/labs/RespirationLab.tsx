/**
 * Biology lab board: breathing and gas exchange. Lungs view: a chest with ribs, trachea, two
 * lungs and the diaphragm, which flattens on breathing in and domes up on breathing out (by hand,
 * or "Auto" at the chosen rate). Alveolus view: one air sac wrapped by a capillary, oxygen
 * crossing into red blood cells and CO2 coming out; "Trace oxygen" follows one molecule.
 */
import { useState, type ReactNode } from "react";

import { ACTIVITIES, TASKS, type RespirationResult, type RespirationState } from "./engines/respiration";
import { LabSegment, LabSlider, TaskChips } from "./LabSlider";
import { prefersReducedMotion, useLabClock } from "./useLabClock";
import "./labs-sci.css";

const W = 760;
const H = 420;
const CX = 245; // chest centre

const ACTIVITY_LABEL: Record<string, string> = { rest: "Rest", walk: "Walk", run: "Run" };

/* cubic bezier for the capillary */
const CAP = [[30, 232], [140, 362], [360, 362], [470, 232]] as const; // wraps the bottom of the air sac
function capPoint(u: number): [number, number] {
  const v = 1 - u;
  const [p0, p1, p2, p3] = CAP;
  return [
    v * v * v * p0[0] + 3 * v * v * u * p1[0] + 3 * v * u * u * p2[0] + u * u * u * p3[0],
    v * v * v * p0[1] + 3 * v * v * u * p1[1] + 3 * v * u * u * p2[1] + u * u * u * p3[1],
  ];
}
const frac = (x: number) => x - Math.floor(x);
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const ease = (u: number) => (1 - Math.cos(Math.PI * Math.min(1, Math.max(0, u)))) / 2;

function Lungs({ k, phase }: { k: number; phase: "in" | "out" }) {
  // k: 0 = fully out, 1 = fully in
  const diaY = lerp(318, 338, k); // diaphragm edge height
  const dome = lerp(78, 26, k); // how far the middle bulges up
  const lungTop = 112;
  const lungBottom = diaY - dome * 0.55;
  const rx = lerp(56, 66, k);
  const ry = (lungBottom - lungTop) / 2;
  const cy = (lungTop + lungBottom) / 2;
  const spread = lerp(0, 10, k);
  const pink = ["#fda4af", "#e11d48"];
  return (
    <g>
      <defs>
        <radialGradient id="rl-lung" cx="40%" cy="35%" r="75%"><stop offset="0%" stopColor={pink[0]} /><stop offset="100%" stopColor={pink[1]} /></radialGradient>
        <linearGradient id="rl-dia" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f59e0b" /><stop offset="100%" stopColor="#b45309" /></linearGradient>
      </defs>
      {/* torso */}
      <path d={`M ${CX - 150 - spread} 90 Q ${CX - 165 - spread} 230 ${CX - 140 - spread} 370 L ${CX + 140 + spread} 370 Q ${CX + 165 + spread} 230 ${CX + 150 + spread} 90 Q ${CX} 62 ${CX - 150 - spread} 90 Z`} fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.25)" strokeWidth={2} />
      {/* lungs */}
      {[-1, 1].map((side) => (
        <g key={side} filter="url(#rl-shadow)">
          <ellipse cx={CX + side * (rx + 12)} cy={cy} rx={rx} ry={ry} fill="url(#rl-lung)" opacity={0.92} />
          {/* bronchial tree */}
          <path d={`M ${CX + side * 18} 128 Q ${CX + side * 50} 150 ${CX + side * (rx + 12)} ${cy - 10} M ${CX + side * 48} 150 L ${CX + side * 60} ${cy + 30} M ${CX + side * 62} 175 L ${CX + side * 98} ${cy + 10}`} stroke="rgba(255,255,255,0.45)" strokeWidth={3} fill="none" strokeLinecap="round" />
        </g>
      ))}
      {/* trachea */}
      <rect x={CX - 9} y={30} width={18} height={100} rx={8} fill="#e2e8f0" stroke="#94a3b8" />
      {[44, 58, 72, 86, 100, 114].map((y) => <line key={y} x1={CX - 9} x2={CX + 9} y1={y} y2={y} stroke="#94a3b8" />)}
      {/* ribs */}
      {[0, 1, 2, 3, 4].map((i) => {
        const y = 128 + i * 40 - k * 6 * (5 - i) * 0.4; // ribs lift when breathing in
        const half = 128 + i * 8 + spread;
        return <path key={i} d={`M ${CX - half} ${y + 18} Q ${CX} ${y - 22} ${CX + half} ${y + 18}`} fill="none" stroke="rgba(241,245,249,0.55)" strokeWidth={5} strokeLinecap="round" />;
      })}
      {/* diaphragm */}
      <path d={`M ${CX - 148 - spread} ${diaY} Q ${CX} ${diaY - dome * 2} ${CX + 148 + spread} ${diaY}`} fill="none" stroke="url(#rl-dia)" strokeWidth={9} strokeLinecap="round" />
      <path d={`M ${CX + 120} ${diaY - 6} l 0 ${phase === "in" ? 16 : -16}`} stroke="#fbbf24" strokeWidth={3} markerEnd="url(#rl-arrow)" opacity={0.9} />
      {/* labels */}
      <g fontSize={11} fill="rgba(255,255,255,0.8)">
        <text x={CX + 16} y={44}>trachea</text>
        <text x={CX - 2 * rx - 40} y={cy - ry + 10}>lung</text>
        <text x={CX - 150} y={diaY + 26}>diaphragm {phase === "in" ? "contracts ↓ (flat)" : "relaxes ↑ (dome)"}</text>
        <text x={CX + 92} y={118}>ribs {phase === "in" ? "lift ↑" : "drop ↓"}</text>
      </g>
    </g>
  );
}

function AirFlow({ t, phase, rate }: { t: number; phase: "in" | "out"; rate: number }) {
  const speed = rate / 12;
  return (
    <g>
      {[0, 1, 2, 3].map((i) => {
        const u = frac(t * 0.6 * speed + i / 4);
        const y = phase === "in" ? lerp(4, 120, u) : lerp(120, 4, u);
        return <circle key={i} cx={CX + (i % 2 ? 3 : -3)} cy={y} r={3.5} fill={phase === "in" ? "#7dd3fc" : "#cbd5e1"} opacity={1 - Math.abs(u - 0.5)} />;
      })}
      <text x={CX - 14} y={14} textAnchor="end" fontSize={11} fill={phase === "in" ? "#7dd3fc" : "#cbd5e1"}>{phase === "in" ? "air in ↓" : "air out ↑"}</text>
    </g>
  );
}

function Alveolus({ t, rate, traced, saturation }: { t: number; rate: number; traced: boolean; saturation: number }) {
  const speed = 0.25 * (rate / 12);
  const center: [number, number] = [250, 190];
  const r = 118;
  const rbc = Array.from({ length: 7 }, (_, i) => frac(t * 0.07 * (rate / 12) + i / 7));
  // the traced molecule: 0-0.35 drifts down in the air sac, 0.35-0.55 crosses the wall, then rides a red cell
  const tu = frac(t / 7);
  let tracer: [number, number];
  let stage: string;
  if (tu < 0.35) {
    const u = ease(tu / 0.35);
    tracer = [lerp(230, 250, u), lerp(110, 292, u)];
    stage = "1. Oxygen arrives in the air sac with the breath";
  } else if (tu < 0.55) {
    const u = ease((tu - 0.35) / 0.2);
    const [x, y] = capPoint(0.5);
    tracer = [lerp(250, x, u), lerp(292, y, u)];
    stage = "2. It diffuses through the thin wall (one cell thick)";
  } else {
    const u = (tu - 0.55) / 0.45;
    tracer = capPoint(lerp(0.5, 1, u));
    stage = "3. A red blood cell carries it away, to the heart";
  }
  const blood = saturation >= 95 ? "#dc2626" : "#9f1239";
  return (
    <g>
      <defs>
        <radialGradient id="rl-sac" cx="45%" cy="40%" r="70%"><stop offset="0%" stopColor="rgba(254,205,211,0.35)" /><stop offset="100%" stopColor="rgba(244,114,182,0.15)" /></radialGradient>
      </defs>
      {/* bronchiole into the sac */}
      <path d="M 250 0 L 250 74" stroke="rgba(244,114,182,0.55)" strokeWidth={26} strokeLinecap="round" />
      <circle cx={center[0]} cy={center[1]} r={r} fill="url(#rl-sac)" stroke="#f9a8d4" strokeWidth={5} />
      <text x={center[0]} y={center[1] - r + 34} textAnchor="middle" fontSize={12} fill="rgba(255,255,255,0.85)">alveolus (air sac)</text>
      {/* capillary */}
      <path d={`M ${CAP[0][0]} ${CAP[0][1]} C ${CAP[1][0]} ${CAP[1][1]} ${CAP[2][0]} ${CAP[2][1]} ${CAP[3][0]} ${CAP[3][1]}`} fill="none" stroke="rgba(220,38,38,0.45)" strokeWidth={42} strokeLinecap="round" />
      <text x={14} y={214} fontSize={11} fill="rgba(255,255,255,0.75)">capillary: blood low in O₂ ↓</text>
      <text x={440} y={214} fontSize={11} fill="rgba(255,255,255,0.75)">↑ rich in O₂</text>
      {rbc.map((u, i) => {
        const [x, y] = capPoint(u);
        return <ellipse key={i} cx={x} cy={y} rx={13} ry={8} fill={u > 0.5 ? blood : "#7f1d1d"} stroke="rgba(0,0,0,0.3)" />;
      })}
      {/* O2 in, CO2 out */}
      {Array.from({ length: 8 }, (_, i) => {
        const u = frac(t * speed + i / 8);
        const x0 = 170 + (i * 23) % 160;
        const [cx2, cy2] = capPoint(0.25 + (i % 5) * 0.12);
        const o2: [number, number] = u < 0.7 ? [x0, lerp(120 + (i % 3) * 30, 296, u / 0.7)] : [lerp(x0, cx2, (u - 0.7) / 0.3), lerp(296, cy2, (u - 0.7) / 0.3)];
        const w = frac(u + 0.5);
        const co2: [number, number] = w < 0.3 ? [lerp(cx2, x0 + 14, w / 0.3), lerp(cy2, 290, w / 0.3)] : [x0 + 14, lerp(290, 90, (w - 0.3) / 0.7)];
        return (
          <g key={i}>
            <circle cx={o2[0]} cy={o2[1]} r={5} fill="#38bdf8" opacity={0.85} />
            <circle cx={co2[0]} cy={co2[1]} r={5} fill="#a3a3a3" opacity={0.75} />
          </g>
        );
      })}
      <g fontSize={11}>
        <circle cx={600} cy={318} r={5} fill="#38bdf8" /><text x={610} y={322} fill="rgba(255,255,255,0.8)">O₂ into the blood</text>
        <circle cx={600} cy={338} r={5} fill="#a3a3a3" /><text x={610} y={342} fill="rgba(255,255,255,0.8)">CO₂ out, breathed out</text>
      </g>
      {traced && (
        <g>
          <circle cx={tracer[0]} cy={tracer[1]} r={14} fill="none" stroke="#fde047" strokeWidth={2.5} className="rl-pulse" />
          <circle cx={tracer[0]} cy={tracer[1]} r={7} fill="#fde047" />
          <rect x={20} y={14} width={330} height={28} rx={8} fill="rgba(0,0,0,0.55)" stroke="rgba(253,224,71,0.5)" />
          <text x={32} y={33} fontSize={12} fill="#fde047">{stage}</text>
        </g>
      )}
    </g>
  );
}

export function RespirationLab({
  state, onChange, result, activities, readOnly = false, toolbar,
}: {
  state: RespirationState; onChange: (s: RespirationState) => void; result: RespirationResult | null;
  activities?: string[]; readOnly?: boolean; toolbar?: ReactNode;
}) {
  const [auto, setAuto] = useState(false);
  const [preview, setPreview] = useState<Partial<RespirationState>>({});
  const s = { ...state, ...preview };
  const t = useLabClock(true);
  const r = result;
  const period = 60 / s.rate;
  // inflation 0..1: "Auto" follows the clock at the chosen rate
  const autoK = (1 - Math.cos((2 * Math.PI * t) / period)) / 2;
  const autoPhase: "in" | "out" = frac(t / period) < 0.5 ? "in" : "out";
  const phase = auto ? autoPhase : s.phase;
  // by hand: tween from where the lungs were to the new phase over ~1 s (state changes from undo jump)
  const target = s.phase === "in" ? 1 : 0;
  const [tween, setTween] = useState({ from: target, to: target, at: 0 });
  const manualK = tween.to !== target || prefersReducedMotion() ? target : lerp(tween.from, tween.to, ease(t - tween.at));
  const k = auto ? autoK : manualK;
  const breathe = (p: "in" | "out") => {
    setTween({ from: auto ? autoK : manualK, to: p === "in" ? 1 : 0, at: t });
    setAuto(false);
    set({ phase: p });
  };
  const set = (patch: Partial<RespirationState>) => {
    if (readOnly) return;
    const next = { ...state, ...patch };
    if (patch.phase) next.seen = [...new Set([...state.seen, state.phase, patch.phase])] as ("in" | "out")[];
    onChange(next);
  };
  const acts = activities ?? Object.keys(ACTIVITIES);
  const sat = r?.saturation ?? 98;
  const uptakeShare = r ? Math.min(1, r.o2_uptake_l / Math.max(0.01, r.o2_need_l * 2)) : 0;
  const needShare = r ? Math.min(1, r.o2_need_l / Math.max(0.01, r.o2_need_l * 2)) : 0.5;

  return (
    <div className="space-y-2">
      {!readOnly && (
        <div className="lab-controls">
          <LabSegment label="View" value={s.view} options={[{ value: "lungs", label: "Lungs" }, { value: "alveolus", label: "Zoom: alveolus" }]} onChange={(v) => set({ view: v })} />
          {s.view === "lungs" ? (
            <div className="lab-seg" role="group" aria-label="Breathe">
              <span className="lab-slider-label">Breathe</span>
              <div className="lab-seg-btns">
                <button type="button" aria-pressed={!auto && s.phase === "in"} onClick={() => breathe("in")}>Breathe in</button>
                <button type="button" aria-pressed={!auto && s.phase === "out"} onClick={() => breathe("out")}>Breathe out</button>
                <button type="button" aria-pressed={auto} onClick={() => setAuto((a) => !a)}>{auto ? "■ Stop" : "▶ Auto"}</button>
              </div>
            </div>
          ) : (
            <button type="button" className="lab-action" onClick={() => set({ traced: true })}>{s.traced ? "✓ Tracing oxygen" : "Trace an oxygen molecule"}</button>
          )}
          <LabSlider label="Rate" value={state.rate} min={6} max={40} step={1} unit="/min" onPreview={(v) => setPreview((p) => ({ ...p, rate: v ?? undefined }))} onCommit={(v) => set({ rate: v })} />
          <LabSlider label="Depth" value={state.depth_l} min={0.2} max={1.5} step={0.1} unit=" L" format={(v) => v.toFixed(1)} onPreview={(v) => setPreview((p) => ({ ...p, depth_l: v ?? undefined }))} onCommit={(v) => set({ depth_l: v })} />
          <LabSegment label="Activity" value={s.activity} options={acts.map((a) => ({ value: a, label: ACTIVITY_LABEL[a] ?? a }))} onChange={(v) => set({ activity: v })} />
          {toolbar}
        </div>
      )}

      <svg viewBox={`0 0 ${W} ${H}`} className="lab-bench w-full select-none" role="img"
        aria-label={s.view === "lungs" ? `Chest, breathing ${phase === "in" ? "in" : "out"}` : "Alveolus and capillary, gas exchange"}>
        <defs>
          <linearGradient id="rl-bench" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2b2a42" /><stop offset="100%" stopColor="#1b1a29" /></linearGradient>
          <filter id="rl-shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="6" stdDeviation="6" floodColor="#000" floodOpacity="0.4" /></filter>
          <marker id="rl-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#fbbf24" /></marker>
        </defs>
        <rect width={W} height={H} rx={16} fill="url(#rl-bench)" />
        <rect x={1} y={1} width={W - 2} height={H - 2} rx={15} fill="none" stroke="rgba(255,255,255,0.12)" />
        <g>
          {s.view === "lungs" ? (
            <>
              <Lungs k={k} phase={phase} />
              <AirFlow t={t} phase={phase} rate={s.rate} />
            </>
          ) : (
            <Alveolus t={t} rate={s.rate} traced={s.traced} saturation={sat} />
          )}
        </g>

        {/* readouts */}
        {r && (
          <g transform="translate(520 24)">
            <rect width={220} height={262} rx={12} fill="rgba(0,0,0,0.38)" stroke="rgba(255,255,255,0.15)" />
            <text x={14} y={24} fontSize={12} fontWeight={700} fill="#fff">{ACTIVITY_LABEL[s.activity] ?? s.activity} · {s.rate}/min × {s.depth_l.toFixed(1)} L</text>
            {[
              ["air per minute", `${r.minute_ventilation_l} L`],
              ["reaches alveoli", `${r.alveolar_ventilation_l} L`],
              ["one breath", `${r.breath_seconds} s`],
            ].map(([a, b], i) => (
              <g key={a} transform={`translate(14 ${50 + i * 20})`}>
                <text fontSize={11} fill="rgba(255,255,255,0.6)">{a}</text>
                <text x={192} textAnchor="end" fontSize={12} fontWeight={600} fill="#fff">{b}</text>
              </g>
            ))}
            {/* uptake vs need */}
            <text x={14} y={128} fontSize={11} fill="rgba(255,255,255,0.6)">oxygen taken in vs needed (L/min)</text>
            <rect x={14} y={136} width={192} height={12} rx={6} fill="rgba(255,255,255,0.12)" />
            <rect x={14} y={136} width={192 * uptakeShare} height={12} rx={6} fill={r.co2 === "rising" ? "#f87171" : "#38bdf8"} style={{ transition: "width .5s" }} />
            <line x1={14 + 192 * needShare} x2={14 + 192 * needShare} y1={131} y2={153} stroke="#fde047" strokeWidth={2} />
            <text x={14} y={166} fontSize={11} fill="#7dd3fc">{r.o2_uptake_l} in</text>
            <text x={206} y={166} textAnchor="end" fontSize={11} fill="#fde047">{r.o2_need_l} needed</text>
            {/* saturation gauge */}
            <text x={14} y={194} fontSize={11} fill="rgba(255,255,255,0.6)">blood oxygen</text>
            <text x={206} y={196} textAnchor="end" fontSize={22} fontWeight={800} fill={sat >= 95 ? "#86efac" : sat >= 90 ? "#fde047" : "#fca5a5"}>{sat}%</text>
            <rect x={14} y={206} width={192} height={10} rx={5} fill="rgba(255,255,255,0.12)" />
            <rect x={14} y={206} width={192 * ((sat - 70) / 28)} height={10} rx={5} fill={sat >= 95 ? "#22c55e" : sat >= 90 ? "#eab308" : "#ef4444"} style={{ transition: "width .5s" }} />
            <text x={14} y={240} fontSize={11} fill="rgba(255,255,255,0.6)">CO₂ in the blood</text>
            <text x={206} y={240} textAnchor="end" fontSize={12} fontWeight={700} fill={r.co2 === "normal" ? "#86efac" : r.co2 === "rising" ? "#fca5a5" : "#fde047"}>{r.co2 === "normal" ? "normal" : r.co2 === "rising" ? "building up" : "too low (dizzy)"}</text>
          </g>
        )}
        <text x={W - 16} y={H - 12} textAnchor="end" fontSize={10} fill="rgba(255,255,255,0.4)">simplified model, not to scale</text>
      </svg>
      {r && <TaskChips tasks={r.tasks} achieved={r.achieved} labels={TASKS} />}
    </div>
  );
}
