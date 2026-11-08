"use client";

import { useEffect, useId, useState } from "react";

type Variant = "dark" | "light";

interface BeyondBooksLogoProps {
  /** Pixel size of the mark (square). */
  size?: number;
  /** "dark" = for dark backgrounds, "light" = for light backgrounds. */
  variant?: Variant;
  /** Turn the atom on its vertical axis. Automatically disabled for prefers-reduced-motion. */
  animated?: boolean;
  /** Show the "Beyond Books" wordmark next to the mark. */
  showWordmark?: boolean;
  className?: string;
}

const PALETTE = {
  dark: {
    pageLeft: "#E0E7FF",
    pageRight: "#C7D2FE",
    stem: "#6366F1",
    orbits: ["#A78BFA", "#8B5CF6", "#7C3AED"],
    electron: "#67E8F9",
    text: "#FFFFFF",
  },
  light: {
    pageLeft: "#1E1B4B",
    pageRight: "#312E81",
    stem: "#6366F1",
    orbits: ["#8B5CF6", "#7C3AED", "#5B21B6"],
    electron: "#0891B2",
    text: "#1E1B4B",
  },
} as const;

// Ellipse centred on the nucleus (60,36), rx 30, ry 10, written as a path so electrons can follow it.
const ORBIT_PATH = "M30 36 A30 10 0 1 1 90 36 A30 10 0 1 1 30 36 Z";
const ORBIT_ANGLES = [0, 60, -60];
const ELECTRON_DURATIONS = ["2.4s", "3s", "3.6s"];

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

export default function BeyondBooksLogo({
  size = 120,
  variant = "dark",
  animated = true,
  showWordmark = false,
  className,
}: BeyondBooksLogoProps) {
  const id = useId().replace(/:/g, "");
  const reduced = usePrefersReducedMotion();
  const spin = animated && !reduced;
  const c = PALETTE[variant];

  const mark = (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      role="img"
      aria-label="Beyond Books logo"
      style={{ overflow: "visible", flexShrink: 0 }}
    >
      <style>{`
        .bb-atom-${id} {
          transform-box: view-box;
          transform-origin: 60px 36px;
          animation: bb-spin-${id} 6s linear infinite;
        }
        .bb-nucleus-${id} {
          transform-box: view-box;
          transform-origin: 60px 36px;
          animation: bb-pulse-${id} 2.4s ease-in-out infinite;
        }
        /* turn on the vertical axis (like a 3D model on a turntable), not a flat spin */
        @keyframes bb-spin-${id} { from { transform: rotateY(0deg); } to { transform: rotateY(360deg); } }
        @keyframes bb-pulse-${id} { 0%,100% { transform: scale(1); } 50% { transform: scale(1.15); } }
      `}</style>

      {/* Open book */}
      <path d="M60 102 Q38 92 14 94 L14 60 Q38 58 60 68 Z" fill={c.pageLeft} />
      <path d="M60 102 Q82 92 106 94 L106 60 Q82 58 60 68 Z" fill={c.pageRight} />
      {/* Pop-up supports */}
      <path d="M60 68 L48 46 M60 68 L72 46" stroke={c.stem} strokeWidth={2} fill="none" />

      {/* Atom */}
      <g className={spin ? `bb-atom-${id}` : undefined}>
        {ORBIT_ANGLES.map((angle, i) => (
          <g key={angle} transform={`rotate(${angle} 60 36)`}>
            <path
              id={`bb-orbit-${id}-${i}`}
              d={ORBIT_PATH}
              fill="none"
              stroke={c.orbits[i]}
              strokeWidth={3}
            />
            <circle r={3.5} fill={c.electron} cx={spin ? 0 : 90} cy={spin ? 0 : 36}>
              {spin && (
                <animateMotion
                  dur={ELECTRON_DURATIONS[i]}
                  repeatCount="indefinite"
                  begin={`${-i * 0.8}s`}
                >
                  <mpath href={`#bb-orbit-${id}-${i}`} />
                </animateMotion>
              )}
            </circle>
          </g>
        ))}
      </g>
      <circle
        className={spin ? `bb-nucleus-${id}` : undefined}
        cx={60}
        cy={36}
        r={6}
        fill={c.electron}
      />
    </svg>
  );

  if (!showWordmark) return <span className={className}>{mark}</span>;

  return (
    <span
      className={className}
      style={{ display: "inline-flex", alignItems: "center", gap: size * 0.15 }}
    >
      {mark}
      <span
        className="bb-wordmark"
        style={{
          fontFamily: "'Space Grotesk', sans-serif",
          fontWeight: 700,
          fontSize: size * 0.36,
          letterSpacing: "-0.02em",
          lineHeight: 1,
          color: c.text,
        }}
      >
        Beyond Books
      </span>
    </span>
  );
}
