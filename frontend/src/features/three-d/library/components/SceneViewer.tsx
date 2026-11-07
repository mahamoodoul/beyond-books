import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

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
}

const IDLE: RunnerSnapshot = { status: "idle", index: 0, progress: 0 };
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
    rt.hidden = new Set(hidden);
    rt.showLabels = showLabels;
    rt.explodeTarget = explode;
    rt.reducedMotion = reducedMotion;
  }, [runner, selected, hidden, showLabels, explode, reducedMotion]);

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
  const select = useCallback(
    (id: string | null) => {
      setSelected(id);
      if (id) onEvent?.({ type: "component_selected", componentId: id });
    },
    [onEvent],
  );
  const focus = (id: string) => setCamera((c) => ({ kind: "focus", componentId: id, key: c.key + 1 }));
  const fit = () => setCamera((c) => ({ kind: "fit", key: c.key + 1 }));
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
      />

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div
          ref={container}
          className="relative aspect-[4/3] min-h-72 overflow-hidden rounded-lg bg-navy-950 sm:aspect-video lg:aspect-auto lg:h-[34rem]"
        >
          <SceneCanvas
            scene={scene}
            runtime={runtime}
            camera={camera}
            canSelect={canSelect}
            onSelect={select}
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
          components={scene.components}
          selected={selected}
          hidden={hidden}
          missing={missing}
          frame={uiFrame}
          explanations={explanations}
          onSelect={select}
          onToggleVisibility={toggleVisibility}
          onFocus={focus}
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
