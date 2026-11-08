/**
 * The circuit builder: an SVG bench with a parts palette. Students drag parts, click one
 * terminal then another to run a wire, click a switch to flip it, click a wire to remove it.
 * Parts are drawn with gradients, shadows and a glowing filament so the board reads as real
 * objects rather than symbols. Pure UI: the parent owns the circuit.
 */
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

import { Icon } from "@/components/ui/Icon";

import type { Circuit, Evaluation, Part, PartType } from "./circuit";

export interface Palette { battery: number; bulb: number; switch: number }

const W = 720;
const H = 400;
const GRID = 20;
const HALF = 44; // half part width: terminals sit at x ± HALF
const LABEL: Record<PartType, string> = { battery: "Battery", bulb: "Bulb", switch: "Switch" };

function nextId(prefix: string, taken: Set<string>): string {
  let n = 1;
  while (taken.has(`${prefix}${n}`)) n += 1;
  return `${prefix}${n}`;
}

function snap(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(v / GRID) * GRID));
}

function terminalPos(p: Part, t: "a" | "b"): { x: number; y: number } {
  return { x: t === "a" ? p.x - HALF : p.x + HALF, y: p.y };
}

/** Gradients, shadows and the glow filter, defined once per board. */
function Defs() {
  return (
    <defs>
      <pattern id="cb-grid" width={GRID} height={GRID} patternUnits="userSpaceOnUse">
        <path d={`M ${GRID} 0 L 0 0 0 ${GRID}`} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
      </pattern>
      <linearGradient id="cb-bench" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#2b2a42" />
        <stop offset="100%" stopColor="#1b1a29" />
      </linearGradient>
      <radialGradient id="cb-vignette" cx="50%" cy="40%" r="75%">
        <stop offset="0%" stopColor="rgba(255,255,255,0.10)" />
        <stop offset="100%" stopColor="rgba(0,0,0,0.35)" />
      </radialGradient>
      <linearGradient id="cb-cell" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#f6d58a" />
        <stop offset="35%" stopColor="#d9a441" />
        <stop offset="60%" stopColor="#b17a1f" />
        <stop offset="100%" stopColor="#6e4a12" />
      </linearGradient>
      <linearGradient id="cb-cell-cap" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#f8fafc" />
        <stop offset="50%" stopColor="#9aa5b4" />
        <stop offset="100%" stopColor="#4b5563" />
      </linearGradient>
      <radialGradient id="cb-glass" cx="38%" cy="32%" r="70%">
        <stop offset="0%" stopColor="rgba(255,255,255,0.95)" />
        <stop offset="30%" stopColor="rgba(226,232,240,0.55)" />
        <stop offset="100%" stopColor="rgba(148,163,184,0.35)" />
      </radialGradient>
      <radialGradient id="cb-glass-lit" cx="40%" cy="35%" r="70%">
        <stop offset="0%" stopColor="#fffbe6" />
        <stop offset="45%" stopColor="#fde68a" />
        <stop offset="100%" stopColor="#f59e0b" />
      </radialGradient>
      <radialGradient id="cb-glow">
        <stop offset="0%" stopColor="#fde047" stopOpacity="0.85" />
        <stop offset="60%" stopColor="#fbbf24" stopOpacity="0.25" />
        <stop offset="100%" stopColor="#fbbf24" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="cb-brass" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#fde68a" />
        <stop offset="50%" stopColor="#b8860b" />
        <stop offset="100%" stopColor="#6b4e07" />
      </linearGradient>
      <linearGradient id="cb-base" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#4b5563" />
        <stop offset="100%" stopColor="#111827" />
      </linearGradient>
      <linearGradient id="cb-wire" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#ef4444" />
        <stop offset="50%" stopColor="#b91c1c" />
        <stop offset="100%" stopColor="#7f1d1d" />
      </linearGradient>
      <filter id="cb-shadow" x="-30%" y="-30%" width="160%" height="180%">
        <feDropShadow dx="0" dy="4" stdDeviation="3" floodColor="#000" floodOpacity="0.45" />
      </filter>
      <filter id="cb-blur" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="6" />
      </filter>
    </defs>
  );
}

