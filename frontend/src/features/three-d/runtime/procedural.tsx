/**
 * Trusted procedural generators (design §7.1-A). Must mirror backend
 * app/modules/three_d/procedural.py: same generator names, params and mesh names.
 * Every selectable part is a mesh whose `name` equals the component mesh_name.
 */
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group } from "three";

type Params = Record<string, unknown>;
const num = (v: unknown, d: number) => (typeof v === "number" ? v : d);

const PLANETS = [
  { name: "mercury", r: 0.18, d: 2.2, c: "#a39e93", speed: 1.6 },
  { name: "venus", r: 0.3, d: 3.1, c: "#d9b77a", speed: 1.2 },
  { name: "earth", r: 0.32, d: 4.1, c: "#3d7bd9", speed: 1.0 },
  { name: "mars", r: 0.24, d: 5.0, c: "#c1563a", speed: 0.8 },
  { name: "jupiter", r: 0.7, d: 6.6, c: "#d2a679", speed: 0.45 },
  { name: "saturn", r: 0.6, d: 8.2, c: "#e3cf96", speed: 0.35 },
  { name: "uranus", r: 0.45, d: 9.5, c: "#8fd3e0", speed: 0.25 },
  { name: "neptune", r: 0.44, d: 10.7, c: "#4a68d9", speed: 0.2 },
];

function Orbit({ radius }: { radius: number }) {
  return (
    <mesh rotation-x={-Math.PI / 2} raycast={() => null}>
      <ringGeometry args={[radius - 0.01, radius + 0.01, 128]} />
      <meshBasicMaterial color="#94a3b8" transparent opacity={0.35} />
    </mesh>
  );
}

function SolarSystem({ params, animate }: { params: Params; animate: boolean }) {
  const count = Math.min(8, Math.max(1, num(params.planet_count, 4)));
  const showOrbits = params.show_orbits !== false;
  const refs = useRef<(Group | null)[]>([]);
  useFrame((_, dt) => {
    if (!animate) return;
    refs.current.forEach((g, i) => {
      if (g) g.rotation.y += dt * 0.2 * (PLANETS[i]?.speed ?? 1);
    });
  });
  return (
    <group>
      <mesh name="sun">
        <sphereGeometry args={[1.2, 48, 32]} />
        <meshStandardMaterial color="#f6c445" emissive="#f59e0b" emissiveIntensity={0.6} />
      </mesh>
      {PLANETS.slice(0, count).map((p, i) => (
        <group key={p.name}>
          {showOrbits && <Orbit radius={p.d} />}
          <group ref={(g) => { refs.current[i] = g; }} rotation-y={i * 0.9}>
            <mesh name={p.name} position={[p.d, 0, 0]}>
              <sphereGeometry args={[p.r, 32, 24]} />
              <meshStandardMaterial color={p.c} />
            </mesh>
          </group>
        </group>
      ))}
    </group>
  );
}

function Atom({ params, animate }: { params: Params; animate: boolean }) {
  const n = Math.min(12, Math.max(1, num(params.electron_count, 3)));
  const ref = useRef<Group>(null);
  useFrame((_, dt) => {
    if (animate && ref.current) ref.current.rotation.y += dt * 0.6;
  });
  return (
    <group ref={ref}>
      <mesh name="nucleus">
        <sphereGeometry args={[0.6, 40, 28]} />
        <meshStandardMaterial color="#dc2626" />
      </mesh>
      {Array.from({ length: n }, (_, i) => {
        const shell = 1.6 + Math.floor(i / 2) * 0.9;
        const angle = (i % 2) * Math.PI + i * 0.4;
        return (
          <group key={i} rotation-z={i * 0.5}>
            <Orbit radius={shell} />
            <mesh name={`electron_${i + 1}`} position={[Math.cos(angle) * shell, 0, Math.sin(angle) * shell]}>
              <sphereGeometry args={[0.15, 20, 14]} />
              <meshStandardMaterial color="#2563eb" />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

function GeometrySolids() {
  const mat = (c: string) => <meshStandardMaterial color={c} />;
  return (
    <group position={[-4, 0, 0]}>
      <mesh name="cube" position={[0, 0, 0]}><boxGeometry args={[1.2, 1.2, 1.2]} />{mat("#2563eb")}</mesh>
      <mesh name="sphere" position={[2, 0, 0]}><sphereGeometry args={[0.7, 40, 28]} />{mat("#16a34a")}</mesh>
      <mesh name="cylinder" position={[4, 0, 0]}><cylinderGeometry args={[0.6, 0.6, 1.4, 40]} />{mat("#ea580c")}</mesh>
      <mesh name="cone" position={[6, 0, 0]}><coneGeometry args={[0.7, 1.4, 40]} />{mat("#9333ea")}</mesh>
      <mesh name="tetrahedron" position={[8, 0, 0]}><tetrahedronGeometry args={[0.85]} />{mat("#dc2626")}</mesh>
    </group>
  );
}

export const GENERATORS: Record<string, (p: { params: Params; animate: boolean }) => React.ReactNode> = {
  solar_system: SolarSystem,
  atom: Atom,
  geometry_solids: () => <GeometrySolids />,
};
