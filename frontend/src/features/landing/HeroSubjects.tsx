import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { Icon } from "@/components/ui/Icon";

import {
  SPHERE_GRADIENTS,
  atomScene,
  cubeScene,
  globeScene,
  moleculeScene,
  planetScene,
  renderScene,
  type Scene,
} from "./turntable";

const CYCLE_MS = 7000;
const STILL_ANGLE = 0.55; // pose used when motion is reduced

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false,
  );
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    const on = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

/** True while the element is on screen, so off-screen animations stop. */
function useOnScreen<T extends Element>(): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setVisible(!!e?.isIntersecting), { threshold: 0.05 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, visible];
}

/** A scene from turntable.ts, turning on its vertical axis once every `period` seconds. */
function Turntable({ scene, period, running }: { scene: Scene; period: number; running: boolean }) {
  const g = useRef<SVGGElement>(null);
  const uid = useId().replace(/:/g, "");
  useEffect(() => {
    const el = g.current;
    if (!el) return;
    if (!running) {
      el.innerHTML = renderScene(scene, 0, STILL_ANGLE).replace(/url\(#g-/g, `url(#${uid}-`);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const frame = (now: number) => {
      const t = (now - start) / 1000;
      el.innerHTML = renderScene(scene, t, STILL_ANGLE + (t / period) * Math.PI * 2).replace(
        /url\(#g-/g,
        `url(#${uid}-`,
      );
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [scene, period, running, uid]);
  return (
    <svg className="turntable-svg" viewBox="0 0 360 360" aria-hidden="true">
      <defs>
        {Object.entries(SPHERE_GRADIENTS).map(([name, [hi, mid, lo]]) => (
          <radialGradient key={name} id={`${uid}-${name}`} cx="36%" cy="30%" r="72%">
            <stop offset="0" stopColor={hi} />
            <stop offset=".55" stopColor={mid} />
            <stop offset="1" stopColor={lo} />
          </radialGradient>
        ))}
      </defs>
      <g ref={g} />
    </svg>
  );
}

const HEART_PATH =
  "M180 321c-18-20-102-82-119-138-17-55 10-96 51-98 31-2 53 22 68 45 13-27 39-52 72-48 46 5 64 51 46 98-18 49-93 111-118 141Z";
const VESSELS: [string, "vessel" | "aorta"][] = [
  ["M157 135c-4-48 5-78 3-112", "vessel"],
  ["M205 133c5-52 15-74 39-96 15-13 34-8 43 2", "aorta"],
  ["M231 155c35-21 73-25 104-19", "vessel"],
  ["M133 174c-39-22-70-18-105-3", "aorta"],
];
// depth (px) of each stacked copy: stacking flat copies gives the heart real thickness, so it
// still reads as a solid object when it turns side-on
const BODY_Z = Array.from({ length: 17 }, (_, i) => -16 + i * 2);
const VESSEL_Z = [-26, -24, -22, -20, -18];

/** The landing heart, extruded into a solid so it turns in real 3D on its vertical axis. */
export function HeartTurntable({ running, className = "" }: { running: boolean; className?: string }) {
  const id = useId().replace(/:/g, "");
  const u = (n: string) => `url(#${id}-${n})`;
  const layer = (z: number, children: ReactNode, key: string | number) => (
    <svg className="heart-layer" key={key} style={{ transform: `translateZ(${z}px)` }} viewBox="0 0 360 360">
      {children}
    </svg>
  );
  return (
    <div className={`heart-turntable ${running ? "is-spinning" : ""} ${className}`} aria-hidden="true">
      <svg className="heart-layer heart-defs" viewBox="0 0 360 360">
        <defs>
          <linearGradient id={`${id}-muscle`} x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="#f08c96" />
            <stop offset=".55" stopColor="#cc5269" />
            <stop offset="1" stopColor="#793b69" />
          </linearGradient>
          <linearGradient id={`${id}-vessel`} x1="0" x2="1">
            <stop offset="0" stopColor="#8bc7df" />
            <stop offset="1" stopColor="#6986cb" />
          </linearGradient>
          <linearGradient id={`${id}-aorta`} x1="0" x2="1">
            <stop offset="0" stopColor="#f9aa9b" />
            <stop offset="1" stopColor="#d05c73" />
          </linearGradient>
        </defs>
      </svg>
      {VESSEL_Z.map((z, i) =>
        layer(
          z,
          <g fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="22">
            {VESSELS.map(([d, kind]) => (
              <path d={d} key={d} stroke={i === VESSEL_Z.length - 1 ? u(kind) : kind === "vessel" ? "#5f78b5" : "#b4506a"} />
            ))}
          </g>,
          `v${z}`,
        ),
      )}
      {BODY_Z.map((z, i) => {
        const outer = i === 0 || i === BODY_Z.length - 1;
        return layer(
          z,
          <path d={HEART_PATH} fill={outer ? u("muscle") : "#a5435f"} stroke={outer ? "#f4a1a1" : "#9a3d58"} strokeWidth="3" />,
          `b${z}`,
        );
      })}
      {layer(
        BODY_Z[BODY_Z.length - 1]! + 1,
        <>
          <path d="M179 131c-18 29-20 67-10 99 5 17 12 35 12 58m5-151c18 29 20 64 8 96-5 15-12 30-13 55" fill="none" opacity=".8" stroke="#f3bdba" strokeWidth="3" />
          <path d="M127 162c12-12 26-18 42-19m66 21c-12-11-25-16-40-17" fill="none" opacity=".6" stroke="#f5c5bf" strokeWidth="4" />
          <g className="heart-flow-dots">
            <circle className="flow-dot flow-blue flow-one" cx="156" cy="61" r="5" />
            <circle className="flow-dot flow-red flow-two" cx="269" cy="61" r="5" />
            <circle className="flow-dot flow-blue flow-three" cx="305" cy="143" r="5" />
            <circle className="flow-dot flow-red flow-four" cx="66" cy="169" r="5" />
          </g>
        </>,
        "front",
      )}
    </div>
  );
}

interface Subject {
  field: string;
  caption: string;
  description: string;
  render: (running: boolean) => ReactNode;
}

const SUBJECTS: Subject[] = [
  { field: "Biology", caption: "THE HUMAN HEART", description: "a human heart", render: (r) => <HeartTurntable running={r} /> },
  { field: "Physics", caption: "THE ATOM", description: "an atom with electrons orbiting its nucleus", render: (r) => <Turntable scene={atomScene} period={12} running={r} /> },
  { field: "Chemistry", caption: "A METHANE MOLECULE", description: "a methane molecule", render: (r) => <Turntable scene={moleculeScene} period={10} running={r} /> },
  { field: "Geography", caption: "PLANET EARTH", description: "the Earth", render: (r) => <Turntable scene={globeScene} period={16} running={r} /> },
  { field: "Space", caption: "A RINGED PLANET", description: "a planet with rings and a moon", render: (r) => <Turntable scene={planetScene} period={18} running={r} /> },
  { field: "Maths", caption: "3D GEOMETRY", description: "a cube with its hidden edges dashed", render: (r) => <Turntable scene={cubeScene} period={11} running={r} /> },
];

/** Hero visual: one subject at a time (heart, atom, molecule, globe, planet, cube), each turning
 *  on its vertical axis. Cycles every few seconds; hover/focus pauses; dots pick a subject. */
export function HeroSubjects() {
  const reduced = usePrefersReducedMotion();
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [ref, onScreen] = useOnScreen<HTMLDivElement>();
  const animate = !reduced && onScreen;

  useEffect(() => {
    if (reduced || paused || !onScreen) return;
    const t = setTimeout(() => setIdx((i) => (i + 1) % SUBJECTS.length), CYCLE_MS);
    return () => clearTimeout(t);
  }, [idx, reduced, paused, onScreen]);

  const current = SUBJECTS[idx]!;
  return (
    <div
      className="landing-heart-scene"
      ref={ref}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="landing-heart-glow" />
      <div className="heart-orbit heart-orbit-one" />
      <div className="heart-orbit heart-orbit-two" />
      <div className="subject-stage" role="img" aria-label={`Rotating 3D illustration of ${current.description} (${current.field})`}>
        {SUBJECTS.map((s, i) => (
          <div className={`subject-layer ${i === idx ? "is-active" : ""}`} key={s.field}>
            <div className="subject-float">{s.render(animate && i === idx)}</div>
          </div>
        ))}
      </div>
      <span className="heart-float heart-label-top"><span className="flow-blue-dot" /> A closer look</span>
      <span className="heart-float heart-label-bottom"><Icon name="sparkles" size={14} /> {current.field}, brought to life</span>
      <div className="hero-subject-footer">
        <div className="subject-picker" role="group" aria-label="Choose a subject">
          {SUBJECTS.map((s, i) => (
            <button
              aria-label={`Show ${s.field}`}
              aria-pressed={i === idx}
              className={`subject-dot ${i === idx ? "is-active" : ""}`}
              key={s.field}
              onClick={() => setIdx(i)}
              title={s.field}
              type="button"
            />
          ))}
        </div>
        <p className="heart-caption">{current.caption} <span>·</span> 3D LEARNING</p>
      </div>
    </div>
  );
}
