/**
 * Boards for the science lab kinds (breathing, orbits, plate tectonics), dispatched by kind so the
 * lab pages only need one branch for all of them.
 */
import type { ReactNode } from "react";

import type { LabKindOut } from "@/api/generated/schema";
import { Field } from "@/components/ui";

import type { RespirationResult, RespirationState } from "./engines/respiration";
import type { LabState } from "./history";
import type { OrbitsResult, OrbitsState } from "./engines/orbits";
import { OrbitsLab } from "./OrbitsLab";
import { RespirationLab } from "./RespirationLab";
import type { TectonicsResult, TectonicsState } from "./engines/tectonics";
import { TectonicsLab } from "./TectonicsLab";

export const SCIENCE_KINDS = new Set(["respiration", "orbits", "tectonics"]);

/** Per kind: the palette list the teacher can narrow (e.g. which activities students may pick). */
const PALETTE_LIST: Record<string, { key: string; label: string; option: string }> = {
  respiration: { key: "activities", label: "Activities students can pick", option: "activities" },
  tectonics: { key: "boundaries", label: "Plate boundaries students can pick", option: "boundaries" },
};

export const NEXT_IDEA: Record<string, string> = {
  orbits: "Set the latitude to 70° and visit June and December: the Midnight Sun and the polar night. Then try the equator.",
  tectonics: "Run a transform fault for 20 Myr and measure how far the river moved. Then compare a divergent boundary's magnetic stripes on both sides of the ridge.",
  respiration: "Try Walk with the slowest rate and a deep breath, then a fast rate with shallow breaths. Which gets more air to the alveoli?",
};

export function ScienceBoard({
  kind, state, onChange, palette, result, readOnly, toolbar,
}: {
  kind: string; state: LabState; onChange: (s: LabState) => void; palette: Record<string, unknown>;
  result: Record<string, unknown> | null; readOnly?: boolean; toolbar?: ReactNode;
}) {
  if (kind === "respiration") {
    const p = palette as { activities?: string[] };
    return <RespirationLab state={state as unknown as RespirationState} onChange={(s) => onChange(s as unknown as LabState)} result={result as unknown as RespirationResult | null} activities={p.activities} readOnly={readOnly} toolbar={toolbar} />;
  }
  if (kind === "tectonics") {
    const p = palette as { boundaries?: string[] };
    return <TectonicsLab state={state as unknown as TectonicsState} onChange={(s) => onChange(s as unknown as LabState)} result={result as unknown as TectonicsResult | null} boundaries={p.boundaries} readOnly={readOnly} toolbar={toolbar} />;
  }
  if (kind === "orbits") {
    const p = palette as { allow_tilt?: boolean };
    return <OrbitsLab state={state as unknown as OrbitsState} onChange={(s) => onChange(s as unknown as LabState)} result={result as unknown as OrbitsResult | null} allowTilt={p.allow_tilt ?? true} readOnly={readOnly} toolbar={toolbar} />;
  }
  return null;
}

/** Settings for the science kinds: tick the tasks, and narrow the palette list. */
export function ScienceSettings({
  kind, goal, palette, setGoal, setPalette,
}: {
  kind: LabKindOut; goal: Record<string, unknown>; palette: Record<string, unknown>;
  setGoal: (p: Record<string, unknown>) => void; setPalette: (p: Record<string, unknown>) => void;
}) {
  const tasks = (goal.tasks as string[] | undefined) ?? [];
  const options = (kind.options.tasks as { key: string; label: string }[] | undefined) ?? [];
  const order = (list: string[], all: string[]) => all.filter((k) => list.includes(k));
  const toggle = (k: string) => setGoal({ tasks: order(tasks.includes(k) ? tasks.filter((t) => t !== k) : [...tasks, k], options.map((o) => o.key)) });
  const pl = PALETTE_LIST[kind.kind];
  const plAll = pl ? ((kind.options[pl.option] as { name: string }[] | undefined) ?? []).map((o) => o.name) : [];
  const plOn = pl ? ((palette[pl.key] as string[] | undefined) ?? plAll) : [];
  return (
    <>
      <Field label="Tasks the student must do" hint="The lab is complete when every ticked task has been done at least once.">
        <div className="space-y-1 text-sm">
          {options.map((o) => (
            <label key={o.key} className="flex items-center gap-2"><input type="checkbox" checked={tasks.includes(o.key)} onChange={() => toggle(o.key)} /> {o.label}</label>
          ))}
        </div>
      </Field>
      {kind.kind === "orbits" && (
        <Field label="Options">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={(palette.allow_tilt as boolean | undefined) ?? true} onChange={(e) => setPalette({ allow_tilt: e.target.checked })} /> students may change Earth's tilt</label>
        </Field>
      )}
      {pl && (
        <Field label={pl.label}>
          <div className="flex flex-wrap gap-3 text-sm">
            {plAll.map((name) => (
              <label key={name} className="inline-flex items-center gap-1.5">
                <input type="checkbox" checked={plOn.includes(name)} disabled={plOn.length === 1 && plOn.includes(name)}
                  onChange={() => setPalette({ [pl.key]: order(plOn.includes(name) ? plOn.filter((x) => x !== name) : [...plOn, name], plAll) })} /> {name}
              </label>
            ))}
          </div>
        </Field>
      )}
    </>
  );
}
