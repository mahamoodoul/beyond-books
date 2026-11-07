import { useEffect, useRef, useState, type PointerEvent } from "react";

import { Icon } from "@/components/ui/Icon";
import type { Model3D } from "@/lib/types";

interface CardiacViewerProps {
  model: Model3D;
}

const chamberPositions: Record<string, { left: string; top: string; color: string }> = {
  "right-atrium": { left: "37%", top: "38%", color: "blue" },
  "right-ventricle": { left: "39%", top: "62%", color: "blue" },
  "left-atrium": { left: "64%", top: "38%", color: "red" },
  "left-ventricle": { left: "62%", top: "62%", color: "red" },
  aorta: { left: "60%", top: "17%", color: "red" },
};

export function CardiacViewer({ model }: CardiacViewerProps) {
  const [rotation, setRotation] = useState(-8);
  const [zoom, setZoom] = useState(1);
  const [labelsVisible, setLabelsVisible] = useState(true);
  const [selectedId, setSelectedId] = useState(model.hotspots[0]?.id ?? "");
  const [animationStep, setAnimationStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [viewerMessage, setViewerMessage] = useState("");
  const stageRef = useRef<HTMLDivElement>(null);
  const activePointers = useRef(new Map<number, { x: number; y: number }>());
  const dragStart = useRef<{ id: number; x: number; rotation: number } | null>(null);
  const pinchStart = useRef<{ distance: number; zoom: number } | null>(null);
  const selectedHotspot = model.hotspots.find((hotspot) => hotspot.id === selectedId);
  const currentAnimation = model.animationSteps[animationStep];

  useEffect(() => {
    if (!playing || model.animationSteps.length === 0) return;
    const timer = window.setTimeout(() => {
      if (animationStep >= model.animationSteps.length - 1) {
        setPlaying(false);
        setAnimationStep(0);
      } else {
        setAnimationStep((current) => current + 1);
      }
    }, 1900);
    return () => window.clearTimeout(timer);
  }, [animationStep, model.animationSteps.length, playing]);

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest("button")) return;
    activePointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    event.currentTarget.setPointerCapture(event.pointerId);
    if (activePointers.current.size === 2) {
      const [first, second] = [...activePointers.current.values()];
      if (!first || !second) return;
      pinchStart.current = {
        distance: Math.max(1, Math.hypot(first.x - second.x, first.y - second.y)),
        zoom,
      };
      dragStart.current = null;
      return;
    }
    dragStart.current = { id: event.pointerId, x: event.clientX, rotation };
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!activePointers.current.has(event.pointerId)) return;
    activePointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (activePointers.current.size >= 2 && pinchStart.current) {
      const [first, second] = [...activePointers.current.values()];
      if (!first || !second) return;
      const distance = Math.hypot(first.x - second.x, first.y - second.y);
      const scale = distance / pinchStart.current.distance;
      setZoom(Math.min(1.35, Math.max(.8, Number((pinchStart.current.zoom * scale).toFixed(2)))));
      return;
    }
    const start = dragStart.current;
    if (!start || start.id !== event.pointerId) return;
    setRotation(start.rotation + (event.clientX - start.x) * 0.45);
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    activePointers.current.delete(event.pointerId);
    pinchStart.current = null;
    const remaining = [...activePointers.current.entries()][0];
    dragStart.current = remaining ? { id: remaining[0], x: remaining[1].x, rotation } : null;
  }

  async function toggleFullscreen() {
    const stage = stageRef.current;
    if (!stage) return;
    try {
      if (document.fullscreenElement === stage) await document.exitFullscreen();
      else await stage.requestFullscreen();
      setViewerMessage("");
    } catch (error) {
      setViewerMessage(error instanceof Error ? `Fullscreen is unavailable: ${error.message}` : "Fullscreen is unavailable in this browser.");
    }
  }

  function setStep(value: number) {
    setAnimationStep(value);
    setPlaying(false);
  }

  return (
    <section aria-label="Interactive heart model" className="cardiac-viewer-card">
      <div className="cardiac-viewer-head">
        <span className="eyebrow eyebrow-muted"><span className="eyebrow-dot" /> EXPLORE THE HEART</span>
        <span className="viewer-hint">Drag to rotate · pinch to zoom</span>
      </div>
      <div
        className="cardiac-stage"
        ref={stageRef}
        onPointerCancel={onPointerUp}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        role="group"
        aria-label="Drag to rotate the heart. Select a labeled structure to learn more."
      >
        <div aria-hidden="true" className="cardiac-stage-grid" />
        <div aria-hidden="true" className="heart-model-wrap" style={{ transform: `perspective(900px) rotateY(${rotation}deg) scale(${zoom})` }}>
          <svg aria-labelledby="cardiac-title cardiac-desc" className="cardiac-svg" role="img" viewBox="0 0 400 390">
            <title id="cardiac-title">Low-poly placeholder model of a human heart</title>
            <desc id="cardiac-desc">{model.alt} {model.description}</desc>
            <defs>
              <linearGradient id="heartOuter" x1="0" x2="1" y1="0" y2="1">
                <stop offset="0" stopColor="#f29aa4" />
                <stop offset=".5" stopColor="#d26778" />
                <stop offset="1" stopColor="#995377" />
              </linearGradient>
              <linearGradient id="chamberBlue" x1="0" x2="1" y1="0" y2="1">
                <stop offset="0" stopColor="#a4d8ea" />
                <stop offset="1" stopColor="#608ec7" />
              </linearGradient>
              <linearGradient id="chamberRed" x1="0" x2="1" y1="0" y2="1">
                <stop offset="0" stopColor="#ffbaaa" />
                <stop offset="1" stopColor="#d66b80" />
              </linearGradient>
              <filter id="cardiacShadow" height="150%" width="150%" x="-25%" y="-20%">
                <feDropShadow dx="0" dy="13" floodColor="#342744" floodOpacity=".22" stdDeviation="11" />
              </filter>
            </defs>
            <ellipse cx="204" cy="339" fill="#53485f" opacity=".14" rx="117" ry="17" />
            <g filter="url(#cardiacShadow)">
              <path d="M194 320c-17-21-115-94-128-156-12-55 14-99 54-96 32 2 52 28 68 51 18-31 45-58 78-49 47 12 55 65 34 113-20 45-82 105-106 137Z" fill="url(#heartOuter)" stroke="#faacaa" strokeWidth="4" />
              <path d="M122 94c-6-44 1-68-8-84-7-13-24-14-31-2-9 16 6 46 5 88" fill="none" stroke="#7199cf" strokeLinecap="round" strokeWidth="24" />
              <path d="M208 109c-6-48-2-71 15-91 14-17 42-14 46 3 3 13-7 25-16 32-13 12-15 33-11 60" fill="none" stroke="#d87482" strokeLinecap="round" strokeWidth="27" />
              <path d="M234 126c35-30 70-41 98-30 19 8 18 28 1 36-22 10-53 6-84 27" fill="none" stroke="#8abbd4" strokeLinecap="round" strokeWidth="19" />
              <path d="M143 131c-39-29-69-27-91-12-18 12-13 31 5 37 22 7 45 4 72 26" fill="none" stroke="#d7838b" strokeLinecap="round" strokeWidth="20" />
              <path d="M126 164c-14-20-42-17-46 6-5 25 12 47 34 53 24 6 38-11 38-29 1-12-12-22-26-30Z" fill="url(#chamberBlue)" stroke="#d9f3fb" strokeWidth="3" />
              <path d="M115 218c-17 20-9 70 11 89 17 17 43 7 47-19 4-28-4-55-20-72-12-13-27-13-38 2Z" fill="#6399cf" stroke="#c3e3f2" strokeWidth="3" />
              <path d="M215 163c13-21 45-24 55-2 10 23-5 47-25 55-19 8-41-4-42-25-1-11 4-20 12-28Z" fill="url(#chamberRed)" stroke="#ffe0d7" strokeWidth="3" />
              <path d="M202 216c5-25 36-38 52-17 17 21 21 69 5 91-14 20-41 12-50-8-10-22-12-45-7-66Z" fill="#d9687d" stroke="#f8c5bc" strokeWidth="3" />
              <path d="M186 163c-8 26-9 59-1 88" fill="none" stroke="#ffe1d4" strokeLinecap="round" strokeWidth="4" />
              <path d="M155 134c-3 15 0 24 10 34m38-36c-4 14-1 23 9 31" fill="none" stroke="#ffe1d4" strokeLinecap="round" strokeWidth="4" />
              <path d="M94 202c7 5 16 7 24 6m-2 34c8 2 15 7 20 13m97-61c8-6 15-8 24-7m-22 49c8-4 16-5 23-4" fill="none" opacity=".62" stroke="#fff" strokeWidth="3" />
            </g>
            {currentAnimation?.activeParts.map((part) => {
              const position = chamberPositions[part];
              if (!position) return null;
              return <circle key={part} className="animation-highlight" cx={parseFloat(position.left) * 4} cy={parseFloat(position.top) * 3.9} r="23" />;
            })}
          </svg>
        </div>
        {labelsVisible && model.hotspots.map((hotspot) => {
          const position = chamberPositions[hotspot.id];
          if (!position) return null;
          const active = selectedId === hotspot.id || currentAnimation?.activeParts.includes(hotspot.id);
          return (
            <button
              aria-pressed={selectedId === hotspot.id}
              className={`heart-hotspot hotspot-${position.color}${active ? " hotspot-active" : ""}`}
              key={hotspot.id}
              onClick={() => setSelectedId(hotspot.id)}
              style={{ left: position.left, top: position.top }}
              type="button"
            >
              <span className="hotspot-dot" />{hotspot.label}
            </button>
          );
        })}
        <div aria-label="Heart model controls" className="cardiac-controls">
          <button aria-label="Rotate heart left" className="model-control" onClick={() => setRotation((value) => value - 28)} type="button"><Icon name="rotate" size={16} /></button>
          <button aria-label="Zoom out" className="model-control" onClick={() => setZoom((value) => Math.max(.8, Number((value - .1).toFixed(1))))} type="button"><span className="zoom-glyph">−</span></button>
          <span aria-live="polite" className="zoom-value">{Math.round(zoom * 100)}%</span>
          <button aria-label="Zoom in" className="model-control" onClick={() => setZoom((value) => Math.min(1.35, Number((value + .1).toFixed(1))))} type="button"><span className="zoom-glyph">+</span></button>
          <button aria-label="Reset heart view" className="model-control" onClick={() => { setRotation(-8); setZoom(1); }} type="button"><Icon name="target" size={15} /></button>
          <button aria-pressed={labelsVisible} aria-label={`${labelsVisible ? "Hide" : "Show"} anatomy labels`} className="model-control" onClick={() => setLabelsVisible((visible) => !visible)} type="button"><Icon name="eye" size={15} /></button>
          <button aria-label="Toggle fullscreen viewer" className="model-control" onClick={toggleFullscreen} type="button"><Icon name="grid" size={15} /></button>
        </div>
      </div>
      <div className="animation-controller">
        <div className="animation-controller-title"><span><span className="live-dot" /> FOLLOW THE FLOW</span><strong>{currentAnimation?.caption ?? "Explore the heart"}</strong></div>
        <div className="animation-controller-controls">
          <button aria-label={playing ? "Pause blood-flow animation" : "Play blood-flow animation"} aria-pressed={playing} className="animation-play-button" onClick={() => setPlaying((value) => !value)} type="button">
            <Icon name={playing ? "pause" : "play"} size={15} />
          </button>
          <input
            aria-label="Blood-flow animation step"
            max={Math.max(0, model.animationSteps.length - 1)}
            min="0"
            onChange={(event) => setStep(Number(event.target.value))}
            type="range"
            value={animationStep}
          />
          <span className="animation-step-count">{animationStep + 1}/{model.animationSteps.length}</span>
        </div>
        <p aria-live="polite" className="animation-caption">{currentAnimation?.lessonText ?? model.description}</p>
      </div>
      <div className="hotspot-explanation" aria-live="polite">
        <span className={`explanation-indicator${selectedHotspot ? ` indicator-${chamberPositions[selectedHotspot.id]?.color ?? "blue"}` : ""}`} />
        <span><strong>{selectedHotspot?.label ?? "Choose a heart structure"}</strong><small>{selectedHotspot?.explanation ?? model.description}</small></span>
      </div>
      <p className="viewer-model-description"><strong>Model description:</strong> {model.description} This vector placeholder is available without WebGL; a real 3D model can replace it through the typed model URL.</p>
      {viewerMessage && <p className="viewer-status" role="status">{viewerMessage}</p>}
    </section>
  );
}
