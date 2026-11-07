import type { AnimationFrame } from "@/features/three-d/library/runtime/animation";
import type { ResolvedComponent } from "@/features/three-d/library/runtime/types";

export interface ExplanationPanelProps {
  components: ResolvedComponent[];
  selected: string | null;
  hidden: ReadonlySet<string>;
  missing: ReadonlySet<string>;
  frame: AnimationFrame;
  explanations?: Readonly<Record<string, string>>;
  onSelect: (id: string) => void;
  onToggleVisibility: (id: string) => void;
  onFocus: (id: string) => void;
}

/**
 * Explanation + component list. Doubles as the accessible, non-3D way to explore the scene
 * (design §7.7): every component can be selected, focused and shown/hidden from here.
 */
export function ExplanationPanel({
  components,
  selected,
  hidden,
  missing,
  frame,
  explanations = {},
  onSelect,
  onToggleVisibility,
  onFocus,
}: ExplanationPanelProps) {
  const current = components.find((c) => c.componentId === selected) ?? null;
  const stepText = frame.annotation?.text ?? frame.explanation;

  return (
    <aside className="flex min-h-0 flex-col gap-4" aria-label="Explanation">
      <section aria-live="polite" className="rounded-lg border border-slate-200 bg-white p-4">
        {stepText ? (
          <>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-amber-700">
              Step {frame.stepNumber}
            </h2>
            <p className="mt-1 text-sm text-slate-800">{stepText}</p>
          </>
        ) : current ? (
          <>
            <h2 className="text-base font-semibold text-navy-950">{current.label}</h2>
            {current.actions.has("show_explanation") ? (
              <p className="mt-1 text-sm text-slate-700">
                {(current.explanationRef && explanations[current.explanationRef]) ??
                  "The explanation for this part will appear here once the lesson content is linked."}
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-slate-600">
            Select a part of the model or a name below to learn about it.
          </p>
        )}
      </section>

      <section className="min-h-0 overflow-y-auto rounded-lg border border-slate-200 bg-white">
        <h2 className="border-b border-slate-200 px-4 py-2 text-sm font-medium text-slate-500">
          Parts
        </h2>
        <ul className="divide-y divide-slate-100">
          {components.map((c) => {
            const isMissing = missing.has(c.componentId);
            const isHidden = hidden.has(c.componentId);
            return (
              <li key={c.componentId} className="flex items-center gap-2 px-3 py-1.5">
                <button
                  type="button"
                  disabled={isMissing}
                  aria-current={selected === c.componentId}
                  onClick={() => onSelect(c.componentId)}
                  className="flex-1 truncate rounded px-1 py-0.5 text-left text-sm text-slate-800 hover:bg-slate-50 disabled:text-slate-400 aria-[current=true]:font-semibold aria-[current=true]:text-accent"
                >
                  {c.label}
                  {isMissing && <span className="ml-1 text-xs">(not in model)</span>}
                </button>
                {c.actions.has("focus_camera") && !isMissing && (
                  <button
                    type="button"
                    onClick={() => onFocus(c.componentId)}
                    className="rounded px-1.5 py-0.5 text-xs text-slate-600 hover:bg-slate-100"
                    aria-label={`Focus camera on ${c.label}`}
                  >
                    Focus
                  </button>
                )}
                {c.actions.has("toggle_visibility") && !isMissing && (
                  <button
                    type="button"
                    onClick={() => onToggleVisibility(c.componentId)}
                    aria-pressed={!isHidden}
                    className="rounded px-1.5 py-0.5 text-xs text-slate-600 hover:bg-slate-100"
                    aria-label={`${isHidden ? "Show" : "Hide"} ${c.label}`}
                  >
                    {isHidden ? "Show" : "Hide"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </aside>
  );
}
