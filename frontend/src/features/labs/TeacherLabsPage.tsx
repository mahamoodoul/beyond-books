/**
 * Teacher Labs tab: every lab in the teacher's courses, and a form to create one of any kind.
 */
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";

import type { LabOut } from "@/api/generated/schema";
import { EmptyState, ErrorAlert, Loading } from "@/components/feedback";
import { Badge, Button, Field, Input, Textarea } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { useChapters } from "@/features/chapters/api";
import { useCourses } from "@/features/courses/api";

import { useCreateLab, useLabKinds, useLabs } from "./api";
import { KIND_ICON, KIND_LABEL } from "./engines";
import { defaultConfig, LabSettings, type LabConfig } from "./LabSettings";
import "./labs.css";

const DEFAULT_TEXT: Record<string, { title: string; instructions: string }> = {
  circuit: { title: "Light the bulb", instructions: "Connect the battery to the bulb with wires so the bulb lights up. Then add a switch and use it to turn the bulb on and off." },
  molecules: { title: "Build water, carbon dioxide and methane", instructions: "Drag atoms onto the board and bond them. Every atom must have exactly the bonds it wants. Look at the shape of each finished molecule." },
  orbits: { title: "Planets, eclipses and seasons", instructions: "Run time and compare how long each planet's year is. Line up the Sun, Earth and Moon to make a solar and a lunar eclipse. Then tilt Earth and find out what really causes the seasons." },
  tectonics: { title: "Moving plates and earthquakes", instructions: "Move the plates at different boundaries and watch what millions of years do: trenches, volcanoes, mountains, new ocean floor. Then look inside the Earth and follow earthquake waves through it." },
  respiration: { title: "How do we breathe?", instructions: "Breathe in and out and watch the diaphragm, ribs and lungs. Then go for a run: change how fast and how deep you breathe to keep your blood oxygen up. Finally zoom into an alveolus and follow oxygen into the blood." },
  buoyancy: { title: "Float or sink?", instructions: "Drop different objects into the tank and change the liquid. Watch the forces, then drag the pressure probe down and see how pressure grows with depth." },
};

function ChapterSelect({ courseId, value, onChange }: { courseId: string; value: string; onChange: (v: string) => void }) {
  const chapters = useChapters(courseId);
  return (
    <select className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Whole course (no chapter)</option>
      {chapters.data?.map((c) => <option key={c.id} value={c.id}>{c.position}. {c.title}</option>)}
    </select>
  );
}

