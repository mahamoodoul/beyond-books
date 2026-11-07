import { useEffect, useRef } from "react";

import type { AnimationRunner, RunnerSnapshot } from "@/features/three-d/library/runtime/animation";
import type { AnimationSpec } from "@/features/three-d/library/runtime/types";

export interface AnimationTimelineProps {
  animations: AnimationSpec[];
  selectedId: string | null;
  onSelectAnimation: (id: string) => void;
  runner: AnimationRunner | null;
  snapshot: RunnerSnapshot;
  problems: string[];
}

const btn =
  "rounded-md bg-navy-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-navy-900 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-accent";
const ghost =
  "rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40";

export function AnimationTimeline({
  animations,
  selectedId,
  onSelectAnimation,
  runner,
  snapshot,
  problems,
}: AnimationTimelineProps) {
  const bar = useRef<HTMLDivElement>(null);

  // progress bar follows the runner without re-rendering React each frame
  useEffect(() => {
    if (!runner) return;
    let raf = 0;
    const loop = () => {
      const n = runner.steps.length;
      const p = runner.position;
      const done = p.status === "idle" ? 0 : (p.index + p.progress) / n;
      if (bar.current) bar.current.style.width = `${(done * 100).toFixed(2)}%`;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [runner]);

  if (animations.length === 0) return null;
  const playing = snapshot.status === "playing";
  const total = runner?.steps.length ?? 0;

  return (
    <section
      className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3"
      aria-label="Animation timeline"
    >
      <div className="flex flex-wrap items-center gap-2">
        {animations.length > 1 ? (
          <select
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
            value={selectedId ?? ""}
            onChange={(e) => onSelectAnimation(e.target.value)}
            aria-label="Animation"
          >
            {animations.map((a) => (
              <option key={a.animation_id} value={a.animation_id}>
                {a.title}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-sm font-medium text-slate-800">{animations[0]?.title}</span>
        )}

        <div className="ml-auto flex items-center gap-2">
          <button type="button" className={ghost} disabled={!runner} onClick={() => runner?.stepBack()} aria-label="Previous step">
            ◀
          </button>
          <button
            type="button"
            className={btn}
            disabled={!runner}
            onClick={() => (playing ? runner?.pause() : runner?.play())}
          >
            {playing ? "Pause" : snapshot.status === "paused" ? "Resume" : "Play"}
          </button>
          <button type="button" className={ghost} disabled={!runner} onClick={() => runner?.stepForward()} aria-label="Next step">
            ▶
          </button>
          <button type="button" className={ghost} disabled={!runner} onClick={() => runner?.restart()}>
            Restart
          </button>
          <button
            type="button"
            className={ghost}
            disabled={!runner || snapshot.status === "idle"}
            onClick={() => runner?.reset()}
          >
            Stop
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div
          className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={snapshot.status === "idle" ? 0 : snapshot.index + 1}
          aria-label="Animation progress"
        >
          <div ref={bar} className="h-full w-0 bg-amber-500" />
        </div>
        <span className="w-24 text-right text-xs tabular-nums text-slate-500">
          {snapshot.status === "idle"
            ? `${total} steps`
            : snapshot.status === "finished"
              ? "Finished"
              : `Step ${snapshot.index + 1} of ${total}`}
        </span>
      </div>

      {problems.length > 0 && (
        <p className="text-sm text-red-700">
          This animation can't run: {problems.slice(0, 3).join("; ")}
        </p>
      )}
    </section>
  );
}
