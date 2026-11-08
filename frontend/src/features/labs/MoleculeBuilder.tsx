/**
 * Molecule builder: atoms as shaded spheres on a dark bench. Drag atoms, click one atom then
 * another to bond them, click a bond to raise its order (single → double → triple → remove).
 * Atoms that still want bonds show how many; complete molecules glow.
 */
import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

import { Icon } from "@/components/ui/Icon";

import { VALENCE, type Atom, type Molecule, type MoleculeResult } from "./engines/molecules";
import { ELEMENT_NAMES } from "./guide";

const W = 720;
const H = 400;
const R = 22;
const COLORS: Record<string, [string, string]> = {
  H: ["#ffffff", "#9ca3af"],
  O: ["#fca5a5", "#b91c1c"],
  C: ["#9ca3af", "#1f2937"],
  N: ["#93c5fd", "#1d4ed8"],
  Cl: ["#86efac", "#15803d"],
  S: ["#fde68a", "#b45309"],
};
const RADIUS: Record<string, number> = { H: 16, O: 22, C: 24, N: 22, Cl: 26, S: 26 };

function nextId(prefix: string, taken: Set<string>): string {
  let n = 1;
  while (taken.has(`${prefix}${n}`)) n += 1;
  return `${prefix}${n}`;
}

export function MoleculeBuilder({
  molecule,
  onChange,
  palette,
  result,
  readOnly = false,
  toolbar,
}: {
  molecule: Molecule;
  onChange: (m: Molecule) => void;
  palette: Record<string, number>;
  result: MoleculeResult | null;
  readOnly?: boolean;
  toolbar?: ReactNode;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number; sx: number; sy: number; moved: boolean } | null>(null);
  const counts: Record<string, number> = {};
  for (const a of molecule.atoms) counts[a.element] = (counts[a.element] ?? 0) + 1;
  const byId = new Map(molecule.atoms.map((a) => [a.id, a]));
  const complete = result?.complete ?? false;
  const over = new Set(result?.over_bonded ?? []);
  const missing = result?.missing ?? {};

  const svgPoint = (e: ReactPointerEvent) => {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * W, y: ((e.clientY - rect.top) / rect.height) * H };
  };

  const addAtom = (element: string) => {
    if (readOnly || (counts[element] ?? 0) >= (palette[element] ?? 0)) return;
    const taken = new Set(molecule.atoms.map((a) => a.id));
    const used = new Set(molecule.atoms.map((a) => `${a.x},${a.y}`));
    let x = 140, y = 110;
    outer: for (let row = 0; row < 3; row++) for (let col = 0; col < 6; col++) { x = 140 + col * 90; y = 110 + row * 100; if (!used.has(`${x},${y}`)) break outer; }
    onChange({ ...molecule, atoms: [...molecule.atoms, { id: nextId(element.toLowerCase(), taken), element, x, y }] });
  };
  const removeAtom = (id: string) => {
    onChange({ atoms: molecule.atoms.filter((a) => a.id !== id), bonds: molecule.bonds.filter((b) => b.a !== id && b.b !== id) });
    if (pending === id) setPending(null);
  };
  const clickAtom = (id: string) => {
    if (readOnly) return;
    if (!pending) { setPending(id); return; }
    if (pending === id) { setPending(null); return; }
    const existing = molecule.bonds.find((b) => (b.a === pending && b.b === id) || (b.a === id && b.b === pending));
    if (existing) cycleBond(existing.id);
    else onChange({ ...molecule, bonds: [...molecule.bonds, { id: nextId("b", new Set(molecule.bonds.map((b) => b.id))), a: pending, b: id, order: 1 }] });
    setPending(null);
  };
  const cycleBond = (id: string) => {
    if (readOnly) return;
    const b = molecule.bonds.find((x) => x.id === id)!;
    if (b.order >= 3) onChange({ ...molecule, bonds: molecule.bonds.filter((x) => x.id !== id) });
    else onChange({ ...molecule, bonds: molecule.bonds.map((x) => (x.id === id ? { ...x, order: x.order + 1 } : x)) });
  };
  const startDrag = (e: ReactPointerEvent, a: Atom) => {
    if (readOnly) return;
    const p = svgPoint(e);
    setDrag({ id: a.id, dx: p.x - a.x, dy: p.y - a.y, sx: p.x, sy: p.y, moved: false });
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };
  const move = (e: ReactPointerEvent) => {
    if (!drag) return;
    const p = svgPoint(e);
    // A click wobbles a pixel or two on a real mouse: only a clear movement counts as a drag.
    if (!drag.moved && Math.hypot(p.x - drag.sx, p.y - drag.sy) < 6) return;
    const x = Math.min(W - 40, Math.max(40, p.x - drag.dx));
    const y = Math.min(H - 40, Math.max(40, p.y - drag.dy));
    if (!drag.moved) setDrag({ ...drag, moved: true });
    onChange({ ...molecule, atoms: molecule.atoms.map((a) => (a.id === drag.id ? { ...a, x, y } : a)) });
  };
  const endDrag = (a?: Atom) => {
    if (drag && !drag.moved && a) clickAtom(a.id);
    setDrag(null);
  };

  return (
    <div className="space-y-2">
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {Object.keys(VALENCE).filter((el) => (palette[el] ?? 0) > 0).map((el) => {
            const left = (palette[el] ?? 0) - (counts[el] ?? 0);
            const [light, dark] = COLORS[el]!;
            return (
              <button key={el} type="button" disabled={left <= 0} onClick={() => addAtom(el)} title={`Add one ${ELEMENT_NAMES[el] ?? el} atom`} aria-label={`Add ${ELEMENT_NAMES[el] ?? el} (${left} left)`} className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 font-medium text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">
                <span className="inline-block h-4 w-4 rounded-full ring-1 ring-black/20" style={{ background: `radial-gradient(circle at 35% 35%, ${light}, ${dark})` }} />
                {el} <span className="text-xs text-slate-500">{left} left · {VALENCE[el]} bond{VALENCE[el] === 1 ? "" : "s"}</span>
              </button>
            );
          })}
          {toolbar}
          <span className="ml-auto text-xs" style={{ color: "var(--muted)" }}>
            {pending ? "Now click another ball to join them (click the same ball again to cancel)" : "Click a ball, then another, to join them · click a line to make it double / triple / remove · drag balls to tidy up"}
          </span>
        </div>
      )}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className={`lab-bench w-full select-none ${drag?.moved ? "cursor-grabbing" : ""}`}
        role="img"
        aria-label={`Molecule with ${molecule.atoms.length} atoms and ${molecule.bonds.length} bonds`}
        onPointerMove={move}
        onPointerUp={() => endDrag()}
        onPointerLeave={() => setDrag(null)}
        onClick={(e) => { if (e.target === svgRef.current) setPending(null); }}
      >
        <defs>
          <linearGradient id="mb-bench" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2b2a42" /><stop offset="100%" stopColor="#1b1a29" /></linearGradient>
          <radialGradient id="mb-vignette" cx="50%" cy="40%" r="75%"><stop offset="0%" stopColor="rgba(255,255,255,0.08)" /><stop offset="100%" stopColor="rgba(0,0,0,0.35)" /></radialGradient>
          <radialGradient id="mb-glow"><stop offset="0%" stopColor="#93cfad" stopOpacity="0.55" /><stop offset="100%" stopColor="#93cfad" stopOpacity="0" /></radialGradient>
          <filter id="mb-shadow" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="5" stdDeviation="4" floodColor="#000" floodOpacity="0.5" /></filter>
          {Object.entries(COLORS).map(([el, [light, dark]]) => (
            <radialGradient key={el} id={`mb-${el}`} cx="35%" cy="32%" r="70%"><stop offset="0%" stopColor={light} /><stop offset="100%" stopColor={dark} /></radialGradient>
          ))}
        </defs>
        <rect width={W} height={H} rx={16} fill="url(#mb-bench)" />
        <rect width={W} height={H} rx={16} fill="url(#mb-vignette)" />
        <rect x={1} y={1} width={W - 2} height={H - 2} rx={15} fill="none" stroke="rgba(255,255,255,0.12)" />

        {molecule.bonds.map((b) => {
          const A = byId.get(b.a); const B = byId.get(b.b);
          if (!A || !B) return null;
          const dx = B.x - A.x, dy = B.y - A.y;
          const len = Math.hypot(dx, dy) || 1;
          const nx = -dy / len, ny = dx / len;
          const offsets = b.order === 1 ? [0] : b.order === 2 ? [-5, 5] : [-8, 0, 8];
          return (
            <g key={b.id} className={readOnly ? "" : "cursor-pointer"} onClick={(e) => { e.stopPropagation(); cycleBond(b.id); }}>
              <title>{b.order === 1 ? "Single bond" : b.order === 2 ? "Double bond" : "Triple bond"}{readOnly ? "" : " · click to change"}</title>
              <line x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke="transparent" strokeWidth={22} />
              {offsets.map((o) => (
                <line key={o} x1={A.x + nx * o} y1={A.y + ny * o} x2={B.x + nx * o} y2={B.y + ny * o} stroke="#e2e8f0" strokeWidth={4} strokeLinecap="round" />
              ))}
            </g>
          );
        })}

        {molecule.atoms.map((a) => {
          const r = RADIUS[a.element] ?? R;
          const isPending = pending === a.id;
          const need = missing[a.id];
          return (
            <g key={a.id} transform={`translate(${a.x} ${a.y})`} className={readOnly ? "" : "cursor-grab"}
              onPointerDown={(e) => { e.stopPropagation(); startDrag(e, a); }}
              onPointerUp={(e) => { e.stopPropagation(); endDrag(a); }}
              onDoubleClick={(e) => { e.stopPropagation(); if (!readOnly) removeAtom(a.id); }}>
              <title>{a.element} · {VALENCE[a.element]} bond{VALENCE[a.element] === 1 ? "" : "s"} wanted{readOnly ? "" : " · double-click to remove"}</title>
              {complete && <circle r={r + 18} fill="url(#mb-glow)" />}
              {isPending && <circle r={r + 7} fill="none" stroke="#aea4ff" strokeWidth={2.5} strokeDasharray="5 4" />}
              <circle r={r} fill={`url(#mb-${a.element})`} filter="url(#mb-shadow)" stroke={over.has(a.id) ? "#ef4444" : "rgba(0,0,0,0.35)"} strokeWidth={over.has(a.id) ? 3 : 1} />
              <ellipse cx={-r * 0.3} cy={-r * 0.4} rx={r * 0.28} ry={r * 0.16} fill="rgba(255,255,255,0.55)" transform={`rotate(-25 ${-r * 0.3} ${-r * 0.4})`} />
              <text y={5} textAnchor="middle" fontSize={r >= 22 ? 15 : 12} fontWeight={700} fill={a.element === "H" ? "#111827" : "#fff"} style={{ pointerEvents: "none" }}>{a.element}</text>
              {need ? (
                <g transform={`translate(${r * 0.75} ${-r * 0.75})`}>
                  <circle r={9} fill="#fbbf24" stroke="#78350f" strokeWidth={1} />
                  <text y={3.5} textAnchor="middle" fontSize={10} fontWeight={800} fill="#1f2937" style={{ pointerEvents: "none" }}>{need}</text>
                </g>
              ) : null}
            </g>
          );
        })}

        {molecule.atoms.length === 0 && (
          <text x={W / 2} y={H / 2} textAnchor="middle" fontSize={16} fill="rgba(255,255,255,0.6)">{readOnly ? "Nothing built yet" : "Click an atom button above the board to place it here, then click two balls to join them"}</text>
        )}
        {result?.formula && (
          <g transform={`translate(${W - 16} 30)`}>
            <text textAnchor="end" fontSize={22} fontWeight={700} fill={complete ? "#93cfad" : "rgba(255,255,255,0.7)"}>{result.formula}</text>
            {result.name && <text y={20} textAnchor="end" fontSize={12} fill="rgba(255,255,255,0.75)">{result.name}{result.shape ? ` · ${result.shape}` : ""}</text>}
          </g>
        )}
      </svg>
      {!readOnly && molecule.atoms.length > 0 && (
        <p className="text-xs" style={{ color: "var(--muted)" }}><Icon name="lightbulb" size={12} className="mr-1 inline align-[-2px]" />The small yellow number on an atom shows how many more bonds it wants. Double-click an atom to remove it.</p>
      )}
    </div>
  );
}
