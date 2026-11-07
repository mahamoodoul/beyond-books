import { Html, OrbitControls, useGLTF } from "@react-three/drei";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, type ReactNode, type RefObject } from "react";
import type { Group, Object3D } from "three";

import type { ResolvedAsset, SceneComponent, SceneSpec } from "@/api/generated/schema";

import { componentFor, disposeTree, isolateMaterials, setHighlight } from "../runtime/interaction";
import { GENERATORS } from "../runtime/procedural";

const PRESETS: Record<string, [number, number, number]> = {
  front: [0, 0, 1],
  side: [1, 0, 0],
  top: [0, 1, 0.001],
  three_quarter: [0.7, 0.45, 0.7],
};

function AssetModel({ asset, onLoaded }: { asset: ResolvedAsset; onLoaded: (names: string[]) => void }) {
  const { scene } = useGLTF(asset.url);
  const clone = useMemo(() => {
    const c = scene.clone(true);
    isolateMaterials(c);
    return c;
  }, [scene]);
  useEffect(() => {
    const names: string[] = [];
    clone.traverse((o) => o.name && names.push(o.name));
    onLoaded(names);
    return () => {
      disposeTree(clone);
      useGLTF.clear(asset.url);
    };
  }, [clone, asset.url, onLoaded]);
  return <primitive object={clone} />;
}

export interface SceneCanvasProps {
  spec: SceneSpec;
  assets: ResolvedAsset[];
  selected: SceneComponent | null;
  onSelect: (c: SceneComponent | null) => void;
  onMeshesLoaded: (names: string[]) => void;
  reducedMotion: boolean;
  /** Extra content rendered inside the canvas with access to the scene root (e.g. animations). */
  overlay?: (root: RefObject<Group | null>) => ReactNode;
}

export function SceneCanvas({ spec, assets, selected, onSelect, onMeshesLoaded, reducedMotion, overlay }: SceneCanvasProps) {
  const root = useRef<Group>(null);
  const byMesh = useMemo(
    () => new Map((spec.components ?? []).map((c) => [c.mesh_name, c] as const)),
    [spec.components],
  );
  const controls = new Set(spec.controls ?? ["rotate", "zoom"]);
  const cam = spec.camera ?? { preset: "three_quarter", min_distance: 1, max_distance: 20 };
  const minD = cam.min_distance ?? 1;
  const maxD = cam.max_distance ?? 20;
  const dir = PRESETS[cam.preset ?? "three_quarter"] ?? PRESETS.three_quarter!;
  const start = Math.min(maxD, Math.max(minD, (minD + maxD) / 2));
  const len = Math.hypot(...dir);
  const position = dir.map((v) => (v / len) * start) as [number, number, number];

  // Highlight the selected component's object(s).
  useEffect(() => {
    if (!root.current || !selected) return;
    const hits: Object3D[] = [];
    root.current.traverse((o) => o.name === selected.mesh_name && hits.push(o));
    hits.forEach((h) => setHighlight(h, true));
    return () => hits.forEach((h) => setHighlight(h, false));
  }, [selected, assets]);

  const click = (e: ThreeEvent<MouseEvent>) => {
    if (!controls.has("select_component")) return;
    e.stopPropagation();
    onSelect(componentFor(e.object, byMesh));
  };

  const content: ReactNode = (
    <>
      {assets.map((a) => (
        <AssetModel key={`${a.asset_id}@${a.version}`} asset={a} onLoaded={onMeshesLoaded} />
      ))}
      {(spec.procedural ?? []).map((p, i) => {
        const Gen = GENERATORS[p.generator];
        return Gen ? <Gen key={i} params={p.params ?? {}} animate={!reducedMotion} /> : null;
      })}
    </>
  );

  return (
    <Canvas
      camera={{ position, fov: 45, near: 0.05, far: 500 }}
      dpr={[1, 2]}
      onPointerMissed={() => onSelect(null)}
      aria-label={`3D scene: ${spec.title}`}
    >
      <color attach="background" args={["#0b1630"]} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 8, 5]} intensity={1.3} />
      <directionalLight position={[-6, -3, -4]} intensity={0.4} />
      <Suspense fallback={<Html center><span className="text-sm text-white">Loading model…</span></Html>}>
        <group ref={root} onClick={click}>
          {content}
        </group>
        {overlay?.(root)}
      </Suspense>
      <OrbitControls
        makeDefault
        enableRotate={controls.has("rotate")}
        enableZoom={controls.has("zoom")}
        enablePan={controls.has("pan")}
        minDistance={minD}
        maxDistance={maxD}
        enableDamping={!reducedMotion}
      />
    </Canvas>
  );
}
