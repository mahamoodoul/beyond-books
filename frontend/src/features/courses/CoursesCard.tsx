import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";

import { EmptyState, ErrorAlert, Loading } from "@/components/feedback";
import { Badge, Button, Card, Field, Input } from "@/components/ui";
import { useSchools } from "@/features/schools/SchoolsCard";

import { useCourses, useCreateCourse } from "./api";

export function CoursesCard() {
  const courses = useCourses();
  const schools = useSchools();
  const create = useCreateCourse();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", subject: "", grade_level: "", school_id: "" });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate(
      {
        title: form.title,
        subject: form.subject || null,
        grade_level: form.grade_level || null,
        school_id: form.school_id || null,
      },
      { onSuccess: (c) => navigate(`/teacher/courses/${c.id}`) },
    );
  };

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">Courses</h2>
        <Button onClick={() => setOpen((v) => !v)}>{open ? "Cancel" : "New course"}</Button>
      </div>
      {open && (
        <form onSubmit={submit} className="mb-4 grid gap-3 sm:grid-cols-2">
          <Field label="Title">
            <Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
          <Field label="Subject">
            <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Biology" />
          </Field>
          <Field label="Grade level">
            <Input value={form.grade_level} onChange={(e) => setForm({ ...form, grade_level: e.target.value })} placeholder="Year 9" />
          </Field>
          <Field label="School (optional)">
            <select className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" value={form.school_id} onChange={(e) => setForm({ ...form, school_id: e.target.value })}>
              <option value="">Personal course</option>
              {schools.data?.filter((s) => s.my_role !== "student").map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </Field>
          <div className="sm:col-span-2 flex items-center gap-3">
            <Button type="submit" disabled={create.isPending}>Create course</Button>
            <ErrorAlert error={create.error} />
          </div>
        </form>
      )}
      {courses.isPending && <Loading />}
      <ErrorAlert error={courses.error} />
      {courses.data?.length === 0 && (
        <EmptyState title="No courses yet">Create a course, then upload a textbook PDF.</EmptyState>
      )}
      <ul className="divide-y divide-slate-100">
        {courses.data?.map((c) => (
          <li key={c.id}>
            <Link to={`/teacher/courses/${c.id}`} className="flex items-center justify-between py-3 hover:bg-slate-50">
              <span>
                <span className="font-medium">{c.title}</span>
                {c.subject && <span className="ml-2 text-sm text-slate-500">{c.subject}</span>}
              </span>
              <Badge tone={c.status === "published" ? "green" : "slate"}>{c.status}</Badge>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
