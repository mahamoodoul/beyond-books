import { Html, Line, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, type ComponentRef, type RefObject } from "react";
import * as THREE from "three";

import { deriveFrame } from "@/features/three-d/library/runtime/animation";
import { loadGlb } from "@/features/three-d/library/runtime/assetLoader";
import { computeExplodeOffsets, explodedBounds } from "@/features/three-d/library/runtime/explode";
import { buildProcedural, type ProceduralInstance } from "@/features/three-d/library/runtime/procedural";
import { disposeObject3D } from "@/features/three-d/library/runtime/resourceDisposer";
import type { ResolvedScene, Vec3 } from "@/features/three-d/library/runtime/types";
import type { ViewerRuntime } from "@/features/three-d/library/runtime/viewerRuntime";

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
}

export function SceneCanvas(props: SceneCanvasProps) {
  return (
    <Canvas
      className="touch-none"
      dpr={[1, 2]}
      camera={{ fov: 40, near: 0.05, far: 2000, position: [6, 4, 6] }}
      gl={{ antialias: true, preserveDrawingBuffer: false }}
      onPointerMissed={() => props.onSelect(null)}
    >
      <color attach="background" args={["#0b1630"]} />
      <hemisphereLight args={["#e8f0ff", "#1c2540", 1.1]} />
      <directionalLight position={[6, 10, 8]} intensity={2.2} />
      <directionalLight position={[-8, 3, -6]} intensity={0.7} color="#bcd0ff" />
      <SceneContent {...props} />
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
        setRoots(built);
        onReady({ missing });
      } catch (err) {
        if (!ctrl.signal.aborted) {
          onError(err instanceof Error ? err.message : "Could not load the 3D model.");
        }
      }
    })();
    return () => {
      ctrl.abort();
      built.forEach(disposeObject3D);
      runtime.current.registry.dispose();
      procedural.current = [];
    };
  }, [scene]);

  // ---- per-frame: timeline, explode easing, visual state
  const time = useRef(0);
  useFrame((_, delta) => {
    const rt = runtime.current;
    const dt = Math.min(delta, 0.1);
    time.current += dt;
    if (rt.runner && rt.runner.tick(dt * 1000)) onAnimationTick?.();
    const goal = rt.explodeTarget;
    rt.explode = rt.reducedMotion
      ? goal
      : THREE.MathUtils.damp(rt.explode, goal, 5, dt);
    if (Math.abs(rt.explode - goal) < 1e-4) rt.explode = goal;
    rt.frame = rt.runner
      ? deriveFrame(rt.runner.steps, rt.runner.position, rt.paths, rt.reducedMotion)
      : rt.frame;
    rt.registry.apply({
      explode: rt.explode,
      offsets: rt.offsets,
      frame: rt.frame,
      hidden: rt.hidden,
      selected: rt.selected,
      hovered: rt.hovered,
      timeSeconds: time.current,
      reducedMotion: rt.reducedMotion,
    });
    if (!rt.reducedMotion) for (const p of procedural.current) p.update?.(dt);
  });

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    const id = runtime.current.registry.idFor(e.object);
    if (id && canSelect(id)) {
      e.stopPropagation();
      onSelect(id);
    }
  };
  const handleMove = (e: ThreeEvent<PointerEvent>) => {
    const id = runtime.current.registry.idFor(e.object);
    const selectable = id && canSelect(id) ? id : null;
    if (runtime.current.hovered !== selectable) {
      runtime.current.hovered = selectable;
      gl.domElement.style.cursor = selectable ? "pointer" : "";
    }
    if (selectable) e.stopPropagation();
  };
  const handleOut = () => {
    runtime.current.hovered = null;
    gl.domElement.style.cursor = "";
  };

  if (!roots) {
    return (
      <Html center>
        <p className="whitespace-nowrap rounded-md bg-white/90 px-3 py-2 text-sm text-slate-700">
          Loading 3D model…
        </p>
      </Html>
    );
  }
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

// ------------------------------------------------------------------------ camera

