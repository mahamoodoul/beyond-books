import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

import { useReducedMotion } from "@/features/three-d/library/hooks/useReducedMotion";
import {
  AnimationRunner,
  deriveFrame,
  validateAnimation,
  type RunnerSnapshot,
} from "@/features/three-d/library/runtime/animation";
import { proceduralCatalog } from "@/features/three-d/library/runtime/procedural";
import { lowerTier, type QualitySetting, type QualityTier } from "@/features/three-d/library/runtime/quality";
import { resolveScene } from "@/features/three-d/library/runtime/sceneResolver";
import type {
  AnimationSpec,
  AssetRegistry,
  ResolvedComponent,
  ResolvedScene,
  SceneSpec,
  ViewerEvent,
} from "@/features/three-d/library/runtime/types";
import { createViewerRuntime } from "@/features/three-d/library/runtime/viewerRuntime";

import { AnimationTimeline } from "./AnimationTimeline";
import { ExplanationPanel } from "./ExplanationPanel";
import { SceneCanvas, type CameraCommand } from "./SceneCanvas";
import { SceneToolbar } from "./SceneToolbar";

export interface SceneViewerProps {
  scene: SceneSpec;
  /** Animations available to this scene; only those in scene.animation_refs are offered. */
  animations?: AnimationSpec[];
  registry: AssetRegistry;
  /** explanation_ref -> text, from the lesson content. */
  explanations?: Readonly<Record<string, string>>;
  onEvent?: (event: ViewerEvent) => void;
  className?: string;
  /** Extra in-depth content for the selected part (e.g. an AI study card). `inspect(meshName)`
   *  focuses another part, so details can link to related parts. */
  renderDetails?: (component: ResolvedComponent, inspect: (meshName: string) => void) => ReactNode;
  /** Live label overrides by mesh name (e.g. after a teacher renames a part), no model reload. */
  labels?: Readonly<Record<string, string>>;
  /** Guided-tour narration: intro, teaching order (mesh names) and each part's link to the topic. */
  tour?: TourNarration;
  /** Called when the guided tour starts (e.g. to prepare the narration on demand). */
  onTourStart?: () => void;
}

export interface TourNarration {
  topic: string;
  intro?: string;
  order?: readonly string[];
  notes?: Readonly<Record<string, string>>;
  /** The narration is being written. */
  loading?: boolean;
}

const IDLE: RunnerSnapshot = { status: "idle", index: 0, progress: 0 };
/** How long the guided tour stays on each part. */
const TOUR_STEP_MS = 7000;
const noopSubscribe = () => () => {};

/**
 * Contract-driven 3D viewer: resolves a validated SceneSpec against the asset registry, renders
 * it with selectable, labelled components, an exploded view and the guided animation timeline.
 */
export function SceneViewer(props: SceneViewerProps) {
  const { scene: spec, registry } = props;
  const scene = useMemo(() => resolveScene(spec, registry, proceduralCatalog), [spec, registry]);
  // remount per scene so each one gets a fresh runtime, registry and GPU resources
  return <ViewerBody key={spec.scene_id} {...props} scene={scene} />;
}

