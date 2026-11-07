import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { CTAxis } from '../three/CTScanner';
import { drawCT, type CTHit } from '../three/ctImage';
import type { ModelExperience } from '../three/ModelExperience';

const AXES: { id: CTAxis; label: string }[] = [
  { id: 'axial', label: 'Axial' },
  { id: 'coronal', label: 'Coronal' },
  { id: 'sagittal', label: 'Sagittal' },
];

interface PanelGeometry {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface PanelInteraction {
  mode: 'move' | 'resize';
  pointerId: number;
  startX: number;
  startY: number;
  geometry: PanelGeometry;
}

/** Live CT image of the current slice + scan controls. */
export function CTPanel({ model }: { model: ModelExperience }) {
  const panelRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hitsRef = useRef<CTHit[]>([]);
  const [axis, setAxis] = useState<CTAxis>(() => model.ct!.currentAxis);
  const [pos, setPos] = useState(() => model.ct!.position);
  const [playing, setPlaying] = useState(false);
  const [geometry, setGeometry] = useState<PanelGeometry | null>(null);
  const interactionRef = useRef<PanelInteraction | null>(null);

  // Keep the latest `playing` visible to the rAF loop without restarting it.
  const playingRef = useRef(playing);
  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new ResizeObserver(() => {
      const bounds = stage.getBoundingClientRect();
      setGeometry((current) => {
        if (!current) return current;
        const width = Math.min(current.width, bounds.width);
        const height = Math.min(current.height, bounds.height);
        return {
          width,
          height,
          left: Math.max(0, Math.min(bounds.width - width, current.left)),
          top: Math.max(0, Math.min(bounds.height - height, current.top)),
        };
      });
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  // Draw loop: redraw whenever a new slice is computed (or selection changes).
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const scanner = model.ct!;
    const profile = model.ctConfig!.profile;
    let raf = 0;
    let drawn = '';
    let last = performance.now();
    let dir = 1;

    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (playingRef.current) {
        // Auto-scan: sweep back and forth through the model.
        let t = scanner.position + dir * dt * 0.12;
        if (t >= 1 || t <= 0) {
          dir = -dir;
          t = Math.min(1, Math.max(0, t));
        }
        scanner.setPosition(t);
        setPos(t);
      }

      const size = Math.round(canvas.clientWidth * Math.min(window.devicePixelRatio, 2));
      if (canvas.width !== size) canvas.width = canvas.height = size;
      const slice = scanner.current;
      const sig = `${slice?.version}|${model.selectedPart}|${size}`;
      if (slice && sig !== drawn) {
        hitsRef.current = drawCT(ctx, size, slice, profile, scanner.modelExtent, model.selectedPart);
        drawn = sig;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [model]);

  const chooseAxis = (a: CTAxis) => {
    model.ct?.setAxis(a);
    setAxis(a);
  };

  const onSlider = (v: number) => {
    setPlaying(false);
    model.ct?.setPosition(v);
    setPos(v);
  };

  const beginInteraction = (mode: PanelInteraction['mode'], event: PointerEvent<HTMLElement>) => {
    const panel = panelRef.current;
    const stage = stageRef.current;
    if (!panel || !stage) return;
    event.preventDefault();
    const panelRect = panel.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    const initialGeometry = {
      left: panelRect.left - stageRect.left,
      top: panelRect.top - stageRect.top,
      width: panelRect.width,
      height: panelRect.height,
    };
    interactionRef.current = {
      mode,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      geometry: initialGeometry,
    };
    setGeometry(initialGeometry);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const updateInteraction = (event: PointerEvent<HTMLElement>) => {
    const interaction = interactionRef.current;
    const stage = stageRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId || !stage) return;
    const stageRect = stage.getBoundingClientRect();
    const dx = event.clientX - interaction.startX;
    const dy = event.clientY - interaction.startY;
    const { geometry: start } = interaction;
    if (interaction.mode === 'move') {
      setGeometry({
        ...start,
        left: Math.max(0, Math.min(stageRect.width - start.width, start.left + dx)),
        top: Math.max(0, Math.min(stageRect.height - start.height, start.top + dy)),
      });
      return;
    }

    const minWidth = Math.min(260, stageRect.width);
    const minHeight = Math.min(250, stageRect.height);
    setGeometry({
      ...start,
      width: Math.max(minWidth, Math.min(stageRect.width - start.left, start.width + dx)),
      height: Math.max(minHeight, Math.min(stageRect.height - start.top, start.height + dy)),
    });
  };

  const endInteraction = (event: PointerEvent<HTMLElement>) => {
    if (interactionRef.current?.pointerId === event.pointerId) interactionRef.current = null;
  };

  const handlePanelKeyDown = (event: KeyboardEvent<HTMLElement>, mode: PanelInteraction['mode']) => {
    const directions: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const direction = directions[event.key];
    if (!direction) return;
    event.preventDefault();
    const panel = panelRef.current;
    const stage = stageRef.current;
    if (!panel || !stage) return;
    const panelRect = panel.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    const current = geometry ?? {
      left: panelRect.left - stageRect.left,
      top: panelRect.top - stageRect.top,
      width: panelRect.width,
      height: panelRect.height,
    };
    const amount = event.shiftKey ? 24 : 8;
    if (mode === 'move') {
      setGeometry({
        ...current,
        left: Math.max(0, Math.min(stageRect.width - current.width, current.left + direction[0] * amount)),
        top: Math.max(0, Math.min(stageRect.height - current.height, current.top + direction[1] * amount)),
      });
    } else {
      const minWidth = Math.min(260, stageRect.width - current.left);
      const minHeight = Math.min(250, stageRect.height - current.top);
      setGeometry({
        ...current,
        width: Math.max(minWidth, Math.min(stageRect.width - current.left, current.width + direction[0] * amount)),
        height: Math.max(minHeight, Math.min(stageRect.height - current.top, current.height + direction[1] * amount)),
      });
    }
  };

  /** Tap the CT image to identify the structure under your finger. */
  const onTap = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const r = canvas.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * canvas.width;
    const y = ((e.clientY - r.top) / r.height) * canvas.height;
    const ctx = canvas.getContext('2d')!;
    const hit = [...hitsRef.current].reverse().find((h) => ctx.isPointInPath(h.path, x, y, 'evenodd'));
    const key = hit ? (hit.resolve?.(x, y) ?? hit.key) : null;
    model.select(key && key !== model.selectedPart ? key : null);
  };

  return (
    <section
      aria-label="Slice view"
      className="ct-panel"
      ref={(element) => {
        panelRef.current = element;
        stageRef.current = element?.closest<HTMLElement>('.heart-3d-stage') ?? null;
      }}
      style={geometry ? {
        height: `${geometry.height}px`,
        left: `${geometry.left}px`,
        right: 'auto',
        top: `${geometry.top}px`,
        width: `${geometry.width}px`,
      } : undefined}
    >
      <div
        aria-label="Move slice view panel; use arrow keys to move"
        className="ct-panel-header"
        onKeyDown={(event) => handlePanelKeyDown(event, 'move')}
        onPointerDown={(event) => beginInteraction('move', event)}
        onPointerMove={updateInteraction}
        onPointerUp={endInteraction}
        role="button"
        tabIndex={0}
      >
        <span>Slice view</span>
        <span aria-hidden="true" className="ct-panel-move-icon">↕</span>
      </div>
      <canvas
        ref={canvasRef}
        className="ct-image"
        onPointerUp={onTap}
        role="img"
        aria-label={`${axis} slice of the heart. Tap a structure to identify it.`}
      />
      <div className="ct-axes" role="radiogroup" aria-label="Slice plane">
        {AXES.map((a) => (
          <button
            key={a.id}
            role="radio"
            aria-checked={axis === a.id}
            className={axis === a.id ? 'is-on' : ''}
            onClick={() => chooseAxis(a.id)}
          >
            {a.label}
          </button>
        ))}
      </div>
      <div className="ct-scrub">
        <button
          className="ct-play"
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? 'Pause scan' : 'Auto scan'}
        >
          {playing ? '❚❚' : '▶'}
        </button>
        <input
          type="range"
          min={0}
          max={1000}
          value={Math.round(pos * 1000)}
          onChange={(e) => onSlider(Number(e.target.value) / 1000)}
          aria-label="Slice position"
        />
      </div>
      <button
        aria-label="Resize slice view panel; use arrow keys to resize"
        className="ct-panel-resize"
        onKeyDown={(event) => handlePanelKeyDown(event, 'resize')}
        onPointerDown={(event) => beginInteraction('resize', event)}
        onPointerMove={updateInteraction}
        onPointerUp={endInteraction}
        type="button"
      >
        <span aria-hidden="true">↘</span>
      </button>
    </section>
  );
}
