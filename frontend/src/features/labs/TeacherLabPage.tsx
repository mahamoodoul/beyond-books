/**
 * One lab for its teacher: settings and publishing, a "try it" board, and the live table of
 * what every student has built (polled every few seconds while the page is open).
 */
import { useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";

import type { StudentSessionRow } from "@/api/generated/schema";
import { EmptyState, ErrorAlert, Loading } from "@/components/feedback";
import { Badge, Button, Card, Field, Input, Textarea } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { useChapters } from "@/features/chapters/api";
import { useCourses } from "@/features/courses/api";

import { useDeleteLab, useLab, useLabKinds, useLabSessions, useUpdateLab } from "./api";
import { emptyState, evaluateState, goalText, KIND_ICON, KIND_LABEL } from "./engines";
import { initHistory, push, redo, undo, type LabState } from "./history";
import { LabSettings, type LabConfig } from "./LabSettings";
import { FullscreenButton, useFullscreen } from "./Fullscreen";
import { LabBoard } from "./StudentLabPage";
import "./labs.css";

function ago(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
}

function Activity({ labId }: { labId: string }) {
  const [live, setLive] = useState(true);
  const sessions = useLabSessions(labId, live);
  const rows = sessions.data ?? [];
  const done = rows.filter((r) => r.status === "completed").length;
  const active = rows.filter((r) => Date.now() - new Date(r.last_activity_at).getTime() < 2 * 60_000).length;
  const status = (r: StudentSessionRow) =>
    r.goal_met ? { tone: "green" as const, label: "Goal reached" } : r.flag ? { tone: "red" as const, label: r.flag } : r.achieved > 0 ? { tone: "blue" as const, label: `${r.achieved}/${r.total} done` } : { tone: "amber" as const, label: "Working" };
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold text-slate-900">Student activity</h2>
          <p className="text-xs text-slate-500">{rows.length} started · {done} reached the goal · {active} active in the last 2 minutes</p>
        </div>
        <label className="inline-flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} />
          <span className={`lab-live-dot inline-block h-2 w-2 rounded-full ${live ? "animate-pulse" : "is-off"}`} aria-hidden />
          Live updates
        </label>
      </div>
      {sessions.isPending && <Loading />}
      <ErrorAlert error={sessions.error} />
      {sessions.data && rows.length === 0 && <EmptyState title="No student has opened this lab yet">Publish it and students find it in their course under the chapter, and in their Labs tab.</EmptyState>}
      {rows.length > 0 && (
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-slate-500">
            <tr>
              <th className="pb-1 font-medium">Student</th>
              <th className="pb-1 font-medium">State</th>
              <th className="pb-1 font-medium">What they have</th>
              <th className="pb-1 font-medium">Changes</th>
              <th className="pb-1 font-medium">Last change</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => {
              const s = status(r);
              return (
                <tr key={r.student_id}>
                  <td className="py-1.5 font-medium text-slate-900">{r.display_name}</td>
                  <td className="py-1.5"><Badge tone={s.tone}>{s.label}</Badge></td>
                  <td className="py-1.5 text-slate-700">{r.summary}</td>
                  <td className="py-1.5 tabular-nums text-slate-700">{r.interactions}</td>
                  <td className="py-1.5 text-slate-600" title={new Date(r.last_activity_at).toLocaleString()}>{ago(r.last_activity_at)}{r.completed_at ? ` · done ${ago(r.completed_at)}` : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Card>
  );
}

export function TeacherLabPage() {
  const { labId = "" } = useParams();
  const lab = useLab(labId);
  const kinds = useLabKinds();
  const update = useUpdateLab(labId);
  const remove = useDeleteLab();
  const navigate = useNavigate();
  const courses = useCourses();
  const [form, setForm] = useState({ title: "", instructions: "", courseId: "", chapterId: "" });
  const chapters = useChapters(form.courseId);
  const [config, setConfig] = useState<LabConfig>({ goal: {}, palette: {} });
  const kind = lab.data?.kind ?? "circuit";
  const [tryHistory, setTryHistory] = useState(() => initHistory(emptyState(kind)));
  const [tryAchieved, setTryAchieved] = useState<string[]>([]);
  const playground = useRef<HTMLDivElement>(null);
  const fs = useFullscreen(playground);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  // Initialise the form and the try-it board as soon as the lab arrives (render-phase state init).
  if (lab.data && loadedFor !== lab.data.id) {
    const d = lab.data;
    setLoadedFor(d.id);
    setForm({ title: d.title, instructions: d.instructions, courseId: d.course_id ?? "", chapterId: d.chapter_id ?? "" });
    setConfig({ goal: { ...(d.goal as Record<string, unknown>) }, palette: { ...(d.palette as Record<string, unknown>) } });
    setTryHistory(initHistory(emptyState(d.kind)));
    setTryAchieved([]);
  }

  const tryout = tryHistory.present;
  const ev = useMemo(() => evaluateState(kind, tryout, config.goal, tryAchieved), [kind, tryout, config.goal, tryAchieved]);
  if (lab.isPending) return <Loading />;
  if (lab.error) return <ErrorAlert error={lab.error} />;
  const d = lab.data!;
  const published = d.status === "published";
  const kindDef = kinds.data?.find((k) => k.kind === kind);
  const bad = Boolean((ev.result as { short_circuit?: boolean }).short_circuit) || ((ev.result as { over_bonded?: string[] }).over_bonded?.length ?? 0) > 0;

  const save = (e: FormEvent) => {
    e.preventDefault();
    update.mutate({
      title: form.title.trim(), instructions: form.instructions,
      course_id: form.courseId || null, clear_course: !form.courseId,
      chapter_id: form.courseId && form.chapterId ? form.chapterId : null, clear_chapter: !form.chapterId,
      goal: config.goal, palette: config.palette,
    });
  };
  const changeTry = (s: LabState) => {
    setTryAchieved((a) => [...new Set([...a, ...evaluateState(kind, s, config.goal, a).achieved])]);
    setTryHistory((h) => push(h, s));
  };

  return (
    <>
      <Link to="/teacher/labs" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900">← Labs</Link>
      <header className="lab-hero mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <span className="lab-hero-icon"><Icon name={KIND_ICON[kind] ?? "bolt"} size={28} /></span>
          <div>
            <p className="lab-hero-eyebrow">{KIND_LABEL[kind] ?? "Lab"} · {d.course_title ?? "Standalone"}{d.chapter_title ? ` · ${d.chapter_title}` : ""}</p>
            <h1 className="text-2xl font-semibold leading-tight">{d.title}</h1>
            <p className="text-sm text-white/80">Goal: {goalText(kind, d.goal as Record<string, unknown>)} · {d.students_started ?? 0} started · {d.students_completed ?? 0} reached it</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={published ? "green" : "slate"}>{published ? "Published" : "Draft"}</Badge>
          <Button variant={published ? "secondary" : "primary"} disabled={update.isPending} onClick={() => update.mutate({ status: published ? "draft" : "published" })}>
            {published ? "Unpublish" : "Publish to students"}
          </Button>
          <Button variant="danger" disabled={remove.isPending} onClick={() => confirm(`Delete "${d.title}" and every student's work in it?`) && remove.mutate(labId, { onSuccess: () => navigate("/teacher/labs") })}>
            Delete
          </Button>
        </div>
      </header>
      <ErrorAlert error={update.error ?? remove.error} />
      {d.visibility_note && (
        <div className={`lab-note mb-5 flex flex-wrap items-center gap-3 ${published ? "is-info" : "is-warn"}`} role="status">
          <Icon name="eye" size={16} />
          <span className="flex-1">{d.visibility_note}</span>
          {!published && <Button onClick={() => update.mutate({ status: "published" })} disabled={update.isPending}>Publish this lab</Button>}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <div ref={playground} className={`lab-playground ${fs.on ? "lab-fs" : ""}`}>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-semibold text-slate-900">Try it yourself{fs.on ? ` · ${d.title}` : ""}</h2>
              <p className="text-xs text-slate-500">What students get. Nothing you build here is saved.</p>
            </div>
            <LabBoard
              kind={kind}
              state={tryout}
              onChange={changeTry}
              palette={config.palette}
              result={ev.result}
              toolbar={
                <>
                  <Button type="button" variant="secondary" disabled={!tryHistory.past.length} onClick={() => setTryHistory(undo)}>Undo</Button>
                  <Button type="button" variant="secondary" disabled={!tryHistory.future.length} onClick={() => setTryHistory(redo)}>Redo</Button>
                  <Button type="button" variant="secondary" onClick={() => { setTryHistory(initHistory(emptyState(kind))); setTryAchieved([]); }}>Reset</Button>
                  <FullscreenButton on={fs.on} toggle={fs.toggle} className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50" />
                </>
              }
            />
            <p role="status" className={`lab-led mt-2 ${bad ? "is-bad" : ev.goal_met ? "is-ok" : "is-warn"}`}>
              <span className="lab-led-dot" aria-hidden />
              <span>{ev.message}{ev.goal_met ? " Goal reached." : ""}</span>
            </p>
            </div>
          </Card>
          <Activity labId={labId} />
        </div>

        <Card>
          <form onSubmit={save} className="space-y-3">
            <h2 className="font-semibold text-slate-900">Settings</h2>
            <Field label="Title"><Input required maxLength={200} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
            <Field label="Course" hint="Standalone labs are open to students of your courses and schools.">
              <select className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" value={form.courseId} onChange={(e) => setForm({ ...form, courseId: e.target.value, chapterId: "" })}>
                <option value="">No course (standalone)</option>
                {(courses.data ?? []).filter((c) => c.can_manage).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </Field>
            {form.courseId && (
              <Field label="Chapter">
                <select className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" value={form.chapterId} onChange={(e) => setForm({ ...form, chapterId: e.target.value })}>
                  <option value="">Whole course (no chapter)</option>
                  {chapters.data?.map((c) => <option key={c.id} value={c.id}>{c.position}. {c.title}</option>)}
                </select>
              </Field>
            )}
            <Field label="Instructions for students"><Textarea rows={4} maxLength={4000} value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} /></Field>
            <LabSettings kind={kindDef} config={config} onChange={setConfig} />
            <Button type="submit" disabled={update.isPending}>{update.isPending ? "Saving…" : "Save settings"}</Button>
            {update.isSuccess && <span className="ml-2 text-xs text-slate-500" role="status">Saved.</span>}
          </form>
        </Card>
      </div>
    </>
  );
}
