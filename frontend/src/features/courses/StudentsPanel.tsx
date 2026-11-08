import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { api } from "@/api/client";
import type { EnrollmentOut, EnrollResult } from "@/api/generated/schema";
import { EmptyState, ErrorAlert, Loading } from "@/components/feedback";
import { Button, Card, Input } from "@/components/ui";
import { JoinCodeBadge } from "@/features/join/JoinCode";

import { useCourse } from "./api";

export function StudentsPanel({ courseId }: { courseId: string }) {
  const course = useCourse(courseId);
  const qc = useQueryClient();
  const key = ["students", courseId];
  const students = useQuery({ queryKey: key, queryFn: () => api.get<EnrollmentOut[]>(`/courses/${courseId}/students`) });
  const [email, setEmail] = useState("");
  const enroll = useMutation({
    mutationFn: () => api.post<EnrollResult>(`/courses/${courseId}/enrollments`, { student_email: email }),
    onSuccess: () => {
      setEmail("");
      void qc.invalidateQueries({ queryKey: key });
      void qc.invalidateQueries({ queryKey: ["analytics", courseId] });
      void qc.invalidateQueries({ queryKey: ["course-progress", courseId] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete<void>(`/courses/${courseId}/enrollments/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: key });
      void qc.invalidateQueries({ queryKey: ["analytics", courseId] });
      void qc.invalidateQueries({ queryKey: ["course-progress", courseId] });
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    enroll.mutate();
  };

  return (
    <Card>
      <h2 className="mb-3 font-semibold">Students</h2>
      {course.data?.join_code && (
        <p className="mb-3 flex flex-wrap items-center gap-2 text-sm text-slate-600">
          Students can enrol themselves at sign-up or on their account page with the
          <JoinCodeBadge code={course.data.join_code} regeneratePath={`/courses/${courseId}/join-code`} invalidate={[["course", courseId], ["courses"], ["affiliations"]]} what="Course" />
        </p>
      )}
      <form onSubmit={submit} className="mb-4 flex gap-2">
        <Input type="email" required placeholder="student@example.com" aria-label="Student email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Button type="submit" disabled={enroll.isPending}>Enroll</Button>
      </form>
      <ErrorAlert error={enroll.error ?? remove.error ?? students.error} />
      {students.isPending && <Loading />}
      {students.data?.length === 0 && <EmptyState title="No students enrolled" />}
      <ul className="divide-y divide-slate-100">
        {students.data?.map((s) => (
          <li key={s.student.id} className="flex items-center justify-between py-2 text-sm">
            <span>{s.student.display_name} <span className="text-slate-500">{s.student.email}</span></span>
            <Button variant="ghost" onClick={() => remove.mutate(s.student.id)}>Remove</Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
