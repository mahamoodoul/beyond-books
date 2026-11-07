import { useRef, useState, type PointerEvent } from "react";

import { Icon } from "@/components/ui/Icon";

export type CellPart = "nucleus" | "chloroplast" | "mitochondrion" | "vacuole";

export const cellParts: Record<CellPart, { label: string; description: string }> = {
  nucleus: {
    label: "Nucleus",
    description: "The cell’s control centre. DNA inside the nucleus carries the instructions that guide the cell’s activities.",
  },
  chloroplast: {
    label: "Chloroplast",
    description: "Chloroplasts capture sunlight. They use that energy to turn water and carbon dioxide into glucose during photosynthesis.",
  },
  mitochondrion: {
    label: "Mitochondrion",
    description: "Mitochondria release usable energy from glucose through cellular respiration, helping power the cell.",
  },
  vacuole: {
    label: "Central vacuole",
    description: "This large, fluid-filled space stores water and helps keep a plant cell firm and supported.",
  },
};

interface CellModelProps {
  isPlaying: boolean;
  selectedPart: CellPart;
  onSelectPart: (part: CellPart) => void;
}

function pointerDistance(first: { x: number; y: number }, second: { x: number; y: number }): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

export function CellModel({ isPlaying, selectedPart, onSelectPart }: CellModelProps) {
  const [rotation, setRotation] = useState(-12);
  const [zoom, setZoom] = useState(1);
  const activePointers = useRef(new Map<number, { x: number; y: number }>());
  const dragStart = useRef<{ x: number; rotation: number } | null>(null);
  const pinchStart = useRef<{ distance: number; zoom: number } | null>(null);

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    if (event.target instanceof Element && event.target.closest(".model-controls")) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    activePointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    event.currentTarget.setPointerCapture(event.pointerId);
    if (activePointers.current.size === 2) {
      const [first, second] = [...activePointers.current.values()];
      if (!first || !second) return;
      pinchStart.current = { distance: Math.max(1, pointerDistance(first, second)), zoom };
      dragStart.current = null;
      return;
    }
    dragStart.current = { x: event.clientX, rotation };
  }

  function drag(event: PointerEvent<HTMLDivElement>) {
    if (!activePointers.current.has(event.pointerId)) return;
    activePointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (activePointers.current.size >= 2 && pinchStart.current) {
      const [first, second] = [...activePointers.current.values()];
      if (!first || !second) return;
      const scale = pointerDistance(first, second) / pinchStart.current.distance;
      setZoom(Math.min(1.35, Math.max(0.82, Number((pinchStart.current.zoom * scale).toFixed(2)))));
      return;
    }
    if (!dragStart.current) return;
    setRotation(dragStart.current.rotation + (event.clientX - dragStart.current.x) * 0.6);
  }

  function endDrag(event: PointerEvent<HTMLDivElement>) {
    activePointers.current.delete(event.pointerId);
    pinchStart.current = null;
    const remaining = [...activePointers.current.values()][0];
    dragStart.current = remaining ? { x: remaining.x, rotation } : null;
  }

  function zoomBy(amount: number) {
    setZoom((current) => Math.min(1.35, Math.max(0.82, Number((current + amount).toFixed(2)))));
  }

  return (
    <section aria-label="Interactive plant cell model" className={`model-card${isPlaying ? " model-playing" : ""}`}>
      <div className="model-topline">
        <span><span className="live-dot" /> INTERACTIVE 3D MODEL</span>
        <span className="model-hint">Drag to rotate · pinch to zoom</span>
      </div>
      <div
        className="model-stage"
        onPointerCancel={endDrag}
        onPointerDown={startDrag}
        onPointerMove={drag}
        onPointerUp={endDrag}
        role="group"
        aria-label="Drag to rotate and pinch to zoom the plant cell model"
      >
        <div aria-hidden="true" className="model-stage-grid" />
        <svg
          aria-labelledby="cell-model-title cell-model-description"
          className="cell-model-svg"
          role="img"
          style={{ transform: `perspective(900px) rotateX(8deg) rotateY(${rotation}deg) scale(${zoom})` }}
          viewBox="0 0 540 430"
        >
          <title id="cell-model-title">Cutaway model of a plant cell</title>
          <desc id="cell-model-description">A three-dimensional cutaway shows the cell wall, cell membrane, nucleus, central vacuole, chloroplasts, and mitochondria. Select an organelle below to learn what it does.</desc>
          <defs>
            <linearGradient id="cellWall" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0" stopColor="#b9e8cc" />
              <stop offset="1" stopColor="#79c5a0" />
            </linearGradient>
            <linearGradient id="cellInside" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0" stopColor="#f2fae9" />
              <stop offset="1" stopColor="#d1efda" />
            </linearGradient>
            <linearGradient id="vacuoleFill" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0" stopColor="#a9d8e1" />
              <stop offset="1" stopColor="#79b8c5" />
            </linearGradient>
            <radialGradient id="nucleusFill" cx=".35" cy=".3">
              <stop offset="0" stopColor="#c5b9ff" />
              <stop offset="1" stopColor="#8877d5" />
            </radialGradient>
            <filter id="cellShadow" height="150%" width="150%" x="-25%" y="-20%">
              <feDropShadow dx="0" dy="12" floodColor="#436c5c" floodOpacity=".18" stdDeviation="11" />
            </filter>
          </defs>
          <ellipse cx="273" cy="359" fill="#6a9c83" opacity=".16" rx="162" ry="25" />
          <g className="cell-body" filter="url(#cellShadow)">
            <path d="M92 218c-2-75 51-129 121-151 68-22 174-9 223 42 39 40 29 123 16 179-15 64-77 90-149 100-77 11-172-8-199-55-14-24-11-79-12-115Z" fill="url(#cellWall)" stroke="#4c9875" strokeWidth="4" />
            <path d="M108 214c0-63 49-111 109-132 63-21 156-9 198 35 33 34 24 108 12 157-13 55-68 78-128 87-70 11-152-8-176-49-12-20-15-69-15-98Z" fill="url(#cellInside)" stroke="#f4fff4" strokeWidth="5" />
            <path d="M139 233c7-41 38-75 81-85 39-9 71 8 79 42 7 28-13 64-41 80-35 20-91 8-111-10-10-8-12-18-8-27Z" fill="url(#nucleusFill)" stroke="#7566c3" strokeWidth="4" />
            <ellipse cx="211" cy="224" fill="#e1dcff" opacity=".7" rx="16" ry="11" transform="rotate(-18 211 224)" />
            <path d="M255 167c54-21 121-4 143 28 21 31 16 102-13 127-24 21-62 7-92 11-34 5-64 19-87 5 13-27 41-47 50-78 9-30-10-65-1-93Z" fill="url(#vacuoleFill)" opacity=".8" stroke="#65a8b5" strokeWidth="3" />
            <g fill="#e3f7de" stroke="#6eaa7a" strokeWidth="3">
              <ellipse cx="353" cy="123" rx="35" ry="17" transform="rotate(22 353 123)" />
              <ellipse cx="395" cy="275" rx="33" ry="16" transform="rotate(-25 395 275)" />
              <ellipse cx="145" cy="293" rx="31" ry="15" transform="rotate(18 145 293)" />
            </g>
            <g fill="none" stroke="#86bd8b" strokeWidth="3">
              <path d="M330 121c14 13 27 14 45 4m-43 0c18-4 31-2 42 8" />
              <path d="M371 276c14-15 28-18 46-13m-43 4c18 1 29 8 37 19" />
              <path d="M123 292c12-12 26-15 42-9m-38 0c14 2 24 8 31 16" />
            </g>
            <g fill="#f3d9a1" stroke="#d7a455" strokeWidth="3">
              <ellipse cx="298" cy="311" rx="26" ry="14" transform="rotate(-18 298 311)" />
              <ellipse cx="169" cy="146" rx="22" ry="12" transform="rotate(-31 169 146)" />
            </g>
            <g fill="none" stroke="#c99043" strokeLinecap="round" strokeWidth="3">
              <path d="m282 313 10-7 11 8 11-6" />
              <path d="m156 147 8-7 10 5 8-7" />
            </g>
            <path d="M132 190c18-22 29-34 45-43m150 175c24 5 44 2 61-6" fill="none" opacity=".55" stroke="#fff" strokeLinecap="round" strokeWidth="7" />
          </g>
          <g aria-hidden="true" className="model-callouts">
            <path d="M196 201 138 144h-42" fill="none" stroke="#7865d2" strokeDasharray="3 5" strokeWidth="2" />
            <circle cx="196" cy="201" fill="#7865d2" r="5" />
            <path d="m352 118 48-36h51" fill="none" stroke="#65a77b" strokeDasharray="3 5" strokeWidth="2" />
            <circle cx="352" cy="118" fill="#65a77b" r="5" />
          </g>
        </svg>
        <span aria-hidden="true" className="model-label model-label-nucleus">Nucleus</span>
        <span aria-hidden="true" className="model-label model-label-chloro">Chloroplast</span>
        <div className="model-controls">
          <button aria-label="Rotate model left" className="model-control" onClick={() => setRotation((current) => current - 30)} type="button"><Icon name="rotate" size={17} /></button>
          <span className="model-control-divider" />
          <button aria-label="Zoom out on model" className="model-control" onClick={() => zoomBy(-0.1)} type="button"><span className="zoom-glyph">−</span></button>
          <span className="zoom-value" aria-live="polite">{Math.round(zoom * 100)}%</span>
          <button aria-label="Zoom in on model" className="model-control" onClick={() => zoomBy(0.1)} type="button"><span className="zoom-glyph">+</span></button>
          <button aria-label="Reset model view" className="model-control" onClick={() => { setRotation(-12); setZoom(1); }} type="button"><Icon name="target" size={16} /></button>
        </div>
      </div>
      <div className="model-part-row" aria-label="Select a cell part">
        {(Object.keys(cellParts) as CellPart[]).map((part) => (
          <button
            aria-pressed={selectedPart === part}
            className={`part-chip${selectedPart === part ? " part-chip-active" : ""}`}
            key={part}
            onClick={() => onSelectPart(part)}
            type="button"
          >
            <span className={`part-chip-dot part-dot-${part}`} />{cellParts[part].label}
          </button>
        ))}
      </div>
      <p className="model-description"><strong>Model description:</strong> A cutaway plant cell shows its protective outer wall and the organelles working inside it. Drag to turn it around; select a label to explore.</p>
    </section>
  );
}