function NewLabForm({ onDone }: { onDone: () => void }) {
  const courses = useCourses();
  const kinds = useLabKinds();
  const create = useCreateLab();
  const navigate = useNavigate();
  const mine = (courses.data ?? []).filter((c) => c.can_manage);
  const [kind, setKind] = useState("circuit");
  const [config, setConfig] = useState<LabConfig | null>(null);
  const [form, setForm] = useState({ courseId: "none", chapterId: "", title: DEFAULT_TEXT.circuit!.title, instructions: DEFAULT_TEXT.circuit!.instructions });
  const courseId = form.courseId === "none" ? "" : form.courseId;
  const kindDef = kinds.data?.find((k) => k.kind === kind);
  const cfg = config ?? defaultConfig(kindDef);
  const pickKind = (k: string) => {
    setKind(k);
    setConfig(null);
    const t = DEFAULT_TEXT[k];
    if (t) setForm({ ...form, title: t.title, instructions: t.instructions });
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate(
      { courseId: courseId || null, body: { kind, title: form.title.trim(), chapter_id: courseId ? form.chapterId || null : null, instructions: form.instructions, goal: cfg.goal, palette: cfg.palette } },
      { onSuccess: (lab) => { onDone(); navigate(`/teacher/labs/${lab.id}`); } },
    );
  };
  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm" aria-label="New lab">
      <h2 className="font-semibold text-slate-900">New lab</h2>
      <div className="grid gap-2 sm:grid-cols-3">
        {(kinds.data ?? []).map((k) => (
          <button key={k.kind} type="button" onClick={() => pickKind(k.kind)} className={`flex items-start gap-3 rounded-xl border p-3 text-left transition ${kind === k.kind ? "border-navy-900 bg-navy-900/5 ring-1 ring-navy-900" : "border-slate-200 hover:bg-slate-50"}`}>
            <span className="lab-card-icon grid h-9 w-9 shrink-0 place-items-center rounded-lg"><Icon name={KIND_ICON[k.kind] ?? "bolt"} size={18} /></span>
            <span><span className="block font-medium text-slate-900">{k.title}</span><span className="block text-xs text-slate-500">{k.description}</span></span>
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Course (optional)" hint="Without a course the lab is standalone: open to students of your courses and schools in their Labs tab.">
          <select className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" value={form.courseId} onChange={(e) => setForm({ ...form, courseId: e.target.value, chapterId: "" })}>
            <option value="none">No course (standalone)</option>
            {mine.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </Field>
        <Field label="Chapter (optional)">
          {courseId ? <ChapterSelect courseId={courseId} value={form.chapterId} onChange={(v) => setForm({ ...form, chapterId: v })} /> : <span className="text-sm text-slate-500">Pick a course to attach the lab to a chapter</span>}
        </Field>
        <Field label="Title"><Input required maxLength={200} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
        <div className="sm:col-span-2">
          <Field label="Instructions for students"><Textarea rows={2} maxLength={4000} value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} /></Field>
        </div>
        <div className="space-y-3 sm:col-span-2">
          <LabSettings kind={kindDef} config={cfg} onChange={setConfig} />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit" disabled={create.isPending || !form.title.trim()}>{create.isPending ? "Creating…" : "Create lab"}</Button>
        <Button type="button" variant="secondary" onClick={onDone}>Cancel</Button>
        <ErrorAlert error={create.error} />
      </div>
    </form>
  );
}

function LabCard({ lab }: { lab: LabOut }) {
  const published = lab.status === "published";
  return (
    <li>
      <Link to={`/teacher/labs/${lab.id}`} className="lab-card lab-card-3d flex h-full flex-col gap-2 rounded-2xl p-4 no-underline">
        <div className="flex items-start justify-between gap-2">
          <span className="lab-card-icon grid h-10 w-10 shrink-0 place-items-center rounded-xl"><Icon name={KIND_ICON[lab.kind] ?? "bolt"} size={18} /></span>
          <Badge tone={published ? "green" : "slate"}>{published ? "Published" : "Draft"}</Badge>
        </div>
        <h3 className="lab-card-title font-semibold">{lab.title}</h3>
        <p className="lab-card-meta text-xs">{KIND_LABEL[lab.kind] ?? lab.kind} · {lab.course_title ?? "Standalone"}{lab.chapter_title ? ` · ${lab.chapter_title}` : ""}</p>
        <p className="lab-card-meta mt-auto pt-2 text-xs">
          <strong className="lab-card-title">{lab.students_started ?? 0}</strong> started · <strong className="lab-card-title">{lab.students_completed ?? 0}</strong> reached the goal
        </p>
      </Link>
    </li>
  );
}

export function TeacherLabsPage() {
  const labs = useLabs();
  const [adding, setAdding] = useState(false);
  return (
    <>
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="text-2xl font-semibold text-navy-950">Labs</h1>
          <p className="text-sm text-slate-600">Hands-on tasks: circuits, molecules, floating and sinking. Students build; you watch it happen.</p>
        </div>
        <Button onClick={() => setAdding(!adding)} variant={adding ? "secondary" : "primary"}><Icon name="plus" size={16} /> New lab</Button>
      </div>
      {adding && <div className="mb-5"><NewLabForm onDone={() => setAdding(false)} /></div>}
      {labs.isPending && <Loading />}
      <ErrorAlert error={labs.error} />
      {labs.data?.length === 0 && !adding && (
        <EmptyState title="No labs yet">Create one: pick a kind, a course, a goal, and publish it to students.</EmptyState>
      )}
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {labs.data?.map((lab) => <LabCard key={lab.id} lab={lab} />)}
      </ul>
    </>
  );
}
