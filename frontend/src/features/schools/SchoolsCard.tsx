import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { api } from "@/api/client";
import type { SchoolOut } from "@/api/generated/schema";
import { EmptyState, ErrorAlert, Loading } from "@/components/feedback";
import { Badge, Button, Card, Field, Input } from "@/components/ui";

export function useSchools() {
  return useQuery({ queryKey: ["schools"], queryFn: () => api.get<SchoolOut[]>("/schools") });
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
      <div className="mb-3 flex items-center justify-between">
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
        {schools.data?.map((s) => (
          <li key={s.id} className="flex items-center justify-between py-2 text-sm">
            <span>{s.name}</span>
            {s.my_role && <Badge>{s.my_role.replace("_", " ")}</Badge>}
          </li>
        ))}
      </ul>
    </Card>
  );
}
