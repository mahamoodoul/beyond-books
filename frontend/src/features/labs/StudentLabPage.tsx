/**
 * Student lab: build (a circuit, a molecule, a buoyancy experiment), see it react at once, and
 * have every change saved so the teacher can follow along. The server stores the authoritative
 * result, the sub-goals reached so far, and completion.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router";

import { ErrorAlert, Loading } from "@/components/feedback";
import { Icon } from "@/components/ui/Icon";

import { useLab, useSaveSession } from "./api";
import { BuoyancyLab } from "./BuoyancyLab";
import type { Circuit } from "./circuit";
import { CircuitBuilder } from "./CircuitBuilder";
import { emptyState, evaluateState, goalText, KIND_ICON, KIND_LABEL, normaliseState } from "./engines";
import type { BuoyancyResult, BuoyancyState } from "./engines/buoyancy";
import type { Molecule, MoleculeResult } from "./engines/molecules";
import { buildStepsFor } from "./guide";
import { initHistory, push, redo, undo, type History, type LabState } from "./history";
import { FullscreenButton, useFullscreen } from "./Fullscreen";
import { MoleculeBuilder } from "./MoleculeBuilder";
import { NEXT_IDEA, ScienceBoard, SCIENCE_KINDS } from "./ScienceBoards";
import "./labs.css";

export { goalText };

const toolBtn = "inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40";

export function LabBoard({
  kind, state: rawState, onChange, palette, result, readOnly, toolbar,
}: {
  kind: string; state: LabState; onChange: (s: LabState) => void; palette: Record<string, unknown>;
  result: Record<string, unknown> | null; readOnly?: boolean; toolbar?: React.ReactNode;
}) {
  const state = normaliseState(kind, rawState); // never let a foreign or partial state reach a board
  if (SCIENCE_KINDS.has(kind)) {
    return <ScienceBoard kind={kind} state={state} onChange={onChange} palette={palette} result={result} readOnly={readOnly} toolbar={toolbar} />;
  }
  if (kind === "molecules") {
    return <MoleculeBuilder molecule={state as unknown as Molecule} onChange={(m) => onChange(m as unknown as LabState)} palette={palette as Record<string, number>} result={result as unknown as MoleculeResult | null} readOnly={readOnly} toolbar={toolbar} />;
  }
  if (kind === "buoyancy") {
    const p = palette as { materials?: string[]; liquids?: string[]; allow_custom_density?: boolean };
    return <BuoyancyLab state={state as unknown as BuoyancyState} onChange={(s) => onChange(s as unknown as LabState)} result={result as unknown as BuoyancyResult | null} materials={p.materials} liquids={p.liquids} allowCustom={p.allow_custom_density ?? true} tasks={(result as unknown as BuoyancyResult | null)?.tasks} readOnly={readOnly} toolbar={toolbar} />;
  }
  const pal = palette as { battery?: number; bulb?: number; switch?: number };
  return <CircuitBuilder circuit={state as unknown as Circuit} onChange={(c) => onChange(c as unknown as LabState)} palette={{ battery: pal.battery ?? 1, bulb: pal.bulb ?? 2, switch: pal.switch ?? 1 }} evaluation={result as never} readOnly={readOnly} toolbar={toolbar} />;
}

export function StudentLabPage() {
  const { labId = "" } = useParams();
  const lab = useLab(labId);
  const save = useSaveSession(labId);
  const [history, setHistory] = useState<History | null>(null);
  const state = history?.present ?? null;
  const [achieved, setAchieved] = useState<string[]>([]);
  const [completed, setCompleted] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playground = useRef<HTMLDivElement>(null);
  const fs = useFullscreen(playground);

  // Initialise from the saved session as soon as the lab arrives (render-phase state init).
  if (lab.data && history === null) {
    const saved = lab.data.session?.state as LabState | undefined;
    setHistory(initHistory(saved && Object.keys(saved).length ? normaliseState(lab.data.kind, saved) : emptyState(lab.data.kind)));
    setAchieved(lab.data.session?.achieved ?? []);
    setCompleted(lab.data.session?.status === "completed");
  }

  const kind = lab.data?.kind ?? "circuit";
  const goal = useMemo(() => (lab.data?.goal ?? {}) as Record<string, unknown>, [lab.data]);
  const palette = useMemo(() => (lab.data?.palette ?? {}) as Record<string, unknown>, [lab.data]);
  const ev = useMemo(() => (state ? evaluateState(kind, state, goal, achieved) : null), [kind, state, goal, achieved]);
  const met = ev?.goal_met ?? false;
  const steps = useMemo(() => (state && ev ? buildStepsFor(kind, goal, state, ev.result) : []), [kind, goal, state, ev]);
  const doneSteps = steps.filter((s) => s.state === "done").length;
  const allDone = steps.length > 0 && doneSteps === steps.length;

  useEffect(() => { if (met) setCelebrate(true); }, [met]);

  const persist = (s: LabState) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      save.mutate(s, {
        onSuccess: (r) => {
          setAchieved(r.achieved);
          if (r.session?.status === "completed") setCompleted(true);
        },
      });
    }, 700);
  };
  const change = (s: LabState) => {
    // sub-goals reached locally count at once; the server confirms on save
    if (ev) setAchieved((a) => [...new Set([...a, ...evaluateState(kind, s, goal, a).achieved])]);
    setHistory((h) => (h ? push(h, s) : initHistory(s)));
    persist(s);
  };
  const doUndo = () => setHistory((h) => { if (!h || !h.past.length) return h; const n = undo(h); persist(n.present); return n; });
  const doRedo = () => setHistory((h) => { if (!h || !h.future.length) return h; const n = redo(h); persist(n.present); return n; });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z" || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      e.preventDefault();
      if (e.shiftKey) doRedo(); else doUndo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (lab.isPending || state === null) return <Loading />;
  if (lab.error) return <ErrorAlert error={lab.error} />;
  const d = lab.data!;
  const bad = Boolean((ev?.result as { short_circuit?: boolean; over_bonded?: string[] } | undefined)?.short_circuit) || ((ev?.result as { over_bonded?: string[] } | undefined)?.over_bonded?.length ?? 0) > 0;
  const tone = bad ? "is-bad" : met ? "is-ok" : "is-warn";

  return (
    <div className="student-course-page">
      <nav aria-label="Breadcrumb" className="course-breadcrumb">
        <Link to={d.course_id ? `/student/courses/${d.course_id}` : "/student/labs"}><Icon name="arrow-left" size={15} /> {d.course_title ?? "Labs"}</Link>
      </nav>

      <header className="lab-hero mb-4">
        <div className="flex flex-wrap items-center gap-4">
          <span className="lab-hero-icon"><Icon name={KIND_ICON[kind] ?? "bolt"} size={28} /></span>
          <div className="min-w-0 flex-1">
            <p className="lab-hero-eyebrow">{KIND_LABEL[kind] ?? "Lab"}{d.chapter_title ? ` · ${d.chapter_title}` : ""}</p>
            <h1 className="text-2xl font-semibold leading-tight">{d.title}</h1>
            {d.instructions && <p className="mt-1 max-w-2xl text-sm text-white/80">{d.instructions}</p>}
          </div>
          <div className="flex items-center gap-3 rounded-2xl bg-white/10 px-4 py-3 ring-1 ring-white/15">
            <div className={`lab-ring ${allDone ? "is-done" : ""}`} style={{ ["--p" as string]: steps.length ? doneSteps / steps.length : 0 }} role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={doneSteps} aria-label="Steps completed">
              <span>{allDone ? <Icon name="check" size={16} /> : `${doneSteps}/${steps.length}`}</span>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-white/60">{completed || met ? "Goal reached" : "Goal"}</p>
              <p className="text-sm font-medium">{goalText(kind, goal)}</p>
            </div>
          </div>
        </div>
      </header>

      <div ref={playground} className={`lab-playground ${fs.on ? "lab-fs" : ""}`}>
      {fs.on && (
        <div className="lab-fs-bar">
          <span className="lab-fs-icon"><Icon name={KIND_ICON[kind] ?? "bolt"} size={18} /></span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{d.title}</p>
            <p className="truncate text-xs opacity-70">{goalText(kind, goal)}</p>
          </div>
          <span className="lab-fs-count">{doneSteps}/{steps.length} steps</span>
          <FullscreenButton on toggle={fs.toggle} className={toolBtn} />
        </div>
      )}
      <div className="lab-fs-grid grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-3">
          <LabBoard
            kind={kind}
            state={state}
            onChange={change}
            palette={palette}
            result={ev?.result ?? null}
            toolbar={
              <>
                <button type="button" disabled={!history?.past.length} onClick={doUndo} title="Undo (Ctrl/⌘+Z)" className={toolBtn}>
                  <Icon name="rotate" size={14} className="-scale-x-100" /> Undo
                </button>
                <button type="button" disabled={!history?.future.length} onClick={doRedo} title="Redo (Shift+Ctrl/⌘+Z)" className={toolBtn}>
                  <Icon name="rotate" size={14} /> Redo
                </button>
                {kind === "molecules" && (
                  <button type="button" disabled={!(state.atoms as unknown[] | undefined)?.length} onClick={() => change(emptyState(kind))} className={toolBtn}>Clear board</button>
                )}
                {!fs.on && <FullscreenButton on={false} toggle={fs.toggle} className={toolBtn} />}
              </>
            }
          />
          <div className="flex flex-wrap items-center gap-3">
            <p role="status" className={`lab-led flex-1 ${tone}`}>
              <span className="lab-led-dot" aria-hidden />
              <span>{ev?.message}</span>
            </p>
            <span className="text-xs" style={{ color: "var(--muted)" }}>
              {save.isPending ? "Saving…" : save.isError ? "Not saved" : save.isSuccess ? "Saved" : ""}
            </span>
          </div>
          {celebrate && met && (
            <div className="lab-success flex flex-wrap items-center gap-3">
              <span className="lab-success-icon grid h-10 w-10 place-items-center rounded-full"><Icon name="check" size={20} /></span>
              <div className="flex-1">
                <p className="font-semibold">Goal reached.</p>
                <p className="text-sm">Your teacher can see it. Keep experimenting: the board stays open and everything you try is saved.</p>
              </div>
              <button type="button" className="lab-success-button rounded-md px-3 py-1.5 text-sm font-medium" onClick={() => setCelebrate(false)}>Got it</button>
            </div>
          )}
          <ErrorAlert error={save.error} />
        </div>

        <aside className="lab-glass self-start p-4" aria-label="Step-by-step guide">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="font-semibold" style={{ color: "var(--ink)" }}>Step by step</h2>
            <span className="lab-step-count rounded-full px-2 py-0.5 text-xs font-medium">{doneSteps}/{steps.length} done</span>
          </div>
          <ol className="space-y-2">
            {steps.map((s, i) => (
              <li key={s.key} className={`lab-step rounded-xl px-2.5 py-2 text-sm ${s.state === "current" ? "is-current" : s.state === "done" ? "is-done" : ""}`}>
                <div className="flex items-start gap-2">
                  <span className="lab-step-no mt-0.5">{s.state === "done" ? <Icon name="check" size={12} /> : i + 1}</span>
                  <div className="min-w-0">
                    <p className="lab-step-title font-medium">{s.title}</p>
                    {s.state === "current" && (
                      <>
                        {s.goal && <p className="lab-step-goal mt-1 text-xs">{s.goal}</p>}
                        {s.plan && (
                          <ul className="lab-plan mt-2" aria-label="Plan for this step">
                            {s.plan.map((item, k) => {
                              const current = !item.done && s.plan!.slice(0, k).every((x) => x.done);
                              return (
                                <li key={k} className={item.done ? "is-done" : current ? "is-current" : ""}>
                                  <span className="lab-plan-mark" aria-hidden>{item.done ? <Icon name="check" size={10} /> : k + 1}</span>
                                  <span>{item.label}</span>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                        <div className={s.plan ? "lab-now mt-2" : "mt-1"}>
                          {s.plan && <p className="lab-now-label">Do this now</p>}
                          {s.hint.includes("\n") ? (
                            <ol className="lab-step-hint list-decimal space-y-1 pl-4">
                              {s.hint.split("\n").map((line, k) => <li key={k}>{line}</li>)}
                            </ol>
                          ) : (
                            <p className="lab-step-hint">{s.hint}</p>
                          )}
                        </div>
                        {showDetail ? (
                          <p className="lab-step-detail mt-1 text-xs">{s.detail}</p>
                        ) : (
                          <button type="button" className="lab-step-why mt-1" onClick={() => setShowDetail(true)}>Why?</button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </li>
            ))}
            {allDone && (
              <li className="lab-done rounded-xl px-2.5 py-2 text-sm">
                <p className="font-medium">All steps done. Keep exploring.</p>
                <p className="mt-1 text-xs">{NEXT_IDEA[kind] ?? (kind === "circuit" ? "Add a second bulb in a row and watch both go dim, then rewire it side by side and see them both shine." : kind === "molecules" ? "Try ammonia (NH3) or ethene (C2H4) and look at the shape." : "Try honey, or a custom density just under the liquid's, and watch how high it floats.")}</p>
              </li>
            )}
          </ol>
        </aside>
      </div>
      </div>
    </div>
  );
}