function ViewerBody({
  scene,
  animations = [],
  explanations,
  onEvent,
  className = "",
  renderDetails,
  labels,
  tour: narration,
  onTourStart,
}: Omit<SceneViewerProps, "scene"> & { scene: ResolvedScene }) {
  const spec = scene.spec;
  const [initialRuntime] = useState(() => createViewerRuntime(scene.paths));
  const runtime = useRef(initialRuntime);
  const reducedMotion = useReducedMotion();
  const container = useRef<HTMLDivElement>(null);

  const [loadError, setLoadError] = useState<string | null>(null);
  const [missing, setMissing] = useState<ReadonlySet<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const [quality, setQuality] = useState<QualitySetting>("auto");
  const [autoTier, setAutoTier] = useState<QualityTier>("high");
  const tier: QualityTier = quality === "auto" ? autoTier : quality;
  const [selected, setSelected] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [xray, setXray] = useState(false);
  const [tour, setTour] = useState<{ index: number; playing: boolean } | null>(null);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [showLabels, setShowLabels] = useState(true);
  const [explode, setExplode] = useState(0);
  const [camera, setCamera] = useState<CameraCommand>({ kind: "fit", key: 0 });

  const componentIds = useMemo(
    () => new Set(scene.components.map((c) => c.componentId)),
    [scene],
  );
  const sceneAnimations = useMemo(
    () =>
      (spec.animation_refs ?? [])
        .map((id) => animations.find((a) => a.animation_id === id))
        .filter((a): a is AnimationSpec => !!a),
    [spec, animations],
  );
  const [animationId, setAnimationId] = useState<string | null>(null);
  const animation =
    sceneAnimations.find((a) => a.animation_id === animationId) ?? sceneAnimations[0] ?? null;
  const problems = useMemo(
    () => (animation ? validateAnimation(animation, componentIds, scene.paths) : []),
    [animation, componentIds, scene.paths],
  );
  const runner = useMemo(
    () => (animation && problems.length === 0 ? new AnimationRunner(animation.steps) : null),
    [animation, problems],
  );
  const snapshot = useSyncExternalStore(
    runner?.subscribe ?? noopSubscribe,
    runner?.getSnapshot ?? (() => IDLE),
  );
  const uiFrame = useMemo(
    () => (runner ? deriveFrame(runner.steps, snapshot, scene.paths, true) : deriveFrame([], IDLE, {})),
    [runner, snapshot, scene.paths],
  );

  // push UI state into the render loop's runtime
  useEffect(() => {
    const rt = runtime.current;
    rt.runner = runner;
    rt.selected = selected;
    rt.isolated = focused;
    rt.xray = xray;
    rt.hidden = new Set(hidden);
    rt.showLabels = showLabels;
    rt.explodeTarget = explode;
    rt.reducedMotion = reducedMotion;
    rt.invalidate();
  }, [runner, selected, focused, xray, hidden, showLabels, explode, reducedMotion, snapshot]);

  // learning events
  const lastEvent = useRef<string>("");
  useEffect(() => {
    if (!animation || !onEvent) return;
    const id = animation.animation_id;
    const key = `${id}:${snapshot.status}:${snapshot.index}`;
    if (key === lastEvent.current) return;
    const prev = lastEvent.current;
    lastEvent.current = key;
    if (snapshot.status === "playing" && snapshot.index === 0 && !prev.startsWith(`${id}:playing`)) {
      onEvent({ type: "animation_started", animationId: id });
    }
    if (snapshot.status === "playing" || snapshot.status === "paused") {
      onEvent({ type: "animation_step", animationId: id, step: snapshot.index + 1 });
    }
    if (snapshot.status === "finished") onEvent({ type: "animation_completed", animationId: id });
  }, [animation, snapshot, onEvent]);

  const byId = useMemo(
    () => new Map(scene.components.map((c) => [c.componentId, c])),
    [scene],
  );
  const selectable = (spec.controls ?? []).includes("select_component");
  const canSelect = useCallback(
    (id: string) => selectable && byId.has(id) && !missing.has(id),
    [selectable, byId, missing],
  );
  const focus = (id: string) => setCamera((c) => ({ kind: "focus", componentId: id, key: c.key + 1 }));
  const fit = () => setCamera((c) => ({ kind: "fit", key: c.key + 1 }));
  /** Clicking a part (in 3D, on its label or by name) focuses it: camera flies to it, the rest
   *  is ghosted, and the panel shows it in depth. Clicking empty space leaves focus mode. */
  const select = useCallback(
    (id: string | null) => {
      setSelected(id);
      setFocused(id);
      if (id) {
        setCamera((c) => ({ kind: "focus", componentId: id, key: c.key + 1 }));
        onEvent?.({ type: "component_selected", componentId: id });
      }
    },
    [onEvent],
  );
  const showAll = useCallback(() => {
    setTour(null);
    setFocused(null);
    setSelected(null);
    setCamera((c) => ({ kind: "fit", key: c.key + 1 }));
  }, []);

  // Parts in model order that can actually be shown (used by next/previous and the tour).
  const order = useMemo(() => {
    const shown = scene.components.filter((c) => !missing.has(c.componentId));
    const rank = new Map((narration?.order ?? []).map((m, i) => [m, i]));
    // the narration's teaching order first; parts it doesn't list keep model order at the end
    return [...shown]
      .sort((a, b) => (rank.get(a.meshName) ?? 1e6) - (rank.get(b.meshName) ?? 1e6))
      .map((c) => c.componentId);
  }, [scene, missing, narration?.order]);
  const step = useCallback(
    (delta: number) => {
      if (order.length === 0) return;
      const at = selected ? order.indexOf(selected) : -1;
      const next = order[(at + delta + order.length) % order.length];
      if (next) select(next);
    },
    [order, selected, select],
  );
  // If the order changes mid-tour (narration arrived), stay on the current part.
  const lastOrder = useRef(order);
  useEffect(() => {
    if (lastOrder.current === order) return;
    lastOrder.current = order;
    setTour((t) => {
      const at = selected ? order.indexOf(selected) : -1;
      return t && at >= 0 && at !== t.index ? { ...t, index: at } : t;
    });
  }, [order, selected]);
  // Guided tour: focus each part in turn, long enough to read its explanation.
  useEffect(() => {
    if (!tour) return;
    const id = order[tour.index];
    if (!id) {
      setTour(null);
      return;
    }
    select(id);
    if (!tour.playing) return;
    const t = window.setTimeout(
      () => setTour((s) => (s && s.playing ? { ...s, index: s.index + 1 } : s)),
      TOUR_STEP_MS,
    );
    return () => window.clearTimeout(t);
  }, [tour, order]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggleTour = () => {
    if (!tour) onTourStart?.();
    setTour((t) =>
      t ? { ...t, playing: !t.playing } : { index: Math.max(0, selected ? order.indexOf(selected) : 0), playing: true },
    );
  };
  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === container.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const selectedComponent = selected ? byId.get(selected) : undefined;
  const labelOf = (c: ResolvedComponent) => labels?.[c.meshName] ?? c.label;
  const noteOf = (c: ResolvedComponent | undefined) => (c ? narration?.notes?.[c.meshName] : undefined);
  const manualSelect = useCallback(
    (id: string | null) => {
      setTour((t) => (t ? { ...t, playing: false } : t)); // a manual click pauses the tour
      select(id);
    },
    [select],
  );
  const inspectMesh = useCallback(
    (meshName: string) => {
      const c = scene.components.find((x) => x.meshName === meshName);
      if (c && !missing.has(c.componentId)) select(c.componentId);
    },
    [scene, missing, select],
  );
  useEffect(() => {
    if (!focused) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && showAll();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focused, showAll]);
  const focusedComponent = focused ? byId.get(focused) : undefined;
  const toggleVisibility = (id: string) =>
    setHidden((h) => {
      const next = new Set(h);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (scene.errors.length > 0) {
    return (
      <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <p className="font-medium">This 3D scene can't be shown.</p>
        <ul className="mt-2 list-disc pl-5">
          {scene.errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      </div>
    );
  }

  const explodable = scene.assets.length > 0;
  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      <SceneToolbar
        showLabels={showLabels}
        onShowLabels={setShowLabels}
        explode={explodable ? explode : null}
        onExplode={(v) => {
          setExplode(v);
          runtime.current.explodeTarget = v;
          runtime.current.invalidate();
        }}
        onExplodeCommit={() => {
          fit();
          onEvent?.({ type: "explode_changed", amount: runtime.current.explodeTarget });
        }}
        onResetView={fit}
        quality={quality}
        effectiveTier={tier}
        onQuality={setQuality}
        onFullscreen={() => void container.current?.requestFullscreen?.()}
        xray={xray}
        onXray={setXray}
        touring={!!tour?.playing}
        onTour={order.length > 1 ? toggleTour : undefined}
      />

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_18rem] xl:grid-cols-[minmax(0,1fr)_22rem] 2xl:grid-cols-[minmax(0,1fr)_26rem]">
        <div
          ref={container}
          className="relative aspect-[4/3] min-h-72 overflow-hidden rounded-lg bg-navy-950 sm:aspect-video lg:aspect-auto lg:h-[clamp(32rem,72vh,60rem)]"
        >
          <SceneCanvas
            scene={scene}
            runtime={runtime}
            camera={camera}
            canSelect={canSelect}
            onSelect={manualSelect}
            quality={tier}
            onQualityDecline={quality === "auto" ? () => setAutoTier(lowerTier) : undefined}
            onReady={({ missing: m }) => {
              setLoaded(true);
              setMissing(new Set(m));
            }}
            onError={setLoadError}
          />
          {!loaded && !loadError && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <p className="rounded-md bg-white/90 px-3 py-2 text-sm text-slate-700">
                Loading 3D model…
              </p>
            </div>
          )}
          {focusedComponent && (
            <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-white/95 py-1 pl-3 pr-1 text-sm shadow">
              <span className="text-slate-500">Focused:</span>
              <span className="font-medium text-navy-950">{labels?.[focusedComponent.meshName] ?? focusedComponent.label}</span>
              <button
                type="button"
                onClick={showAll}
                className="rounded-full bg-navy-900 px-2.5 py-0.5 text-xs font-medium text-white hover:bg-navy-700"
              >
                Show all <span className="opacity-60">Esc</span>
              </button>
            </div>
          )}
          {isFullscreen && (
            <FullscreenTourCard
              part={selectedComponent ? labelOf(selectedComponent) : null}
              explanation={
                selectedComponent?.explanationRef ? explanations?.[selectedComponent.explanationRef] : undefined
              }
              note={noteOf(selectedComponent)}
              narration={narration}
              position={selected && order.includes(selected) ? { at: order.indexOf(selected) + 1, of: order.length } : null}
              tour={tour}
              onPrev={() => { setTour((t) => (t ? { ...t, playing: false } : t)); step(-1); }}
              onNext={() => { setTour((t) => (t ? { ...t, playing: false } : t)); step(1); }}
              onTour={order.length > 1 ? toggleTour : undefined}
              onExit={() => void document.exitFullscreen?.()}
            />
          )}
          {uiFrame.annotation && (
            <p className="pointer-events-none absolute inset-x-4 top-4 mx-auto max-w-xl rounded-md bg-white/95 px-4 py-2 text-center text-sm text-slate-800 shadow">
              {uiFrame.annotation.text}
            </p>
          )}
          {loadError && (
            <div role="alert" className="absolute inset-0 grid place-items-center p-6">
              <p className="rounded-md bg-white px-4 py-3 text-sm text-red-800">
                Couldn't load the 3D model: {loadError}
              </p>
            </div>
          )}
        </div>

        <ExplanationPanel
          components={
            labels
              ? scene.components.map((c) => (labels[c.meshName] ? { ...c, label: labels[c.meshName] as string } : c))
              : scene.components
          }
          selected={selected}
          hidden={hidden}
          missing={missing}
          frame={uiFrame}
          explanations={explanations}
          onSelect={manualSelect}
          onToggleVisibility={toggleVisibility}
          onFocus={focus}
          focused={focused}
          onShowAll={showAll}
          details={focusedComponent && renderDetails ? renderDetails(focusedComponent, inspectMesh) : null}
          onPrev={order.length > 1 ? () => { setTour(null); step(-1); } : undefined}
          onNext={order.length > 1 ? () => { setTour(null); step(1); } : undefined}
          position={selected && order.includes(selected) ? { at: order.indexOf(selected) + 1, of: order.length } : null}
          touring={tour ? { at: tour.index + 1, of: order.length, playing: tour.playing } : null}
          note={noteOf(selectedComponent)}
          topic={narration?.topic}
        />
      </div>

      <AnimationTimeline
        animations={sceneAnimations}
        selectedId={animation?.animation_id ?? null}
        onSelectAnimation={(id) => {
          runner?.reset();
          setAnimationId(id);
        }}
        runner={runner}
        snapshot={snapshot}
        problems={problems}
      />
    </div>
  );
}

/** Fullscreen guided-tour card: part, short explanation and its connection to the main topic. */
function FullscreenTourCard({
  part,
  explanation,
  note,
  narration,
  position,
  tour,
  onPrev,
  onNext,
  onTour,
  onExit,
}: {
  part: string | null;
  explanation?: string;
  note?: string;
  narration?: TourNarration;
  position: { at: number; of: number } | null;
  tour: { index: number; playing: boolean } | null;
  onPrev: () => void;
  onNext: () => void;
  onTour?: () => void;
  onExit: () => void;
}) {
  const btn = "rounded-md px-3 py-1.5 text-sm font-medium";
  return (
    <div className="absolute bottom-4 left-4 max-h-[45%] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-xl bg-white/95 p-4 shadow-2xl backdrop-blur" role="region" aria-label="Selected part">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <span className="text-accent">{tour ? "Guided tour" : "3D Studio"}</span>
        {narration?.topic && <span className="truncate">· {narration.topic}</span>}
        <span className="ml-auto tabular-nums">{position ? `${position.at} / ${position.of}` : ""}</span>
      </div>
      {part ? (
        <>
          <h2 className="mt-1 text-xl font-semibold text-navy-950">{part}</h2>
          <p className="mt-1 text-sm leading-relaxed text-slate-700">{explanation || "No description yet."}</p>
          {note ? (
            <p className="mt-2 border-l-4 border-accent pl-3 text-sm text-slate-800">
              <span className="font-semibold">Connection to {narration?.topic ?? "the topic"}: </span>
              {note}
            </p>
          ) : narration?.loading ? (
            <p className="mt-2 text-sm text-slate-500">Writing how each part connects to the topic…</p>
          ) : null}
        </>
      ) : (
        <p className="mt-1 text-sm text-slate-700">
          {narration?.intro ?? "Press ▶ Tour to fly through every part, or Next to step through them."}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={onPrev} className={`${btn} border border-slate-300 text-slate-700 hover:bg-slate-50`}>‹ Prev</button>
        {onTour && (
          <button type="button" onClick={onTour} className={`${btn} bg-navy-900 text-white hover:bg-navy-700`}>
            {tour?.playing ? "❚❚ Pause" : tour ? "▶ Resume" : "▶ Tour"}
          </button>
        )}
        <button type="button" onClick={onNext} className={`${btn} border border-slate-300 text-slate-700 hover:bg-slate-50`}>Next ›</button>
        <button type="button" onClick={onExit} className={`${btn} ml-auto text-slate-600 hover:bg-slate-100`}>Exit fullscreen</button>
      </div>
    </div>
  );
}