function Battery() {
  return (
    <g filter="url(#cb-shadow)">
      <rect x={-30} y={-13} width={60} height={26} rx={6} fill="url(#cb-cell)" stroke="#3b2a0a" strokeWidth={1} />
      <rect x={-30} y={-13} width={60} height={8} rx={4} fill="rgba(255,255,255,0.25)" />
      {/* negative end: flat cap on the right; positive nub on the left */}
      <rect x={24} y={-11} width={6} height={22} rx={2} fill="url(#cb-cell-cap)" />
      <rect x={-36} y={-5} width={7} height={10} rx={2} fill="url(#cb-cell-cap)" />
      <text x={-6} y={4} textAnchor="middle" fontSize={9} fontWeight={700} fill="#3b2a0a" letterSpacing={1}>1.5 V</text>
      <text x={-44} y={-16} fontSize={12} fontWeight={800} fill="#fca5a5">+</text>
      <text x={38} y={-16} fontSize={12} fontWeight={800} fill="#cbd5e1">−</text>
    </g>
  );
}

function Bulb({ lit, bright }: { lit: boolean; bright: number }) {
  return (
    <g>
      {lit && (
        <>
          <circle r={44} fill="url(#cb-glow)" opacity={0.35 + 0.65 * bright} />
          <circle r={22} fill="#fde68a" opacity={0.5 * bright} filter="url(#cb-blur)" />
        </>
      )}
      <g filter="url(#cb-shadow)">
        {/* brass screw base */}
        <rect x={-9} y={10} width={18} height={14} rx={3} fill="url(#cb-brass)" />
        <path d="M -9 14 h 18 M -9 18 h 18 M -9 22 h 18" stroke="rgba(0,0,0,0.35)" strokeWidth={1} />
        {/* glass */}
        <circle cy={-4} r={19} fill={lit ? "url(#cb-glass-lit)" : "url(#cb-glass)"} stroke={lit ? "#f59e0b" : "#94a3b8"} strokeWidth={1.2} />
        {/* filament */}
        <path d="M -6 10 L -6 -2 Q -3 -10 0 -2 Q 3 -10 6 -2 L 6 10" fill="none" stroke={lit ? "#fff7cc" : "#64748b"} strokeWidth={lit ? 2.2 : 1.4} strokeLinecap="round" />
        {/* highlight */}
        <ellipse cx={-7} cy={-12} rx={5} ry={3} fill="rgba(255,255,255,0.7)" transform="rotate(-30 -7 -12)" />
      </g>
    </g>
  );
}

function Switch({ closed }: { closed: boolean }) {
  return (
    <g filter="url(#cb-shadow)">
      <rect x={-30} y={-6} width={60} height={20} rx={5} fill="url(#cb-base)" stroke="#0b1220" strokeWidth={1} />
      <rect x={-30} y={-6} width={60} height={6} rx={3} fill="rgba(255,255,255,0.12)" />
      {/* contacts */}
      <circle cx={-18} cy={-2} r={4.5} fill="url(#cb-brass)" />
      <circle cx={18} cy={-2} r={4.5} fill="url(#cb-brass)" />
      {/* lever */}
      <g transform={`rotate(${closed ? 0 : -32} -18 -2)`}>
        <line x1={-18} y1={-2} x2={20} y2={-2} stroke="#d1d5db" strokeWidth={4} strokeLinecap="round" />
        <line x1={-18} y1={-2} x2={20} y2={-2} stroke="rgba(255,255,255,0.5)" strokeWidth={1.2} strokeLinecap="round" />
        <circle cx={20} cy={-2} r={5} fill="#ef4444" stroke="#7f1d1d" strokeWidth={1} />
      </g>
      <text x={0} y={-14} textAnchor="middle" fontSize={9} fontWeight={700} fill={closed ? "#86efac" : "#fca5a5"} letterSpacing={1}>
        {closed ? "ON" : "OFF"}
      </text>
    </g>
  );
}

