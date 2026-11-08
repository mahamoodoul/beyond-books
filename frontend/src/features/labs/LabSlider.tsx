/**
 * A range slider for lab boards that previews while dragging (onPreview, no save, no history)
 * and commits once when released (onCommit: one undo step, one save). Keyboard steps commit
 * on key up.
 */
import { useState } from "react";

export function LabSlider({
  label, value, min, max, step, unit = "", format, onPreview, onCommit, disabled,
}: {
  label: string; value: number; min: number; max: number; step: number; unit?: string;
  format?: (v: number) => string; onPreview: (v: number | null) => void; onCommit: (v: number) => void; disabled?: boolean;
}) {
  const [draft, setDraft] = useState<number | null>(null);
  const shown = draft ?? value;
  const commit = () => {
    if (draft === null) return;
    const v = draft;
    setDraft(null);
    onPreview(null);
    if (v !== value) onCommit(v);
  };
  return (
    <label className="lab-slider">
      <span className="lab-slider-label">{label}</span>
      <input
        type="range" min={min} max={max} step={step} value={shown} disabled={disabled}
        onChange={(e) => { const v = Number(e.target.value); setDraft(v); onPreview(v); }}
        onPointerUp={commit} onKeyUp={commit} onBlur={commit}
      />
      <span className="lab-slider-value">{format ? format(shown) : shown}{unit}</span>
    </label>
  );
}

/** Segmented buttons for a small set of choices. */
export function LabSegment<T extends string>({ label, value, options, onChange, disabled }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <div className="lab-seg" role="group" aria-label={label}>
      <span className="lab-slider-label">{label}</span>
      <div className="lab-seg-btns">
        {options.map((o) => (
          <button key={o.value} type="button" disabled={disabled} aria-pressed={value === o.value} onClick={() => value !== o.value && onChange(o.value)}>{o.label}</button>
        ))}
      </div>
    </div>
  );
}

/** The lab's tasks as chips under the board, ticked when done. */
export function TaskChips({ tasks, achieved, labels }: { tasks: string[]; achieved: string[]; labels: Record<string, string> }) {
  return (
    <ul className="lab-task-chips flex flex-wrap gap-2 text-xs">
      {tasks.map((task) => {
        const done = achieved.includes(task);
        return <li key={task} className={`lab-chip ${done ? "is-done" : ""}`}>{done ? "✓ " : ""}{labels[task] ?? task}</li>;
      })}
    </ul>
  );
}
