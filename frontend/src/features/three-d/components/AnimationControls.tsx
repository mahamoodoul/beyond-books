import type { AnimationSpec } from "@/api/generated/schema";
import { Button } from "@/components/ui";

export function AnimationControls({
  animation,
  index,
  playing,
  onPlay,
  onPause,
  onRestart,
  onStep,
  onJump,
}: {
  animation: AnimationSpec;
  index: number;
  playing: boolean;
  onPlay: () => void;
  onPause: () => void;
  onRestart: () => void;
  onStep: (d: -1 | 1) => void;
  onJump: (i: number) => void;
}) {
  const step = animation.steps[index];
  const n = animation.steps.length;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1">
        {playing ? <Button onClick={onPause}>Pause</Button> : <Button onClick={onPlay}>{index >= n - 1 && !playing && index > 0 ? "Replay" : "Play"}</Button>}
        <Button variant="secondary" aria-label="Previous step" disabled={index <= 0} onClick={() => onStep(-1)}>◀</Button>
        <Button variant="secondary" aria-label="Next step" disabled={index >= n - 1} onClick={() => onStep(1)}>▶</Button>
        <Button variant="ghost" onClick={onRestart}>Restart</Button>
        <span className="ml-auto text-xs text-slate-500">Step {index + 1} of {n}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded bg-slate-200" aria-hidden>
        <div className="h-full bg-navy-700 transition-all" style={{ width: `${((index + 1) / n) * 100}%` }} />
      </div>
      <p aria-live="polite" className="min-h-10 rounded-md bg-amber-50 p-2 text-sm">{step?.explanation ?? " "}</p>
      <ol className="max-h-40 space-y-0.5 overflow-auto text-xs">
        {animation.steps.map((s, i) => (
          <li key={i}>
            <button className={`w-full rounded px-2 py-1 text-left ${i === index ? "bg-navy-900 text-white" : "hover:bg-slate-100"}`} onClick={() => onJump(i)}>
              {i + 1}. {s.explanation ?? s.action.replace(/_/g, " ")}
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
