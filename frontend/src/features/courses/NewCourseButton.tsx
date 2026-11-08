/**
 * "New course": a small dialog (title, subject, grade, description). Creates the course and
 * opens it; a new course starts on "Sources & outline", where the textbook PDF is uploaded.
 */
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router";

import { ErrorAlert } from "@/components/feedback";

import { useCreateCourse } from "./api";

const field = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-navy-900 focus:outline-none focus:ring-2 focus:ring-navy-900/20";

export function NewCourseButton({ className, children }: { className?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const create = useCreateCourse();
  const navigate = useNavigate();
  const [form, setForm] = useState({ title: "", subject: "", grade_level: "", description: "" });
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate(
      {
        title: form.title.trim(),
        subject: form.subject.trim() || null,
        grade_level: form.grade_level.trim() || null,
        description: form.description.trim(),
      },
      { onSuccess: (c) => navigate(`/teacher/courses/${c.id}`) },
    );
  };

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {children}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-course-title"
            onSubmit={submit}
            className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6 text-left shadow-2xl"
          >
            <div>
              <h2 id="new-course-title" className="text-xl font-semibold text-slate-900">New course</h2>
              <p className="mt-1 text-sm text-slate-500">Next, upload the textbook PDF in the course and let AI propose the chapters.</p>
            </div>
            <label className="block space-y-1">
              <span className="text-sm font-medium text-slate-700">Course title</span>
              <input ref={first} required maxLength={200} className={field} placeholder="e.g. Biology: Cells and Energy" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block space-y-1">
                <span className="text-sm font-medium text-slate-700">Subject</span>
                <input maxLength={80} className={field} placeholder="Biology" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-medium text-slate-700">Grade level</span>
                <input maxLength={40} className={field} placeholder="Year 10" value={form.grade_level} onChange={(e) => setForm({ ...form, grade_level: e.target.value })} />
              </label>
            </div>
            <label className="block space-y-1">
              <span className="text-sm font-medium text-slate-700">Description <span className="font-normal text-slate-400">(optional)</span></span>
              <textarea rows={3} maxLength={5000} className={field} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </label>
            <ErrorAlert error={create.error} />
            <div className="flex justify-end gap-2">
              <button type="button" className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50" onClick={() => setOpen(false)}>Cancel</button>
              <button type="submit" disabled={create.isPending || !form.title.trim()} className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-medium text-white hover:bg-navy-700 disabled:opacity-60">
                <span className="text-white">{create.isPending ? "Creating…" : "Create course"}</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
