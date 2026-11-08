import { Line, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, type ComponentRef, type RefObject } from "react";
import * as THREE from "three";
import { acceleratedRaycast, MeshBVH } from "three-mesh-bvh";

import { deriveFrame } from "@/features/three-d/library/runtime/animation";
import { loadGlb } from "@/features/three-d/library/runtime/assetLoader";
import { ClipPlayer } from "@/features/three-d/library/runtime/clipPlayer";
import { labelSpot } from "@/features/three-d/library/runtime/labels";
import { computeExplodeOffsets, explodedBounds } from "@/features/three-d/library/runtime/explode";
import { buildProcedural, type ProceduralInstance } from "@/features/three-d/library/runtime/procedural";
import { disposeObject3D } from "@/features/three-d/library/runtime/resourceDisposer";
import { AUTO_QUALITY, QUALITY, type QualityTier } from "@/features/three-d/library/runtime/quality";
import type { ResolvedScene, Vec3 } from "@/features/three-d/library/runtime/types";
import type { ViewerRuntime } from "@/features/three-d/library/runtime/viewerRuntime";

import { CooperativeWheel } from "./CooperativeWheel";
import {
  PostEffects,
  QualityMonitor,
  RendererToneMapping,
  StudioEnvironment,
  StudioLights,
} from "./RenderSettings";

export type CameraCommand =
  | { kind: "fit"; key: number }
  | { kind: "focus"; componentId: string; key: number };

export interface SceneCanvasProps {
  scene: ResolvedScene;
  runtime: RefObject<ViewerRuntime>;
  camera: CameraCommand;
  canSelect: (componentId: string) => boolean;
  onSelect: (componentId: string | null) => void;
  onReady: (info: { missing: string[] }) => void;
  onError: (message: string) => void;
  /** Called on every animation step / status change detected by the render loop. */
  onAnimationTick?: () => void;
  quality: QualityTier;
  /** Set when quality is "auto": called when the frame rate drops. */
  onQualityDecline?: () => void;
}

export function SceneCanvas(props: SceneCanvasProps) {
  const q = QUALITY[props.quality];
  const [ready, setReady] = useState(false);
  // judge performance only once loading, BVH builds and shader compiles are behind us
  const [monitoring, setMonitoring] = useState(false);
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => setMonitoring(true), AUTO_QUALITY.startDelayMs);
    return () => clearTimeout(t);
  }, [ready]);
  return (
    <Canvas
      className="touch-none"
      // render only when something changes: an idle view costs nothing (GPU, battery, fans)
      frameloop="demand"
      dpr={q.dpr}
      shadows={q.shadows ? "soft" : false}
      camera={{ fov: 40, near: 0.05, far: 2000, position: [6, 4, 6] }}
      // gl options apply once at creation; keep them fixed across tiers
      gl={{ antialias: true, preserveDrawingBuffer: false, powerPreference: "high-performance" }}
      onCreated={({ raycaster }) => {
        // with a BVH per mesh, stop at the first hit instead of collecting every triangle
        raycaster.firstHitOnly = true;
      }}
      onPointerMissed={() => props.onSelect(null)}
    >
      {/* Same light studio backdrop as the Chapter Studio viewport, so models read the same everywhere. */}
      <color attach="background" args={["#eef2f6"]} />
      <StudioEnvironment />
      <RendererToneMapping enabled={!q.postprocessing} />
      <StudioLights runtime={props.runtime} tier={props.quality} ready={ready} />
      <SceneContent
        {...props}
        onReady={(info) => {
          setReady(true);
          props.onReady(info);
        }}
      />
      {ready && <PostEffects runtime={props.runtime} tier={props.quality} />}
      <QualityMonitor
        enabled={monitoring && !!props.onQualityDecline}
        onDecline={() => props.onQualityDecline?.()}
      />
      <CooperativeWheel />
    </Canvas>
  );
}

