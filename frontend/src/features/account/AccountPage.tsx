import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";

import { api, apiFetch } from "@/api/client";
import { ErrorAlert } from "@/components/feedback";
import { Button, Card, Field, Input, PageHeader } from "@/components/ui";
import { useMe } from "@/features/auth/auth";

export function AccountPage() {
  const me = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  // null until edited: the field shows the current name.
  const [name, setName] = useState<string | null>(null);
  const currentName = me.data?.display_name ?? "";
  const nameValue = name ?? currentName;
  const [password, setPassword] = useState("");
  const rename = useMutation({
    mutationFn: () => api.patch("/users/me", { display_name: nameValue.trim() }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["me"] });
      setName(null);
    },
  });
  const exportData = useMutation({
    mutationFn: () => api.get<unknown>("/users/me/export"),
    onSuccess: (data) => {
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const a = Object.assign(document.createElement("a"), { href: url, download: "beyond-books-my-data.json" });
      a.click();
      URL.revokeObjectURL(url);
    },
  });
  const del = useMutation({
    mutationFn: () => apiFetch<void>("/users/me", { method: "DELETE", body: JSON.stringify({ password }) }),
    onSuccess: () => {
      qc.clear();
      navigate("/", { replace: true });
    },
  });
  const submitDelete = (e: FormEvent) => {
    e.preventDefault();
    if (confirm("Permanently delete your account and learning data? This cannot be undone.")) del.mutate();
  };

  return (
    <>
      <PageHeader title="Account" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold">Profile</h2>
          <p className="mb-3 text-sm text-slate-600">{me.data?.email} · {me.data?.account_type}</p>
          <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); rename.mutate(); }}>
            <div className="min-w-0 flex-1">
              <Field label="Display name">
                <Input value={nameValue} maxLength={120} onChange={(e) => { setName(e.target.value); rename.reset(); }} required />
              </Field>
            </div>
            <Button type="submit" disabled={rename.isPending || !nameValue.trim() || nameValue.trim() === currentName}>Save</Button>
          </form>
          {rename.isSuccess && <p role="status" className="mt-2 text-sm text-slate-600">Name saved.</p>}
          <ErrorAlert error={rename.error} />
        </Card>
        <Card>
          <h2 className="mb-2 font-semibold">Your data</h2>
          <p className="mb-3 text-sm text-slate-600">Download a copy of the personal data Beyond Books holds about you (JSON).</p>
          <Button variant="secondary" disabled={exportData.isPending} onClick={() => exportData.mutate()}>Download my data</Button>
          <ErrorAlert error={exportData.error} />
        </Card>
        <Card className="border-red-200 lg:col-span-2">
          <h2 className="mb-2 font-semibold text-red-800">Delete account</h2>
          <p className="mb-3 text-sm text-slate-600">Removes your account, progress, quiz attempts and learning events. Teachers must first transfer or delete their courses.</p>
          <form onSubmit={submitDelete} className="flex flex-wrap items-end gap-2">
            <Field label="Confirm with your password">
              <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <Button type="submit" variant="danger" disabled={del.isPending}>Delete my account</Button>
          </form>
          <ErrorAlert error={del.error} />
        </Card>
      </div>
    </>
  );
}
