/**
 * Executes a validated AnimationSpec inside the R3F canvas (design §7.6).
 *
 * Every frame: restore the baseline of all objects the animation touches, then re-apply steps
 * 0..index (completed steps fully, the current step by progress). Stepping backwards, restarting
 * and unmounting therefore always leave the scene consistent. Only allowlisted actions exist;
 * nothing from the spec is ever executed as code.
 */
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type MutableRefObject, type RefObject } from "react";
import { Box3, Color, Euler, Material, Mesh, MeshStandardMaterial, Object3D, Vector3, type Group } from "three";

import type { AnimationSpec, SceneSpec } from "@/api/generated/schema";

type Step = AnimationSpec["steps"][number];
interface Baseline {
  visible: boolean;
  rotation: Euler;
  mats: { mat: Material; opacity: number; transparent: boolean; emissive?: Color; ei?: number }[];
}

export interface AnimationClock {
  elapsed: number;
}

const HL = new Color("#facc15");
const target = (s: Step): string | undefined => ("target_component" in s ? (s.target_component ?? undefined) : undefined);

function materials(o: Object3D): Material[] {
  const out: Material[] = [];
  o.traverse((x) => {
    const m = x as Mesh;
    if (m.isMesh) out.push(...(Array.isArray(m.material) ? m.material : [m.material]));
  });
  return out;
}

function pointOnPath(points: number[][], t: number, out: Vector3): Vector3 {
  const v = points.map((p) => new Vector3(p[0], p[1], p[2]));
  const lens = v.slice(1).map((p, i) => p.distanceTo(v[i]!));
  const total = lens.reduce((a, b) => a + b, 0) || 1;
  let d = Math.max(0, Math.min(1, t)) * total;
  for (let i = 0; i < lens.length; i++) {
    if (d <= lens[i]! || i === lens.length - 1) return out.copy(v[i]!).lerp(v[i + 1]!, Math.min(1, d / (lens[i]! || 1)));
    d -= lens[i]!;
  }
  return out.copy(v[v.length - 1]!);
}

const PARTICLES = 14;