const PRESET_DIRECTIONS: Record<string, Vec3> = {
  front: [0, 0.15, 1],
  side: [1, 0.15, 0],
  top: [0, 1, 0.02],
  three_quarter: [1, 0.7, 1],
};

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
  const tween = useRef<Tween | null>(null);
  const lastFocusKey = useRef<number | null>(null);
  const spec = scene.spec.camera ?? {};
  const minD = spec.min_distance ?? 1;
  const maxD = spec.max_distance ?? 20;
  const controlsAllowed = new Set(scene.spec.controls ?? ["rotate", "zoom"]);

  const moveTo = (target: THREE.Vector3, distance: number, dir?: THREE.Vector3) => {
    const c = controls.current;
    const from = c ? c.target.clone() : new THREE.Vector3();
    const d = dir ?? cam.position.clone().sub(from).normalize();
    const dist = THREE.MathUtils.clamp(distance, minD, maxD);
    const toPos = target.clone().addScaledVector(d, dist);
    tween.current = {
      fromPos: cam.position.clone(),
      toPos,
      fromTarget: from,
      toTarget: target.clone(),
      t: 0,
      duration: runtime.current.reducedMotion ? 0 : 0.9,
    };
  };

  const fitDistance = (radius: number) => {
    const half = THREE.MathUtils.degToRad(cam.fov / 2);
    const aspect = Math.max(cam.aspect, 0.5);
    return (radius / Math.sin(Math.min(half, Math.atan(Math.tan(half) * aspect)))) * 1.05;
  };

  const fit = (usePreset: boolean) => {
    const rt = runtime.current;
    const b = explodedBounds(rt.bounds, rt.offsets, rt.explodeTarget);
    const dir = usePreset
      ? new THREE.Vector3(...(PRESET_DIRECTIONS[spec.preset ?? "three_quarter"] ?? [1, 0.7, 1]))
          .normalize()
      : undefined;
    moveTo(new THREE.Vector3(...b.center), fitDistance(b.radius), dir);
  };

  // first fit uses the scene's camera preset and jumps there
  useEffect(() => {
    fit(true);
    if (tween.current) tween.current.duration = 0;
  }, []);

  useEffect(() => {
    if (command.key === 0) return;
    if (command.kind === "fit") fit(false);
    else focusOn(command.componentId);
  }, [command]);

  const focusOn = (id: string) => {
    const rt = runtime.current;
    const center = rt.registry.worldCenter(id);
    const reg = rt.registry.get(id);
    if (!center || !reg) return;
    moveTo(center, Math.max(fitDistance(reg.size.length() / 2) * 1.2, minD));
  };

  useFrame((_, delta) => {
    const f = runtime.current.frame.focus;
    if (f && f.key !== lastFocusKey.current) {
      lastFocusKey.current = f.key;
      focusOn(f.target);
    } else if (!f) {
      lastFocusKey.current = null;
    }
    const tw = tween.current;
    const c = controls.current;
    if (!tw || !c) return;
    tw.t = tw.duration === 0 ? 1 : Math.min(tw.t + delta / tw.duration, 1);
    const k = 1 - (1 - tw.t) ** 3;
    cam.position.lerpVectors(tw.fromPos, tw.toPos, k);
    c.target.lerpVectors(tw.fromTarget, tw.toTarget, k);
    c.update();
    if (tw.t >= 1) tween.current = null;
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      enableRotate={controlsAllowed.has("rotate")}
      enableZoom={controlsAllowed.has("zoom")}
      enablePan={controlsAllowed.has("pan")}
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
  const registered = scene.components.filter((c) => runtime.current.registry.get(c.componentId));
  const groups = useRef<Record<string, THREE.Group | null>>({});
  const doms = useRef<Record<string, HTMLDivElement | null>>({});
  const tmp = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    const rt = runtime.current;
    const anim = rt.frame;
    for (const c of registered) {
      const id = c.componentId;
      const g = groups.current[id];
      const el = doms.current[id];
      if (!g || !el) continue;
      const pos = rt.registry.labelPosition(id, tmp);
      if (pos) g.position.copy(pos);
      const show =
        rt.showLabels && rt.registry.isVisible(id) && (anim.components[id]?.opacity ?? 1) > 0.15;
      const display = show ? "" : "none";
      if (el.style.display !== display) el.style.display = display;
      const emphasised =
        rt.selected === id || anim.highlight === id || anim.annotation?.target === id;
      const state = emphasised ? "on" : "off";
      if (el.dataset.state !== state) el.dataset.state = state;
    }
  });

  return (
    <>
      {registered.map((c) => (
        <group
          key={c.componentId}
          ref={(g) => {
            groups.current[c.componentId] = g;
          }}
        >
          <Html center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
            <div
              ref={(el) => {
                doms.current[c.componentId] = el;
              }}
              data-state="off"
              className="group flex -translate-y-3 flex-col items-center"
            >
              <button
                type="button"
                tabIndex={canSelect(c.componentId) ? 0 : -1}
                onClick={() => canSelect(c.componentId) && onSelect(c.componentId)}
                className="pointer-events-auto whitespace-nowrap rounded-md border border-white/15 bg-navy-950/80 px-2 py-0.5 text-xs font-medium text-white shadow-sm backdrop-blur-sm transition-colors hover:bg-navy-700 focus-visible:outline-2 focus-visible:outline-accent group-data-[state=on]:border-amber-300 group-data-[state=on]:bg-amber-400 group-data-[state=on]:text-navy-950"
              >
                {c.label}
              </button>
              <span className="h-3 w-px bg-white/60" aria-hidden />
              <span className="size-1.5 rounded-full bg-white" aria-hidden />
            </div>
          </Html>
        </group>
      ))}
    </>
  );
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