export function CircuitBuilder({
  circuit,
  onChange,
  palette,
  evaluation,
  readOnly = false,
  toolbar,
}: {
  circuit: Circuit;
  onChange: (c: Circuit) => void;
  palette: Palette;
  evaluation: Evaluation | null;
  readOnly?: boolean;
  /** Extra controls (e.g. undo/redo) shown after the parts buttons. */
  toolbar?: ReactNode;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [pending, setPending] = useState<string | null>(null); // terminal waiting for its pair
  const [selected, setSelected] = useState<string | null>(null); // part id
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number; sx: number; sy: number; moved: boolean } | null>(null);
  const [hoverWire, setHoverWire] = useState<string | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);

  const counts = { battery: 0, bulb: 0, switch: 0 } as Record<PartType, number>;
  for (const p of circuit.parts) counts[p.type] += 1;
  const byId = new Map(circuit.parts.map((p) => [p.id, p]));
  const flowing = !!evaluation && evaluation.closed_loop && !evaluation.short_circuit;

  useEffect(() => {
    if (readOnly) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setPending(null); setSelected(null); }
      if ((e.key === "Delete" || e.key === "Backspace") && selected && !(e.target instanceof HTMLInputElement)) removePart(selected);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const svgPoint = (e: ReactPointerEvent): { x: number; y: number } => {
    const svg = svgRef.current!;
    const rect = svg.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * W, y: ((e.clientY - rect.top) / rect.height) * H };
  };

  const addPart = (type: PartType) => {
    if (readOnly || counts[type] >= palette[type]) return;
    const taken = new Set(circuit.parts.map((p) => p.id));
    const used = new Set(circuit.parts.map((p) => `${p.x},${p.y}`));
    let x = 140, y = 120;
    outer: for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 4; col++) {
        x = 140 + col * 150;
        y = 120 + row * 120;
        if (!used.has(`${x},${y}`)) break outer;
      }
    }
    const id = nextId(type === "battery" ? "bat" : type === "bulb" ? "l" : "s", taken);
    onChange({ ...circuit, parts: [...circuit.parts, { id, type, x, y, closed: true }] });
    setSelected(id);
  };

  const removePart = (id: string) => {
    onChange({
      parts: circuit.parts.filter((p) => p.id !== id),
      wires: circuit.wires.filter((w) => !w.a.startsWith(`${id}:`) && !w.b.startsWith(`${id}:`)),
    });
    setSelected(null);
    if (pending?.startsWith(`${id}:`)) setPending(null);
  };

  const removeWire = (id: string) => onChange({ ...circuit, wires: circuit.wires.filter((w) => w.id !== id) });

  const toggleSwitch = (id: string) =>
    onChange({ ...circuit, parts: circuit.parts.map((p) => (p.id === id ? { ...p, closed: !p.closed } : p)) });

  const clickTerminal = (t: string) => {
    if (readOnly) return;
    if (!pending) { setPending(t); return; }
    if (pending === t) { setPending(null); return; }
    const exists = circuit.wires.some((w) => (w.a === pending && w.b === t) || (w.a === t && w.b === pending));
    if (!exists) {
      const id = nextId("w", new Set(circuit.wires.map((w) => w.id)));
      onChange({ ...circuit, wires: [...circuit.wires, { id, a: pending, b: t }] });
    }
    setPending(null);
  };

  const startDrag = (e: ReactPointerEvent, p: Part) => {
    if (readOnly) return;
    const pt = svgPoint(e);
    setDrag({ id: p.id, dx: pt.x - p.x, dy: pt.y - p.y, sx: pt.x, sy: pt.y, moved: false });
    setSelected(p.id);
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: ReactPointerEvent) => {
    const pt = svgPoint(e);
    if (pending) setCursor(pt);
    if (!drag) return;
    if (!drag.moved && Math.hypot(pt.x - drag.sx, pt.y - drag.sy) < 6) return;
    if (!drag.moved) setDrag({ ...drag, moved: true });
    const x = snap(pt.x - drag.dx, HALF + GRID, W - HALF - GRID);
    const y = snap(pt.y - drag.dy, 50, H - 50);
    onChange({ ...circuit, parts: circuit.parts.map((p) => (p.id === drag.id ? { ...p, x, y } : p)) });
  };
  const endDrag = () => setDrag(null);

  const lit = new Set(evaluation?.lit ?? []);
  const pendingPos = (() => {
    if (!pending) return null;
    const [pid, t] = pending.split(":") as [string, "a" | "b"];
    const p = byId.get(pid);
    return p ? terminalPos(p, t) : null;
  })();

  return (
    <div className="space-y-2">
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {(["battery", "bulb", "switch"] as PartType[]).map((t) => {
            const left = palette[t] - counts[t];
            return (
              <button
                key={t}
                type="button"
                disabled={left <= 0}
                onClick={() => addPart(t)}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 font-medium text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Icon name="plus" size={14} /> {LABEL[t]} <span className="text-xs text-slate-500">{left} left</span>
              </button>
            );
          })}
          {toolbar}
          <span className="ml-auto text-xs text-slate-500">
            {pending ? "Now click the other terminal to finish the wire (Esc to cancel)" : "Click a terminal, then another, to add a wire · drag parts · click a switch to flip it · click a wire to remove it"}
          </span>
          {selected && (
            <button type="button" className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50" onClick={() => removePart(selected)}>
              Remove {LABEL[byId.get(selected)?.type ?? "bulb"]}
            </button>
          )}
        </div>
      )}

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className={`lab-bench w-full select-none ${drag ? "cursor-grabbing" : ""}`}
        role="img"
        aria-label={`Circuit with ${circuit.parts.length} parts and ${circuit.wires.length} wires`}
        onPointerMove={onMove}
        onPointerUp={endDrag}
        onPointerLeave={() => { endDrag(); setCursor(null); }}
        onClick={(e) => { if (e.target === svgRef.current) { setSelected(null); setPending(null); } }}
      >
        <Defs />
        <style>{`
          @keyframes cb-flow { to { stroke-dashoffset: -24; } }
          .cb-current { stroke-dasharray: 6 18; animation: cb-flow 0.9s linear infinite; }
          @media (prefers-reduced-motion: reduce) { .cb-current { animation: none; } }
        `}</style>
        <rect width={W} height={H} rx={16} fill="url(#cb-bench)" />
        <rect width={W} height={H} rx={16} fill="url(#cb-grid)" />
        <rect width={W} height={H} rx={16} fill="url(#cb-vignette)" />
        {/* bench edge highlight */}
        <rect x={1} y={1} width={W - 2} height={H - 2} rx={15} fill="none" stroke="rgba(255,255,255,0.12)" />

        {/* wire being drawn */}
        {pendingPos && cursor && (
          <line x1={pendingPos.x} y1={pendingPos.y} x2={cursor.x} y2={cursor.y} stroke="#aea4ff" strokeWidth={3} strokeDasharray="6 6" strokeLinecap="round" opacity={0.8} />
        )}

        {circuit.wires.map((w) => {
          const [pa, ta] = w.a.split(":") as [string, "a" | "b"];
          const [pb, tb] = w.b.split(":") as [string, "a" | "b"];
          const A = byId.get(pa);
          const B = byId.get(pb);
          if (!A || !B) return null;
          const p1 = terminalPos(A, ta);
          const p2 = terminalPos(B, tb);
          const mx = (p1.x + p2.x) / 2;
          const my = (p1.y + p2.y) / 2 + (Math.abs(p1.y - p2.y) < 30 ? 36 : 0);
          const d = `M ${p1.x} ${p1.y} Q ${mx} ${my} ${p2.x} ${p2.y}`;
          const hot = hoverWire === w.id && !readOnly;
          return (
            <g key={w.id} onMouseEnter={() => setHoverWire(w.id)} onMouseLeave={() => setHoverWire(null)}
              onClick={(e) => { e.stopPropagation(); if (!readOnly) removeWire(w.id); }} className={readOnly ? "" : "cursor-pointer"}>
              <title>{readOnly ? "Wire" : "Click to remove this wire"}</title>
              {/* fat invisible hit area */}
              <path d={d} fill="none" stroke="transparent" strokeWidth={16} />
              {/* shadow */}
              <path d={d} fill="none" stroke="rgba(0,0,0,0.45)" strokeWidth={7} strokeLinecap="round" transform="translate(0 3)" />
              {/* cable */}
              <path d={d} fill="none" stroke={hot ? "#f87171" : "url(#cb-wire)"} strokeWidth={hot ? 7 : 6} strokeLinecap="round" />
              <path d={d} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={1.5} strokeLinecap="round" transform="translate(0 -1.5)" />
              {flowing && <path d={d} fill="none" className="cb-current" stroke="#fde68a" strokeWidth={2.5} strokeLinecap="round" />}
            </g>
          );
        })}

        {circuit.parts.map((p) => {
          const isSel = selected === p.id;
          const bright = evaluation?.brightness[p.id] ?? 0;
          return (
            <g key={p.id} transform={`translate(${p.x} ${p.y})`} aria-label={`${LABEL[p.type]} ${p.id}`}>
              {isSel && <rect x={-HALF - 10} y={-40} width={HALF * 2 + 20} height={80} rx={14} fill="rgba(255,255,255,0.05)" stroke="#aea4ff" strokeDasharray="5 4" />}
              {/* leads from the part to its terminals */}
              <line x1={-HALF} y1={0} x2={-30} y2={0} stroke="#cbd5e1" strokeWidth={3} strokeLinecap="round" />
              <line x1={30} y1={0} x2={HALF} y2={0} stroke="#cbd5e1" strokeWidth={3} strokeLinecap="round" />
              <g
                className={readOnly ? "" : "cursor-grab"}
                onPointerDown={(e) => { e.stopPropagation(); startDrag(e, p); }}
                onClick={(e) => { e.stopPropagation(); if (p.type === "switch" && !readOnly && !drag?.moved) toggleSwitch(p.id); }}
              >
                {p.type === "battery" && <Battery />}
                {p.type === "bulb" && <Bulb lit={lit.has(p.id)} bright={bright} />}
                {p.type === "switch" && <Switch closed={p.closed} />}
              </g>
              <text x={0} y={38} textAnchor="middle" fontSize={11} fill="rgba(255,255,255,0.75)">{LABEL[p.type]}</text>
              {(["a", "b"] as const).map((t) => {
                const key = `${p.id}:${t}`;
                const hot = pending === key;
                const wired = circuit.wires.some((w) => w.a === key || w.b === key);
                return (
                  <g key={t} transform={`translate(${t === "a" ? -HALF : HALF} 0)`}
                    className={readOnly ? "" : "cursor-crosshair"}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); clickTerminal(key); }}>
                    <title>{p.type === "battery" ? (t === "a" ? "+ terminal" : "− terminal") : `terminal ${t}`}</title>
                    <circle r={13} fill="transparent" />
                    {hot && <circle r={12} fill="none" stroke="#fbbf24" strokeWidth={2} opacity={0.9} />}
                    <circle r={hot ? 8 : 7} fill="url(#cb-brass)" stroke={wired ? "#fde68a" : "#3f2d05"} strokeWidth={1.5} />
                    <line x1={-3.5} y1={0} x2={3.5} y2={0} stroke="rgba(0,0,0,0.5)" strokeWidth={1.5} />
                  </g>
                );
              })}
            </g>
          );
        })}

        {circuit.parts.length === 0 && (
          <text x={W / 2} y={H / 2} textAnchor="middle" fontSize={16} fill="rgba(255,255,255,0.6)">
            {readOnly ? "Nothing built yet" : "Add a battery and a bulb, then wire them into a loop"}
          </text>
        )}
      </svg>
    </div>
  );
}
