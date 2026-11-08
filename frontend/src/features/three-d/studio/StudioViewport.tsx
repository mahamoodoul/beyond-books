/**
 * Immersive viewport for the teacher 3D Studio: the app's SceneCanvas plus hotspots on every
 * part, a callout for the selected part, X-ray mode, zoom and a guided tour (scene animation).
 * Lazy-loaded (three.js lives in its own chunk).
 */
import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Box3, Mesh, Vector3, type Group, type Material, type Object3D } from "three";

import type { ResolvedScene, SceneComponent } from "@/api/generated/schema";

import { SceneCanvas } from "../components/SceneCanvas";
import { STUDIO_BACKDROP } from "../library/runtime/quality";
import { AnimationLayer, type AnimationClock } from "../runtime/AnimationLayer";

interface Props {
  resolved: ResolvedScene;
  selected: SceneComponent | null;
  onSelect: (c: SceneComponent | null) => void;
  xray: boolean;
  zoom: number;
  tourStep: number | null;
  tourPlaying: boolean;
  onTourStepComplete: () => void;
  resetKey: number;
}

const tmp = new Vector3();

function Hotspots({ root, components, selected, onSelect }: {
  root: RefObject<Group | null>;
  components: SceneComponent[];
  selected: SceneComponent | null;
  onSelect: (c: SceneComponent) => void;
}) {
  const anchors = useRef<(Group | null)[]>([]);
  const [found, setFound] = useState<Set<string>>(new Set());
  const box = useMemo(() => new Box3(), []);

  useFrame(() => {
    if (!root.current) return;
    const seen = new Set<string>();
    components.forEach((c, i) => {
      let target: Object3D | undefined;
      root.current!.traverse((o) => {
        if (!target && o.name === c.mesh_name) target = o;
      });
      const a = anchors.current[i];
      if (target && a) {
        box.setFromObject(target).getCenter(tmp);
        a.position.copy(tmp);
        seen.add(c.component_id);
      }
    });
    if (seen.size !== found.size) setFound(seen);
  });

  return (
    <>
      {components.map((c, i) => {
        const active = selected?.component_id === c.component_id;
        return (
          <group key={c.component_id} ref={(g) => { anchors.current[i] = g; }}>
            {found.has(c.component_id) && (
              <Html center zIndexRange={[20, 0]}>
                <div className="pointer-events-auto relative">
                  <button
                    aria-label={c.label}
                    title={c.label}
                    onClick={(e) => { e.stopPropagation(); onSelect(c); }}
                    className={`block rounded-full border-2 transition ${active
                      ? "h-5 w-5 border-white bg-[#38b2ac] shadow-[0_0_0_6px_rgba(56,178,172,0.35)]"
                      : "h-3.5 w-3.5 border-white bg-teal-600/80 shadow hover:scale-125 hover:bg-teal-600"}`}
                  />
                  {active && (
                    <div className="absolute left-7 top-1/2 flex -translate-y-1/2 items-center">
                      <span className="h-px w-10 bg-[#38b2ac]" />
                      <span className="whitespace-nowrap rounded-lg border border-[#38b2ac] bg-white/95 shadow-sm px-3 py-1.5 text-sm font-semibold text-slate-900 shadow-lg backdrop-blur">
                        {c.label}
                      </span>
                    </div>
                  )}
                </div>
              </Html>
            )}
          </group>
        );
      })}
    </>
  );
}

function XrayAndZoom({ root, xray, selected, zoom }: {
  root: RefObject<Group | null>;
  xray: boolean;
  selected: SceneComponent | null;
  zoom: number;
}) {
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    camera.zoom = zoom;
    camera.updateProjectionMatrix();
  }, [camera, zoom]);

  useFrame(() => {
    root.current?.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh) return;
      let inSelected = false;
      for (let p: Object3D | null = m; p; p = p.parent) if (selected && p.name === selected.mesh_name) inSelected = true;
      const mats: Material[] = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats) {
        const base = (mat.userData.baseOpacity ??= mat.opacity) as number;
        const baseT = (mat.userData.baseTransparent ??= mat.transparent) as boolean;
        const target = xray && !inSelected ? Math.min(base, 0.18) : base;
        if (mat.opacity !== target) {
          mat.opacity = target;
          mat.transparent = target < 1 || baseT;
          mat.depthWrite = target >= 1;
          mat.needsUpdate = true;
        }
      }
    });
  });
  return null;
}

export default function StudioViewport(p: Props) {
  const clock = useRef<AnimationClock>({ elapsed: 0 });
  const animation = p.resolved.animations?.[0];
  const components = p.resolved.spec.components ?? [];
  return (
    <SceneCanvas
      key={p.resetKey}
      spec={p.resolved.spec}
      assets={p.resolved.assets}
      selected={p.selected}
      onSelect={p.onSelect}
      onMeshesLoaded={() => {}}
      reducedMotion={false}
      background={STUDIO_BACKDROP}
      overlay={(root) => (
        <>
          <Hotspots root={root} components={components} selected={p.selected} onSelect={p.onSelect} />
          <XrayAndZoom root={root} xray={p.xray} selected={p.selected} zoom={p.zoom} />
          {animation && p.tourStep !== null && (
            <AnimationLayer
              root={root}
              scene={p.resolved.spec}
              animation={animation}
              index={p.tourStep}
              playing={p.tourPlaying}
              clock={clock}
              reducedMotion={false}
              onStepComplete={p.onTourStepComplete}
            />
          )}
        </>
      )}
    />
  );
}