function SceneContent({
  scene,
  runtime,
  camera,
  canSelect,
  onSelect,
  onReady,
  onError,
  onAnimationTick,
}: SceneCanvasProps) {
  const [roots, setRoots] = useState<THREE.Object3D[] | null>(null);
  const procedural = useRef<ProceduralInstance[]>([]);
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const threeScene = useThree((s) => s.scene);
  const threeCamera = useThree((s) => s.camera);
  const pendingReady = useRef<{ missing: string[] } | null>(null);
  const meshes = useRef<THREE.Mesh[]>([]);
  const nested = useRef(true);
  // latest onReady without re-running effects when the parent re-renders
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  const clips = useRef<ClipPlayer | null>(null);
  // ---- load assets + build procedural sources; dispose everything on unmount
  useEffect(() => {
    const ctrl = new AbortController();
    const built: THREE.Object3D[] = [];
    (async () => {
      try {
        for (const asset of scene.assets) {
          const root = await loadGlb(asset.url, ctrl.signal);
          root.name = `asset:${asset.meta.asset_id}`;
          built.push(root);
        }
        procedural.current = [];
        for (const src of scene.spec.procedural ?? []) {
          const inst = buildProcedural(src.generator, src.params ?? {});
          if (inst) {
            procedural.current.push(inst);
            built.push(inst.root);
          }
        }
        if (ctrl.signal.aborted) return;
        const rt = runtime.current;
        const holder = new THREE.Group();
        built.forEach((r) => holder.add(r));
        const missing = rt.registry.registerFrom(holder, scene.components);
        built.forEach((r) => holder.remove(r));
        rt.bounds = rt.registry.bounds();
        const authored: Record<string, Vec3 | undefined> = {};
        for (const c of scene.components) authored[c.componentId] = c.meta?.explode_offset;
        rt.offsets = computeExplodeOffsets(rt.bounds, authored);
        rt.animatedScene = procedural.current.some((p) => !!p.update);
        clips.current?.dispose();
        clips.current = new ClipPlayer(built);
        meshes.current = prepareMeshes(built, rt);
        nested.current = true;
        pendingReady.current = { missing };
        setRoots(built);
      } catch (err) {
        if (!ctrl.signal.aborted) {
          onError(err instanceof Error ? err.message : "Could not load the 3D model.");
        }
      }
    })();
    return () => {
      ctrl.abort();
      clips.current?.dispose();
      clips.current = null;
      built.forEach(disposeObject3D);
      runtime.current.registry.dispose();
      procedural.current = [];
    };
  }, [scene]);

  // let UI code (selection, explode slider, labels) request frames
  useEffect(() => {
    runtime.current.invalidate = invalidate;
    invalidate();
    return () => {
      runtime.current.invalidate = () => {};
    };
  }, [runtime, invalidate]);

  // ---- compile every shader before the model is shown, so the first orbit doesn't hitch
  useEffect(() => {
    if (!roots || !pendingReady.current) return;
    const info = pendingReady.current;
    let cancelled = false;
    // cleared only once delivered, so StrictMode's mount/unmount/mount still reports ready
    gl.compileAsync(threeScene, threeCamera)
      .catch(() => undefined)
      .then(() => {
        if (cancelled || pendingReady.current !== info) return;
        pendingReady.current = null;
        onReadyRef.current(info);
      });
    return () => {
      cancelled = true;
    };
  }, [roots, gl, threeScene, threeCamera]);

  // ---- per-frame: timeline, explode easing, visual state
  const time = useRef(0);
  useFrame((_, delta) => {
    const rt = runtime.current;
    // on-demand rendering: the first frame after idle has a huge delta; cap it
    const dt = Math.min(delta, 1 / 30);
    time.current += dt;
    if (rt.runner && rt.runner.tick(dt * 1000)) onAnimationTick?.();
    const goal = rt.explodeTarget;
    rt.explode = rt.reducedMotion
      ? goal
      : THREE.MathUtils.damp(rt.explode, goal, 5, dt);
    if (Math.abs(rt.explode - goal) < 1e-4) rt.explode = goal;
    const isNested = rt.explode < NESTED_UNTIL;
    if (isNested !== nested.current) {
      nested.current = isNested;
      applyNestedOrder(meshes.current, isNested);
    }
    rt.frame = rt.runner
      ? deriveFrame(rt.runner.steps, rt.runner.position, rt.paths, rt.reducedMotion)
      : rt.frame;
    rt.registry.apply({
      explode: rt.explode,
      offsets: rt.offsets,
      frame: rt.frame,
      hidden: rt.hidden,
      selected: rt.selected,
      isolated: rt.isolated,
      xray: rt.xray,
      hovered: rt.hovered,
      timeSeconds: time.current,
      reducedMotion: rt.reducedMotion,
    });
    clips.current?.apply(rt.frame.clip);
    if (!rt.reducedMotion) for (const p of procedural.current) p.update?.(dt);
    // keep rendering while anything is still changing; otherwise go idle
    const busy =
      rt.explode !== goal ||
      rt.runner?.position.status === "playing" ||
      (rt.animatedScene && !rt.reducedMotion) ||
      (rt.frame.highlight !== null && !rt.reducedMotion) ||
      rt.frame.flow !== null;
    if (busy) invalidate();
  });

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    const id = runtime.current.registry.idFor(e.object);
    if (id && canSelect(id)) {
      e.stopPropagation();
      onSelect(id);
    }
  };
  const handleMove = (e: ThreeEvent<PointerEvent>) => {
    // while a button is held the pointer is orbiting or panning the view: parts sweeping under
    // it must not light up one after another, which read as the model changing colour
    if (e.buttons !== 0) return;
    const id = runtime.current.registry.idFor(e.object);
    const selectable = id && canSelect(id) ? id : null;
    if (runtime.current.hovered !== selectable) {
      runtime.current.hovered = selectable;
      gl.domElement.style.cursor = selectable ? "pointer" : "";
      invalidate();
    }
    if (selectable) e.stopPropagation();
  };
  const handleOut = () => {
    if (runtime.current.hovered !== null) invalidate();
    runtime.current.hovered = null;
    gl.domElement.style.cursor = "";
  };

  // the loading message is a DOM overlay in SceneViewer, not an <Html> root inside the canvas
  if (!roots) return null;
  return (
    <>
      {roots.map((r) => (
        <primitive
          key={r.uuid}
          object={r}
          onClick={handleClick}
          onPointerMove={handleMove}
          onPointerOut={handleOut}
        />
      ))}
      <CameraRig scene={scene} runtime={runtime} command={camera} />
      <Labels scene={scene} runtime={runtime} canSelect={canSelect} onSelect={onSelect} />
      <FlowParticles runtime={runtime} />
    </>
  );
}

