import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router";

import { fieldErrors } from "@/api/client";
import { ErrorAlert } from "@/components/feedback";
import { Button, Card, Field, Input } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { JoinCodeField } from "@/features/join/JoinCode";

import { homeFor, useDemoMode, useLogin, useRegister } from "./auth";
import { generatePassword, passwordProblems, passwordStrength } from "./password";

type Role = "teacher" | "student";

const ROLES: { value: Role; label: string; blurb: string; icon: "users" | "book" }[] = [
  { value: "teacher", label: "Teacher", blurb: "Build courses, labs and quizzes", icon: "users" },
  { value: "student", label: "Student", blurb: "Learn with 3D, labs and quizzes", icon: "book" },
];
const STRENGTH = ["", "Weak", "Fair", "Good", "Strong"];
const STRENGTH_COLOR = ["", "bg-red-500", "bg-amber-500", "bg-lime-500", "bg-emerald-600"];

/** Teacher / student as a two-way switch (a radio group under the hood). */
function RoleSwitch({ value, onChange }: { value: Role; onChange: (r: Role) => void }) {
  return (
    <fieldset>
      <legend className="text-sm font-medium text-slate-700">I am a</legend>
      <div role="radiogroup" aria-label="Account type" className="mt-1 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
        {ROLES.map((r) => {
          const on = value === r.value;
          return (
            <label
              key={r.value}
              className={`flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${on ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200" : "text-slate-600 hover:text-slate-900"}`}
            >
              <input type="radio" name="account_type" value={r.value} checked={on} onChange={() => onChange(r.value)} className="sr-only" />
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${on ? "bg-navy-900 text-white" : "bg-slate-200 text-slate-600"}`}>
                <Icon name={r.icon} size={15} />
              </span>
              <span className="min-w-0">
                <span className="block font-medium">{r.label}</span>
                <span className="block text-xs text-slate-500">{r.blurb}</span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function RegisterPage() {
  const register = useRegister();
  const login = useLogin();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    email: "",
    password: "",
    display_name: "",
    account_type: "teacher" as Role,
    join_code: "",
  });
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [summary, setSummary] = useState<string[]>([]);
  const [showPw, setShowPw] = useState(false);
  const [copied, setCopied] = useState(false);
  const suggest = () => {
    const pw = generatePassword();
    setForm((f) => ({ ...f, password: pw }));
    setShowPw(true);
    touch("password");
    register.reset();
  };
  const copyPw = async () => {
    try { await navigator.clipboard.writeText(form.password); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked; the password is visible */ }
  };
  const touch = (k: string) => setTouched((t) => ({ ...t, [k]: true }));

  // Live warnings (shown once a field has been touched), server errors after submit.
  const server = fieldErrors(register.error);
  const nameWarn = touched.display_name && !form.display_name.trim() ? "Please enter your name." : null;
  const emailWarn = touched.email && form.email && !EMAIL_RE.test(form.email) ? "That does not look like an email address." : null;
  const pwProblems = passwordProblems(form.password, form.email, form.display_name);
  const pwWarn = touched.password && pwProblems.length ? pwProblems[0]! : null;
  const strength = passwordStrength(form.password);
  const codeClean = form.join_code.replace(/[^a-z0-9]/gi, "");
  const codeWarn = touched.join_code && codeClean && codeClean.length !== 16 ? `A code has 16 characters (${codeClean.length} so far).` : null;
  const blocked = !form.display_name.trim() || !EMAIL_RE.test(form.email) || pwProblems.length > 0 || (codeClean.length > 0 && codeClean.length !== 16);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched({ display_name: true, email: true, password: true, join_code: true });
    if (blocked) {
      const problems: [string, string][] = [];
      if (!form.display_name.trim()) problems.push(["display_name", "Full name is missing."]);
      if (!EMAIL_RE.test(form.email)) problems.push(["email", form.email ? "The email address is not valid." : "Email is missing."]);
      if (pwProblems.length) problems.push(["password", `Password: ${pwProblems[0]}`]);
      if (codeClean.length > 0 && codeClean.length !== 16) problems.push(["join_code", `Code: ${codeClean.length} of 16 characters typed.`]);
      setSummary(problems.map((x) => x[1]));
      const first = problems[0]?.[0];
      const input = first ? (e.currentTarget as HTMLFormElement).querySelector<HTMLInputElement>(`input[data-field="${first}"]`) : null;
      input?.focus();
      input?.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    setSummary([]);
    register.mutate({ ...form, join_code: codeClean.toUpperCase() || null }, {
      onSuccess: () =>
        login.mutate(
          { email: form.email, password: form.password },
          { onSuccess: (user) => navigate(homeFor(user), { replace: true }) },
        ),
    });
  };
  const busy = register.isPending || login.isPending;
  const generalError = register.error && Object.keys(server).length === 0 ? register.error : login.error;

  const demo = useDemoMode();
  if (demo.enabled) return <Navigate to="/login" replace />; // demo mode: no accounts to create

  return (
    <main id="main-content" tabIndex={-1} data-page-title="Create an account">
    <Card className="auth-register">
      <h1 className="mb-1 text-xl font-semibold">Create account</h1>
      <p className="mb-4 text-sm text-slate-600">Takes a minute. Have a code from your school or teacher? Add it below and you are enrolled right away.</p>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <RoleSwitch value={form.account_type} onChange={(account_type) => setForm((f) => ({ ...f, account_type }))} />
        <Field label="Full name" warning={nameWarn} error={server.display_name}>
          <Input
            required
            maxLength={120}
            autoComplete="name"
            data-field="display_name"
            aria-invalid={!!(nameWarn || server.display_name)}
            placeholder={form.account_type === "teacher" ? "e.g. Ingrid Hansen" : "e.g. Daniel Berg"}
            value={form.display_name}
            onBlur={() => touch("display_name")}
            onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
          />
        </Field>
        <Field label="Email" warning={emailWarn} error={server.email}>
          <Input
            type="email"
            autoComplete="email"
            required
            data-field="email"
            aria-invalid={!!(emailWarn || server.email)}
            placeholder={form.account_type === "teacher" ? "you@school.no" : "you@example.com"}
            value={form.email}
            onBlur={() => touch("email")}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          />
        </Field>
        <Field
          label="Password"
          hint="12+ characters mixing letters with numbers or symbols, or a 16+ character passphrase. Not your name or email."
          warning={pwWarn}
          error={server.password}
        >
          <span className="flex gap-2">
            <Input
              type={showPw ? "text" : "password"}
              autoComplete="new-password"
              minLength={12}
              required
              data-field="password"
              aria-invalid={!!(pwWarn || server.password)}
              placeholder="e.g. purple-heart-beats-fast"
              value={form.password}
              onBlur={() => touch("password")}
              onChange={(e) => { setForm((f) => ({ ...f, password: e.target.value })); if (e.target.value.length >= 8) touch("password"); }}
            />
            <button type="button" onClick={() => setShowPw((v) => !v)} className="shrink-0 rounded-md border border-slate-300 px-2.5 text-xs text-slate-700 hover:bg-slate-50" aria-pressed={showPw} title={showPw ? "Hide password" : "Show password"}>
              <Icon name="eye" size={14} />
            </button>
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-2 text-xs">
            <button type="button" onClick={suggest} className="inline-flex items-center gap-1 rounded-md bg-navy-900/5 px-2 py-1 font-medium text-navy-700 hover:bg-navy-900/10">
              <Icon name="sparkles" size={12} /> Suggest a strong password
            </button>
            {showPw && form.password && (
              <>
                <button type="button" onClick={copyPw} className="rounded-md border border-slate-300 px-2 py-1 text-slate-700 hover:bg-slate-50">{copied ? "Copied" : "Copy"}</button>
                <span className="text-slate-500">Save it in your password manager before you continue.</span>
              </>
            )}
          </span>
          {form.password && (
            <span className="mt-1 flex items-center gap-2" aria-live="polite">
              <span className="flex h-1.5 flex-1 gap-1" aria-hidden>
                {[1, 2, 3, 4].map((i) => <span key={i} className={`flex-1 rounded-full ${i <= strength ? STRENGTH_COLOR[strength] : "bg-slate-200"}`} />)}
              </span>
              <span className="text-xs text-slate-500">{STRENGTH[strength] || "Too short"}</span>
            </span>
          )}
        </Field>
        <div>
          <JoinCodeField
            value={form.join_code}
            onChange={(v) => { setForm((f) => ({ ...f, join_code: v })); touch("join_code"); }}
            role={form.account_type}
            hint={form.account_type === "teacher" ? "Optional. A school code from a colleague adds you to the school." : "Optional. Your teacher's course code or your school's code enrols you straight away."}
          />
          {(codeWarn || server.join_code) && (
            <p role={server.join_code ? "alert" : "status"} className={`mt-1 text-xs font-medium ${server.join_code ? "text-red-700" : "text-amber-700"}`}>{server.join_code ?? codeWarn}</p>
          )}
        </div>
        {summary.length > 0 && (
          <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <p className="font-medium">Almost there. Please fix:</p>
            <ul className="mt-1 list-disc pl-5">{summary.map((line) => <li key={line}>{line}</li>)}</ul>
          </div>
        )}
        <ErrorAlert error={generalError} />
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? "Creating…" : `Create ${form.account_type} account`}
        </Button>
      </form>
      <p className="mt-4 text-sm text-slate-600">
        Already registered?{" "}
        <Link to="/login" className="text-accent underline">
          Sign in
        </Link>
      </p>
    </Card>
    </main>
  );
}