export function AnimationLayer({
  root,
  scene,
  animation,
  index,
  playing,
  clock,
  reducedMotion,
  onStepComplete,
}: {
  root: RefObject<Group | null>;
  scene: SceneSpec;
  animation: AnimationSpec;
  index: number;
  playing: boolean;
  clock: MutableRefObject<AnimationClock>;
  reducedMotion: boolean;
  onStepComplete: () => void;
}) {
  const controls = useThree((s) => s.controls) as unknown as { target: Vector3; update: () => void } | null;
  const meshByComponent = useMemo(
    () => new Map((scene.components ?? []).map((c) => [c.component_id, c.mesh_name] as const)),
    [scene.components],
  );
  const baselines = useRef(new Map<Object3D, Baseline>());
  const marker = useRef<Mesh>(null);
  const particles = useRef<(Mesh | null)[]>([]);
  const tmp = useMemo(() => new Vector3(), []);
  const completedRef = useRef(-1);

  const objectsFor = (componentId: string | undefined): Object3D[] => {
    const mesh = componentId ? meshByComponent.get(componentId) : undefined;
    if (!mesh || !root.current) return [];
    const hits: Object3D[] = [];
    root.current.traverse((o) => o.name === mesh && hits.push(o));
    return hits;
  };

  const baseline = (o: Object3D): Baseline => {
    let b = baselines.current.get(o);
    if (!b) {
      b = {
        visible: o.visible,
        rotation: o.rotation.clone(),
        mats: materials(o).map((mat) => ({
          mat,
          opacity: mat.opacity,
          transparent: mat.transparent,
          emissive: mat instanceof MeshStandardMaterial ? mat.emissive.clone() : undefined,
          ei: mat instanceof MeshStandardMaterial ? mat.emissiveIntensity : undefined,
        })),
      };
      baselines.current.set(o, b);
    }
    return b;
  };

  const restore = () => {
    baselines.current.forEach((b, o) => {
      o.visible = b.visible;
      o.rotation.copy(b.rotation);
      b.mats.forEach((m) => {
        m.mat.opacity = m.opacity;
        m.mat.transparent = m.transparent;
        if (m.mat instanceof MeshStandardMaterial && m.emissive) {
          m.mat.emissive.copy(m.emissive);
          m.mat.emissiveIntensity = m.ei ?? 1;
        }
      });
    });
  };

  // Restore everything when the animation changes or the layer unmounts.
  useEffect(() => {
    clock.current.elapsed = 0;
    return () => {
      restore();
      baselines.current.clear();
    };
  }, [animation]);

  useEffect(() => {
    clock.current.elapsed = 0;
    completedRef.current = -1;
  }, [index, clock]);

  useFrame((_, dt) => {
    const steps = animation.steps;
    const current = steps[index];
    if (!current) return;
    if (playing) {
      clock.current.elapsed += dt * 1000;
      if (clock.current.elapsed >= current.duration_ms && completedRef.current !== index) {
        completedRef.current = index;
        onStepComplete();
      }
    }
    const progress = reducedMotion ? 1 : Math.min(1, clock.current.elapsed / Math.max(1, current.duration_ms));

    // Capture baselines for every object any step touches, then reset.
    steps.forEach((s) => objectsFor(target(s)).forEach(baseline));
    restore();

    steps.slice(0, index + 1).forEach((s, i) => {
      const p = i === index ? progress : 1;
      const objs = objectsFor(target(s));
      switch (s.action) {
        case "set_visibility":
          objs.forEach((o) => (o.visible = s.visible));
          break;
        case "set_opacity":
          objs.forEach((o) =>
            baseline(o).mats.forEach((m) => {
              m.mat.opacity = m.opacity + (s.opacity - m.opacity) * p;
              m.mat.transparent = m.mat.opacity < 1;
            }),
          );
          break;
        case "rotate_component":
          objs.forEach((o) => {
            o.rotation[s.axis] += ((s.degrees * Math.PI) / 180) * p;
          });
          break;
        case "highlight_component":
          if (i === index)
            objs.forEach((o) =>
              materials(o).forEach((m) => {
                if (m instanceof MeshStandardMaterial) {
                  m.emissive.copy(HL);
                  m.emissiveIntensity = 0.5;
                }
              }),
            );
          break;
        case "camera_focus":
          if (i === index && controls && objs[0]) {
            new Box3().setFromObject(objs[0]).getCenter(tmp);
            if (reducedMotion) controls.target.copy(tmp);
            else controls.target.lerp(tmp, Math.min(1, dt * 4));
            controls.update();
          }
          break;
        default:
          break;
      }
    });

    // Path-based visuals only exist during their own step.
    const path = "path_id" in current ? scene.paths?.[current.path_id] : undefined;
    if (marker.current) {
      marker.current.visible = current.action === "move_along_path" && !!path;
      if (marker.current.visible && path) pointOnPath(path, progress, marker.current.position);
    }
    particles.current.forEach((pm, k) => {
      if (!pm) return;
      pm.visible = current.action === "show_flow_particles" && !!path;
      if (pm.visible && path) {
        const t = reducedMotion ? k / PARTICLES : (k / PARTICLES + clock.current.elapsed / 2500) % 1;
        pointOnPath(path, t, pm.position);
      }
    });
  });

  return (
    <group>
      <mesh ref={marker} visible={false} raycast={() => null}>
        <sphereGeometry args={[0.09, 20, 14]} />
        <meshStandardMaterial color="#f97316" emissive="#f97316" emissiveIntensity={0.8} />
      </mesh>
      {Array.from({ length: PARTICLES }, (_, k) => (
        <mesh key={k} ref={(m) => { particles.current[k] = m; }} visible={false} raycast={() => null}>
          <sphereGeometry args={[0.045, 10, 8]} />
          <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.6} />
        </mesh>
      ))}
    </group>
  );
}