/**
 * One-time mesh setup after loading:
 *  - BVH per geometry, so hover/click raycasts don't test millions of triangles per mouse move;
 *  - opaque parts cast shadows (see-through shells would darken everything inside them);
 *  - each mesh records a nesting rank, inner (smaller) components before outer ones. While the
 *    cell is assembled, see-through parts draw in that fixed order: three.js otherwise sorts
 *    transparent objects by their centre's depth, and nested shells with nearby centres swap
 *    order as the camera orbits, which reads as flashing. Once exploded the parts no longer
 *    nest, so normal depth sorting is right again (see applyNestedOrder).
 */
function prepareMeshes(roots: THREE.Object3D[], rt: ViewerRuntime): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  const volume = (s: THREE.Vector3) => s.x * s.y * s.z;
  const byVolume = rt.registry.all().sort((a, b) => volume(a.size) - volume(b.size));
  const order = new Map<THREE.Object3D, number>();
  byVolume.forEach((r, i) => order.set(r.object, i + 1));
  for (const root of roots) {
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const geo = mesh.geometry as THREE.BufferGeometry & { boundsTree?: MeshBVH };
      if (!geo.boundsTree && geo.index) {
        geo.boundsTree = new MeshBVH(geo);
        mesh.raycast = acceleratedRaycast;
      }
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mesh.castShadow = mats.every((m) => !m.transparent && m.opacity >= 0.999);
      mesh.receiveShadow = true;
      for (let p: THREE.Object3D | null = mesh; p; p = p.parent) {
        const rank = order.get(p);
        if (rank !== undefined) {
          mesh.userData.nestedOrder = rank;
          break;
        }
      }
      meshes.push(mesh);
    });
  }
  applyNestedOrder(meshes, true);
  return meshes;
}

