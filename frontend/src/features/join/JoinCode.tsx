/**
 * Join codes: the badge a teacher shares (copy + regenerate), the code field with a live
 * preview used at sign-up and on the account page, and the affiliations list.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router";

import { api, ApiError } from "@/api/client";
import type { Affiliations, JoinPreview, JoinResult } from "@/api/generated/schema";
import { ErrorAlert } from "@/components/feedback";
import { Badge, Button, Input } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";

export const CODE_LEN = 16;
export const cleanCode = (v: string) => v.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, CODE_LEN);
/** ABCD-EFGH-JKLM-NPQR while typing. */
export const formatCode = (v: string) => cleanCode(v).replace(/(.{4})(?=.)/g, "$1-");

export function usePreview(code: string) {
  const clean = cleanCode(code);
  return useQuery({
    queryKey: ["join-preview", clean],
    queryFn: () => api.get<JoinPreview>(`/join-codes?code=${encodeURIComponent(clean)}`),
    enabled: clean.length === CODE_LEN,
    retry: false,
    staleTime: 60_000,
  });
}

/** Debounced value: the preview request waits until typing pauses. */
function useDebounced<T>(value: T, ms = 400): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Code input + what it unlocks. `role` picks which sentence to show. */
export function JoinCodeField({
  value, onChange, role, label = "School or course code", hint = "Optional. Your teacher or school gives you this.",
}: { value: string; onChange: (v: string) => void; role: "teacher" | "student"; label?: string; hint?: string }) {
  const debounced = useDebounced(value);
  const preview = usePreview(debounced);
  const clean = cleanCode(value);
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700">{label}</label>
      <Input
        value={formatCode(value)}
        onChange={(e) => onChange(cleanCode(e.target.value))}
        placeholder="e.g. BIOL-OGY1-01DE-MO26"
        data-field="join_code"
        maxLength={19}
        autoComplete="off"
        spellCheck={false}
        className="mt-1 font-mono tracking-widest"
        aria-describedby="join-code-hint"
      />
      <p id="join-code-hint" className="mt-1 text-xs text-slate-500">{hint}</p>
      {clean.length > 0 && clean.length < CODE_LEN && (
        <p className="mt-1 text-xs text-slate-500">{CODE_LEN - clean.length} more character{CODE_LEN - clean.length === 1 ? "" : "s"} to go.</p>
      )}
      {clean.length === CODE_LEN && (
        <div className="mt-2 text-sm" role="status" aria-live="polite">
          {preview.isPending && cleanCode(debounced) === clean && <p className="text-slate-500">Checking the code…</p>}
          {preview.data && (
            <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-900">
              <Icon name={preview.data.kind === "school" ? "users" : "book"} size={16} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">{preview.data.kind === "school" ? "School" : "Course"}: {preview.data.name}</p>
                {preview.data.kind === "course" && (
                  <p className="text-xs text-emerald-800">
                    {[preview.data.subject, preview.data.grade_level].filter(Boolean).join(" · ")}
                    {preview.data.teacher_name ? ` · taught by ${preview.data.teacher_name}` : ""}
                    {preview.data.school_name ? ` · ${preview.data.school_name}` : ""}
                  </p>
                )}
                <p className="mt-0.5 text-xs">{role === "teacher" ? preview.data.as_teacher : preview.data.as_student}</p>
              </div>
            </div>
          )}
          {preview.error && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
              {preview.error instanceof ApiError && preview.error.status === 404 ? "That code does not match any school or course. Check it and try again." : "Could not check the code right now."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** A code to share, with copy and (for managers) regenerate. */
export function JoinCodeBadge({ code, regeneratePath, invalidate, what }: { code: string; regeneratePath?: string; invalidate: unknown[][]; what: string }) {
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);
  const regen = useMutation({
    mutationFn: () => api.post<{ join_code: string }>(regeneratePath!),
    onSuccess: () => { for (const k of invalidate) void qc.invalidateQueries({ queryKey: k }); },
  });
  const pretty = formatCode(code);
  const copy = async () => {
    try { await navigator.clipboard.writeText(pretty); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked: the code is visible anyway */ }
  };
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-slate-500">{what} code</span>
      <code className="rounded-md bg-slate-900 px-2 py-0.5 font-mono text-sm tracking-widest text-white">{pretty}</code>
      <button type="button" onClick={copy} className="rounded-md border border-slate-300 px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-50" title="Copy the code">
        {copied ? "Copied" : "Copy"}
      </button>
      {regeneratePath && (
        <button type="button" disabled={regen.isPending} onClick={() => confirm(`Replace the ${what.toLowerCase()} code? The old one stops working.`) && regen.mutate()} className="rounded-md border border-slate-300 px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50" title="Replace the code">
          New code
        </button>
      )}
    </span>
  );
}

export const useAffiliations = () =>
  useQuery({ queryKey: ["affiliations"], queryFn: () => api.get<Affiliations>("/users/me/affiliations") });

/** Account page card: where this account belongs, plus "join with a code". */
export function AffiliationsCard({ role }: { role: "teacher" | "student" }) {
  const qc = useQueryClient();
  const aff = useAffiliations();
  const [code, setCode] = useState("");
  const join = useMutation({
    mutationFn: () => api.post<JoinResult>("/users/me/join", { code: cleanCode(code) }),
    onSuccess: () => {
      setCode("");
      for (const k of [["affiliations"], ["courses"], ["schools"], ["my-progress"], ["labs"]]) void qc.invalidateQueries({ queryKey: k });
    },
  });
  const submit = (e: FormEvent) => { e.preventDefault(); join.mutate(); };
  const data = aff.data;
  return (
    <>
      <h2 className="mb-2 font-semibold">Schools and courses</h2>
      {data && data.schools.length === 0 && data.courses.length === 0 && (
        <p className="mb-3 text-sm text-slate-600">Not part of any school or course yet. Enter a code from your teacher or school below.</p>
      )}
      {data && data.schools.length > 0 && (
        <ul className="mb-3 space-y-1.5 text-sm">
          {data.schools.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-2">
              <Icon name="users" size={14} className="text-slate-400" />
              <span className="font-medium text-slate-900">{s.name}</span>
              <Badge>{s.role}</Badge>
              {s.join_code && <JoinCodeBadge code={s.join_code.replace("-", "")} regeneratePath={`/schools/${s.id}/join-code`} invalidate={[["affiliations"], ["schools"]]} what="School" />}
            </li>
          ))}
        </ul>
      )}
      {data && data.courses.length > 0 && (
        <ul className="mb-3 space-y-1.5 text-sm">
          {data.courses.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-2">
              <Icon name="book" size={14} className="text-slate-400" />
              <Link to={role === "teacher" ? `/teacher/courses/${c.id}` : `/student/courses/${c.id}`} className="font-medium text-slate-900 hover:underline">{c.title}</Link>
              <Badge tone={c.role === "teacher" ? "blue" : "slate"}>{c.role === "teacher" ? "teaching" : "enrolled"}</Badge>
              {c.school_name && <span className="text-xs text-slate-500">{c.school_name}</span>}
              {c.join_code && <JoinCodeBadge code={c.join_code.replace("-", "")} regeneratePath={`/courses/${c.id}/join-code`} invalidate={[["affiliations"], ["courses"]]} what="Course" />}
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={submit} className="space-y-2">
        <JoinCodeField value={code} onChange={setCode} role={role} label="Join with a code" hint="A school code or a course code from your teacher." />
        <Button type="submit" disabled={join.isPending || cleanCode(code).length !== CODE_LEN}>{join.isPending ? "Joining…" : "Join"}</Button>
        {join.data && (
          <ul role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            {join.data.joined.map((line) => <li key={line}>{line}</li>)}
          </ul>
        )}
        <ErrorAlert error={join.error} />
      </form>
    </>
  );
}
