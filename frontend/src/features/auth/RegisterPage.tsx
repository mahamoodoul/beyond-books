import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";

import { ErrorAlert } from "@/components/feedback";
import { Button, Card, Field, Input } from "@/components/ui";

import { homeFor, useLogin, useRegister } from "./auth";

export function RegisterPage() {
  const register = useRegister();
  const login = useLogin();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    email: "",
    password: "",
    display_name: "",
    account_type: "teacher" as "teacher" | "student",
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    register.mutate(form, {
      onSuccess: () =>
        login.mutate(
          { email: form.email, password: form.password },
          { onSuccess: (user) => navigate(homeFor(user), { replace: true }) },
        ),
    });
  };
  const busy = register.isPending || login.isPending;

  return (
    <main id="main-content" tabIndex={-1} data-page-title="Create an account">
    <Card className="auth-register">
      <h1 className="mb-4 text-xl font-semibold">Create account</h1>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Name">
          <Input required value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
        </Field>
        <Field label="Email">
          <Input type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="Password" hint="At least 12 characters.">
          <Input type="password" autoComplete="new-password" minLength={12} required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </Field>
        <fieldset>
          <legend className="text-sm font-medium text-slate-700">I am a</legend>
          <div className="mt-1 flex gap-4">
            {(["teacher", "student"] as const).map((t) => (
              <label key={t} className="flex items-center gap-2 text-sm capitalize">
                <input type="radio" name="account_type" checked={form.account_type === t} onChange={() => setForm({ ...form, account_type: t })} />
                {t}
              </label>
            ))}
          </div>
        </fieldset>
        <ErrorAlert error={register.error ?? login.error} />
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? "Creating…" : "Create account"}
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