function applyNestedOrder(meshes: THREE.Mesh[], nested: boolean) {
  for (const m of meshes) m.renderOrder = nested ? ((m.userData.nestedOrder as number) ?? 0) : 0;
}

/** Parts count as nested (fixed draw order) until they are a third of the way apart. */
const NESTED_UNTIL = 0.33;

// ------------------------------------------------------------------------ camera

const PRESET_DIRECTIONS: Record<string, Vec3> = {
  front: [0, 0.15, 1],
  side: [1, 0.15, 0],
  top: [0, 1, 0.02],
  three_quarter: [1, 0.7, 1],
};
const EXPLODED_DIRECTION: Vec3 = [0.22, 0.4, 1];

interface Tween {
  fromPos: THREE.Vector3;
  toPos: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
  t: number;
  duration: number;
}

function CameraRig({
  scene,
  runtime,
  command,
}: {
  scene: ResolvedScene;
  runtime: RefObject<ViewerRuntime>;
  command: CameraCommand;
}) {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const cam = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const invalidate = useThree((s) => s.invalidate);
  const tween = useRef<Tween | null>(null);
  const lastFocusKey = useRef<number | null>(null);
  const spec = scene.spec.camera ?? {};
  const minD = spec.min_distance ?? 1;
  const maxD = spec.max_distance ?? 20;
  const controlsAllowed = new Set(scene.spec.controls ?? ["rotate", "zoom"]);

  /** Closest the camera may get: the scene's limit, or nearer while one part is focused so a
   *  small part can fill the view instead of stopping far away at the whole-model limit. */
  const nearestAllowed = () => {
    const rt = runtime.current;
    const reg = rt.isolated ? rt.registry.get(rt.isolated) : undefined;
    if (!reg) return minD;
    return Math.max(0.05, Math.min(minD, reg.size.length() * 0.35));
  };

  const moveTo = (target: THREE.Vector3, distance: number, dir?: THREE.Vector3) => {
    const c = controls.current;
    const from = c ? c.target.clone() : new THREE.Vector3();
    const d = dir ?? cam.position.clone().sub(from).normalize();
    const dist = THREE.MathUtils.clamp(distance, nearestAllowed(), maxD);
    const toPos = target.clone().addScaledVector(d, dist);
    tween.current = {
      fromPos: cam.position.clone(),
      toPos,
      fromTarget: from,
      toTarget: target.clone(),
      t: 0,
      duration: runtime.current.reducedMotion ? 0 : 0.9,
    };
    invalidate();
  };

  const fitDistance = (radius: number) => {
    const half = THREE.MathUtils.degToRad(cam.fov / 2);
    const aspect = Math.max(cam.aspect, 0.5);
    return (radius / Math.sin(Math.min(half, Math.atan(Math.tan(half) * aspect)))) * 1.05;
  };

  /**
   * Frame the whole scene. Assembled: the scene's camera preset. Exploded: a near-frontal view,
   * because exploded layouts are spread out like a diagram facing the viewer (+Z).
   */
  const fit = () => {
    const rt = runtime.current;
    const b = explodedBounds(rt.bounds, rt.offsets, rt.explodeTarget);
    const exploded = rt.explodeTarget >= 0.5;
    const dir = new THREE.Vector3(
      ...(exploded
        ? EXPLODED_DIRECTION
        : (PRESET_DIRECTIONS[spec.preset ?? "three_quarter"] ?? [1, 0.7, 1])),
    ).normalize();
    // the bounding sphere over-estimates deep exploded layouts; frame a little tighter
    moveTo(new THREE.Vector3(...b.center), fitDistance(b.radius) * (exploded ? 0.8 : 1), dir);
  };

  // first fit uses the scene's camera preset and jumps there
  useEffect(() => {
    fit();
    if (tween.current) tween.current.duration = 0;
  }, []);

  useEffect(() => {
    if (command.key === 0) return;
    if (command.kind === "fit") fit();
    else focusOn(command.componentId);
  }, [command]);

  const focusOn = (id: string) => {
    const rt = runtime.current;
    const center = rt.registry.worldCenter(id);
    const reg = rt.registry.get(id);
    if (!center || !reg) return;
    moveTo(center, fitDistance(reg.size.length() / 2) * 1.15);
  };

  useFrame((_, delta) => {
    const f = runtime.current.frame.focus;
    if (f && f.key !== lastFocusKey.current) {
      lastFocusKey.current = f.key;
      focusOn(f.target);
    } else if (!f) {
      lastFocusKey.current = null;
    }
    const c = controls.current;
    if (c) {
      const near = nearestAllowed();
      if (c.minDistance !== near) c.minDistance = near;
    }
    const tw = tween.current;
    if (!tw || !c) return;
    // after an idle gap (on-demand rendering) the first delta is huge; don't skip the tween
    const dt = Math.min(delta, 1 / 30);
    tw.t = tw.duration === 0 ? 1 : Math.min(tw.t + dt / tw.duration, 1);
    const k = 1 - (1 - tw.t) ** 3;
    cam.position.lerpVectors(tw.fromPos, tw.toPos, k);
    c.target.lerpVectors(tw.fromTarget, tw.toTarget, k);
    c.update();
    if (tw.t >= 1) tween.current = null;
    else invalidate();
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      enableRotate={controlsAllowed.has("rotate")}
      enableZoom={controlsAllowed.has("zoom")}
      enablePan={controlsAllowed.has("pan")}
      // wheel zoom heads for the part under the pointer, not the orbit centre
      zoomToCursor
      minDistance={minD}
      maxDistance={maxD * 2.5}
      onStart={() => {
        tween.current = null;
      }}
    />
  );
}

// ------------------------------------------------------------------------ labels

function Labels({
  scene,
  runtime,
  canSelect,
  onSelect,
}: {
  scene: ResolvedScene;
  runtime: RefObject<ViewerRuntime>;
  canSelect: (id: string) => boolean;
  onSelect: (id: string) => void;
}) {
  // Plain DOM labels in one overlay, positioned every frame. Not drei <Html>: that creates a
  // separate React root per label and tears it down mid-render, which under React 19
  // (StrictMode re-runs effects) throws "NotFoundError" / "synchronously unmount a root" and
  // can blank the page when parts or scenes change.
  const registered = scene.components.filter((c) => runtime.current.registry.get(c.componentId));
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const els = useRef<Record<string, HTMLDivElement>>({});
  const tmp = useMemo(() => new THREE.Vector3(), []);
  const latest = useRef({ canSelect, onSelect });
  latest.current = { canSelect, onSelect };
  const signature = registered.map((c) => `${c.componentId}\u0000${c.label}`).join("\u0001");

  useEffect(() => {
    const host = gl.domElement.parentElement;
    if (!host) return;
    const layer = document.createElement("div");
    layer.style.cssText = "position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:20;";
    const made: Record<string, HTMLDivElement> = {};
    for (const c of registered) {
      const id = c.componentId;
      // a dot on the part, a leader line, and the label pushed out to the side (see useFrame)
      const wrap = document.createElement("div");
      wrap.className = "group";
      wrap.style.cssText = "position:absolute;left:0;top:0;display:none;";
      wrap.dataset.state = "off";
      const line = document.createElement("span");
      line.className = "absolute left-0 top-0 h-px origin-left bg-slate-600/70 group-data-[state=on]:bg-amber-500";
      line.setAttribute("aria-hidden", "true");
      line.style.willChange = "transform";
      const dot = document.createElement("span");
      dot.className = "absolute left-0 top-0 size-1.5 rounded-full border border-white bg-slate-700 group-data-[state=on]:bg-amber-500";
      dot.setAttribute("aria-hidden", "true");
      dot.style.willChange = "transform";
      const button = document.createElement("button");
      button.type = "button";
      button.className =
        "pointer-events-auto absolute left-0 top-0 whitespace-nowrap rounded-md border border-slate-300/80 bg-white/92 px-2 py-0.5 text-xs font-medium shadow-sm backdrop-blur-sm transition-colors hover:border-[#38b2ac] hover:bg-white focus-visible:outline-2 focus-visible:outline-accent group-data-[state=on]:border-amber-400 group-data-[state=on]:bg-amber-400";
      button.style.willChange = "transform";
      button.addEventListener("click", () => {
        if (latest.current.canSelect(id)) latest.current.onSelect(id);
      });
      const text = document.createElement("span");
      text.className = "text-slate-900 group-data-[state=on]:text-navy-950";
      text.textContent = c.label;
      button.appendChild(text);
      wrap.append(line, dot, button);
      layer.appendChild(wrap);
      made[id] = wrap;
    }
    host.appendChild(layer);
    els.current = made;
    // on-demand rendering: draw a few frames so the new labels get placed
    let frames = 0;
    let raf = 0;
    const tick = () => {
      invalidate();
      if (++frames < 30) raf = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(raf);
      layer.remove(); // safe even if the canvas wrapper is already gone
      els.current = {};
    };
  }, [gl, signature, invalidate]); // eslint-disable-line react-hooks/exhaustive-deps

  // Label sizes (they don't change), measured once each, for placement and the overlap check.
  const sizes = useRef<Record<string, { w: number; h: number }>>({});

  useFrame(() => {
    const rt = runtime.current;
    const anim = rt.frame;
    // labels are pushed away from the model's centre on screen, so they sit beside the parts
    const mid = explodedBounds(rt.bounds, rt.offsets, rt.explode).center;
    tmp.set(...mid).project(camera);
    const centre = { x: (tmp.x * 0.5 + 0.5) * size.width, y: (-tmp.y * 0.5 + 0.5) * size.height };
    const placed: { id: string; el: HTMLDivElement; ax: number; ay: number; depth: number; emphasised: boolean }[] = [];
    for (const c of registered) {
      const id = c.componentId;
      const el = els.current[id];
      if (!el) continue;
      const pos = rt.registry.labelPosition(id, tmp);
      const show =
        !!pos &&
        rt.showLabels &&
        rt.registry.isVisible(id) &&
        (anim.components[id]?.opacity ?? 1) > 0.15 &&
        (!rt.isolated || rt.isolated === id); // focus mode: only the focused part's label
      const emphasised =
        rt.selected === id || anim.highlight === id || anim.annotation?.target === id;
      const state = emphasised ? "on" : "off";
      if (el.dataset.state !== state) el.dataset.state = state;
      const button = el.lastElementChild as HTMLButtonElement | null;
      const tab = latest.current.canSelect(id) ? 0 : -1;
      if (button && button.tabIndex !== tab) button.tabIndex = tab;
      if (pos && show) {
        pos.project(camera);
        if (pos.z < 1) {
          // not behind the camera
          const ax = (pos.x * 0.5 + 0.5) * size.width;
          const ay = (-pos.y * 0.5 + 0.5) * size.height;
          placed.push({ id, el, ax, ay, depth: pos.z, emphasised });
          continue;
        }
      }
      if (el.style.display !== "none") el.style.display = "none";
    }

    // Overlapping labels are unreadable: keep the emphasised one, then the nearest parts, and hide
    // a label that would cover one already shown. Hidden parts stay in the parts list, and their
    // labels come back as the view zooms in and they spread apart.
    placed.sort((a, b) => Number(b.emphasised) - Number(a.emphasised) || a.depth - b.depth);
    const boxes: { l: number; r: number; t: number; b: number }[] = [];
    for (const p of placed) {
      let m = sizes.current[p.id];
      if (!m) {
        if (p.el.style.display === "none") p.el.style.display = "";
        const button = p.el.lastElementChild as HTMLElement | null;
        m = { w: button?.offsetWidth ?? 0, h: button?.offsetHeight ?? 0 };
        if (m.w && m.h) sizes.current[p.id] = m;
      }
      const half = { w: (m.w || 80) / 2, h: (m.h || 20) / 2 };
      const at = labelSpot(p.ax, p.ay, centre, size, half);
      const box = { l: at.x - half.w - 2, r: at.x + half.w + 2, t: at.y - half.h - 2, b: at.y + half.h + 2 };
      const clash = boxes.some((o) => box.l < o.r && box.r > o.l && box.t < o.b && box.b > o.t);
      const display = clash && !p.emphasised ? "none" : "";
      if (p.el.style.display !== display) p.el.style.display = display;
      if (display) continue;
      boxes.push(box);
      placeLabel(p.el, p.ax, p.ay, at);
    }
  });

  return null;
}

function placeLabel(el: HTMLDivElement, ax: number, ay: number, at: { x: number; y: number }): void {
  const [line, dot, button] = el.children as unknown as [HTMLElement, HTMLElement, HTMLElement];
  button.style.transform = `translate3d(${at.x.toFixed(1)}px,${at.y.toFixed(1)}px,0) translate(-50%,-50%)`;
  dot.style.transform = `translate3d(${ax.toFixed(1)}px,${ay.toFixed(1)}px,0) translate(-50%,-50%)`;
  const dx = at.x - ax;
  const dy = at.y - ay;
  line.style.width = `${Math.hypot(dx, dy).toFixed(1)}px`;
  line.style.transform = `translate3d(${ax.toFixed(1)}px,${ay.toFixed(1)}px,0) rotate(${Math.atan2(dy, dx).toFixed(4)}rad)`;
}

// ------------------------------------------------------------------- flow particles

const PARTICLES = 28;

function FlowParticles({ runtime }: { runtime: RefObject<ViewerRuntime> }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const [pathId, setPathId] = useState<string | null>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const clock = useRef(0);
  const curves = useMemo(() => {
    const out: Record<string, THREE.CatmullRomCurve3> = {};
    for (const [id, pts] of Object.entries(runtime.current.paths)) {
      if (pts.length >= 2) out[id] = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
    }
    return out;
  }, [runtime]);
  const size = useMemo(() => {
    const b = explodedBounds(runtime.current.bounds, {}, 0);
    return b.radius * 0.03;
  }, [runtime]);

  useFrame((_, delta) => {
    const rt = runtime.current;
    const flow = rt.frame.flow;
    const id = flow && curves[flow.pathId] ? flow.pathId : null;
    if (id !== pathId) setPathId(id);
    const m = mesh.current;
    const curve = id ? curves[id] : undefined;
    if (!m || !curve) return;
    if (!rt.reducedMotion) clock.current += delta * 0.18;
    for (let i = 0; i < PARTICLES; i++) {
      const t = (i / PARTICLES + clock.current) % 1;
      curve.getPointAt(t, dummy.position);
      dummy.scale.setScalar(rt.reducedMotion ? 0.8 : 0.6 + 0.4 * Math.sin(t * Math.PI));
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });

  const curve = pathId ? curves[pathId] : undefined;
  if (!curve) return null;
  return (
    <>
      <Line points={curve.getPoints(120)} color="#fcd34d" lineWidth={1.5} transparent opacity={0.45} />
      <instancedMesh ref={mesh} args={[undefined, undefined, PARTICLES]} raycast={() => null}>
        <sphereGeometry args={[size, 12, 8]} />
        <meshBasicMaterial color="#fde68a" toneMapped={false} />
      </instancedMesh>
    </>
  );
}
