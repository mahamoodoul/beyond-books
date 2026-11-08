/**
 * Per-kind settings controls shared by the create form and the lab page. Edits a plain
 * {goal, palette} object; the engine on the server validates it.
 */
import type { LabKindOut } from "@/api/generated/schema";
import { Field, Input } from "@/components/ui";

import { SCIENCE_KINDS, ScienceSettings } from "./ScienceBoards";

export interface LabConfig { goal: Record<string, unknown>; palette: Record<string, unknown> }

export function defaultConfig(kind: LabKindOut | undefined): LabConfig {
  return { goal: { ...(kind?.default_goal ?? {}) }, palette: { ...(kind?.default_palette ?? {}) } };
}

export function LabSettings({ kind, config, onChange }: { kind: LabKindOut | undefined; config: LabConfig; onChange: (c: LabConfig) => void }) {
  if (!kind) return null;
  const setGoal = (patch: Record<string, unknown>) => onChange({ ...config, goal: { ...config.goal, ...patch } });
  const setPalette = (patch: Record<string, unknown>) => onChange({ ...config, palette: { ...config.palette, ...patch } });

  if (SCIENCE_KINDS.has(kind.kind)) return <ScienceSettings kind={kind} goal={config.goal} palette={config.palette} setGoal={setGoal} setPalette={setPalette} />;

  if (kind.kind === "circuit") {
    const g = config.goal as { min_lit?: number; require_switch?: boolean };
    const p = config.palette as { battery?: number; bulb?: number; switch?: number };
    return (
      <>
        <Field label="Goal">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="inline-flex items-center gap-1">Light at least <Input type="number" min={1} max={10} className="w-16" value={g.min_lit ?? 1} onChange={(e) => setGoal({ min_lit: Number(e.target.value) || 1 })} /> bulb(s)</label>
            <label className="inline-flex items-center gap-1"><input type="checkbox" checked={g.require_switch ?? false} onChange={(e) => setGoal({ require_switch: e.target.checked })} /> must use a closed switch</label>
          </div>
        </Field>
        <Field label="Parts students may use">
          <div className="flex flex-wrap gap-3 text-sm">
            {(["battery", "bulb", "switch"] as const).map((k) => (
              <label key={k} className="inline-flex items-center gap-1 capitalize">{k} <Input type="number" min={k === "switch" ? 0 : 1} max={k === "battery" ? 3 : k === "bulb" ? 6 : 4} className="w-16" value={p[k] ?? 1} onChange={(e) => setPalette({ [k]: Number(e.target.value) || 0 })} /></label>
            ))}
          </div>
        </Field>
      </>
    );
  }

  if (kind.kind === "molecules") {
    const targets = (config.goal.targets as string[] | undefined) ?? [];
    const options = (kind.options.targets as { formula: string; name: string }[] | undefined) ?? [];
    const elements = (kind.options.elements as { symbol: string; valence: number }[] | undefined) ?? [];
    const toggle = (f: string) => setGoal({ targets: targets.includes(f) ? targets.filter((t) => t !== f) : [...targets, f] });
    return (
      <>
        <Field label="Molecules to build (in this order)" hint="Each one is a step; the lab is complete when all are built.">
          <div className="flex flex-wrap gap-1.5">
            {options.map((o) => (
              <button key={o.formula} type="button" onClick={() => toggle(o.formula)} className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${targets.includes(o.formula) ? "bg-navy-900 text-white ring-navy-900" : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50"}`}>
                {targets.includes(o.formula) ? `${targets.indexOf(o.formula) + 1}. ` : ""}{o.formula} <span className="opacity-70">{o.name}</span>
              </button>
            ))}
          </div>
        </Field>
        <Field label="Atoms available">
          <div className="flex flex-wrap gap-3 text-sm">
            {elements.map((el) => (
              <label key={el.symbol} className="inline-flex items-center gap-1">{el.symbol} <Input type="number" min={0} max={20} className="w-16" value={(config.palette[el.symbol] as number | undefined) ?? 0} onChange={(e) => setPalette({ [el.symbol]: Number(e.target.value) || 0 })} /></label>
            ))}
          </div>
        </Field>
      </>
    );
  }

  if (kind.kind === "buoyancy") {
    const tasks = (config.goal.tasks as string[] | undefined) ?? [];
    const options = (kind.options.tasks as { key: string; label: string }[] | undefined) ?? [];
    const toggle = (k: string) => setGoal({ tasks: tasks.includes(k) ? tasks.filter((t) => t !== k) : [...tasks, k] });
    return (
      <>
        <Field label="Tasks the student must do" hint="The lab is complete when every ticked task has been experienced.">
          <div className="space-y-1 text-sm">
            {options.map((o) => (
              <label key={o.key} className="flex items-center gap-2"><input type="checkbox" checked={tasks.includes(o.key)} onChange={() => toggle(o.key)} /> {o.label}</label>
            ))}
          </div>
        </Field>
        <Field label="Options">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={(config.palette.allow_custom_density as boolean | undefined) ?? true} onChange={(e) => setPalette({ allow_custom_density: e.target.checked })} /> students may set custom densities</label>
        </Field>
      </>
    );
  }
  return null;
}
