import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState, type FormEvent } from "react";

import { api } from "@/api/client";
import type { ClassroomMemberOut, ClassroomOut, ClassroomRole, SchoolOut } from "@/api/generated/schema";
import { EmptyState, ErrorAlert, Loading } from "@/components/feedback";
import { Badge, Button, Card, Field, Input } from "@/components/ui";

export function useSchools() {
  return useQuery({ queryKey: ["schools"], queryFn: () => api.get<SchoolOut[]>("/schools") });
}

const selectClass =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30";

/** Members of one classroom, plus "add by email" for its teachers and school admins. */
function ClassroomMembers({ classroomId, canManage }: { classroomId: string; canManage: boolean }) {
  const qc = useQueryClient();
  const members = useQuery({
    queryKey: ["classroom-members", classroomId],
    queryFn: () => api.get<ClassroomMemberOut[]>(`/classrooms/${classroomId}/members`),
  });
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ClassroomRole>("student");
  const add = useMutation({
    mutationFn: () => api.post<ClassroomMemberOut>(`/classrooms/${classroomId}/members`, { email, role }),
    onSuccess: () => {
      setEmail("");
      void qc.invalidateQueries({ queryKey: ["classroom-members", classroomId] });
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    add.mutate();
  };
  const sorted = [...(members.data ?? [])].sort(
    (a, b) => (a.role === b.role ? a.user.display_name.localeCompare(b.user.display_name) : a.role === "teacher" ? -1 : 1),
  );
  const students = sorted.filter((m) => m.role === "student").length;

  return (
    <div className="mt-2 space-y-3 rounded-lg bg-slate-50 p-3">
      {members.isPending && <Loading />}
      <ErrorAlert error={members.error} />
      {members.data && (
        <>
          <p className="text-xs text-slate-500">
            {students} student{students === 1 ? "" : "s"} · {sorted.length - students} teacher{sorted.length - students === 1 ? "" : "s"}
          </p>
          {sorted.length === 0 ? (
            <p className="text-sm text-slate-500">No members yet.</p>
          ) : (
            <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto text-sm">
              {sorted.map((m) => (
                <li key={m.user.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-1.5">
                  <span className="min-w-0 break-words">
                    <span className="font-medium text-slate-900">{m.user.display_name}</span>{" "}
                    <span className="text-slate-500">{m.user.email}</span>
                  </span>
                  <Badge tone={m.role === "teacher" ? "blue" : "slate"}>{m.role}</Badge>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {canManage && (
        <form onSubmit={submit} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_9rem_auto] sm:items-end">
          <Field label="Add a member by email">
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="student@school.org" />
          </Field>
          <Field label="Role">
            <select className={selectClass} value={role} onChange={(e) => setRole(e.target.value as ClassroomRole)}>
              <option value="student">Student</option>
              <option value="teacher">Teacher</option>
            </select>
          </Field>
          <Button type="submit" disabled={add.isPending}>{add.isPending ? "Adding…" : "Add"}</Button>
        </form>
      )}
      <ErrorAlert error={add.error} />
    </div>
  );
}

function ClassroomRow({ classroom, canManage }: { classroom: ClassroomOut; canManage: boolean }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <li className="py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0 text-sm">
          <span className="font-medium text-slate-900">{classroom.name}</span>
          {classroom.academic_year && <span className="text-slate-500"> · {classroom.academic_year}</span>}
        </span>
        <Button variant="ghost" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((v) => !v)}>
          {open ? "Hide members" : "Members"}
        </Button>
      </div>
      <div id={panelId} hidden={!open}>
        {open && <ClassroomMembers classroomId={classroom.id} canManage={canManage} />}
      </div>
    </li>
  );
}

/** One school: its classrooms, and a "New classroom" form for its admins and teachers. */
function SchoolSection({ school }: { school: SchoolOut }) {
  const qc = useQueryClient();
  const canManage = school.my_role === "school_admin" || school.my_role === "teacher";
  const classrooms = useQuery({
    queryKey: ["classrooms", school.id],
    queryFn: () => api.get<ClassroomOut[]>(`/schools/${school.id}/classrooms`),
  });
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [year, setYear] = useState("");
  const create = useMutation({
    mutationFn: () => api.post<ClassroomOut>("/classrooms", { school_id: school.id, name, academic_year: year.trim() || null }),
    onSuccess: () => {
      setOpen(false);
      setName("");
      setYear("");
      void qc.invalidateQueries({ queryKey: ["classrooms", school.id] });
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="min-w-0 font-medium text-slate-900">{school.name}</h3>
        <span className="flex flex-wrap items-center gap-2">
          {school.my_role && <Badge>{school.my_role.replace("_", " ")}</Badge>}
          {canManage && (
            <Button variant="secondary" onClick={() => setOpen((v) => !v)}>{open ? "Cancel" : "New classroom"}</Button>
          )}
        </span>
      </div>
      {open && (
        <form onSubmit={submit} className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-end">
          <Field label="Classroom name">
            <Input required maxLength={200} value={name} onChange={(e) => setName(e.target.value)} placeholder="Class 9A" />
          </Field>
          <Field label="Academic year">
            <Input maxLength={20} value={year} onChange={(e) => setYear(e.target.value)} placeholder="2026/27" />
          </Field>
          <Button type="submit" disabled={create.isPending}>Create</Button>
          <div className="sm:col-span-3"><ErrorAlert error={create.error} /></div>
        </form>
      )}
      <div className="mt-2">
        {classrooms.isPending && <Loading />}
        <ErrorAlert error={classrooms.error} />
        {classrooms.data?.length === 0 && <p className="text-sm text-slate-500">No classrooms yet.</p>}
        {!!classrooms.data?.length && (
          <ul aria-label={`Classrooms in ${school.name}`} className="divide-y divide-slate-100 border-l-2 border-slate-100 pl-3">
            {classrooms.data.map((c) => <ClassroomRow key={c.id} classroom={c} canManage={canManage} />)}
          </ul>
        )}
      </div>
    </li>
  );
}

export function SchoolsCard() {
  const schools = useSchools();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const create = useMutation({
    mutationFn: () => api.post<SchoolOut>("/schools", { name, slug }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["schools"] });
      setOpen(false);
      setName("");
      setSlug("");
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Schools</h2>
        <Button variant="secondary" onClick={() => setOpen((v) => !v)}>
          {open ? "Cancel" : "New school"}
        </Button>
      </div>
      {open && (
        <form onSubmit={submit} className="mb-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label="Name">
            <Input required value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Slug">
            <Input required pattern="[a-z0-9][a-z0-9-]{1,78}[a-z0-9]" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="oslo-high" />
          </Field>
          <Button type="submit" disabled={create.isPending}>Create</Button>
          <div className="sm:col-span-3"><ErrorAlert error={create.error} /></div>
        </form>
      )}
      {schools.isPending && <Loading />}
      <ErrorAlert error={schools.error} />
      {schools.data?.length === 0 && (
        <EmptyState title="No schools yet">Courses can be teacher-owned; schools are optional for now.</EmptyState>
      )}
      <ul className="divide-y divide-slate-100">
        {schools.data?.map((s) => <SchoolSection key={s.id} school={s} />)}
      </ul>
    </Card>
  );
}
