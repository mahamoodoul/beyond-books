import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router";

import { ErrorAlert } from "@/components/feedback";
import { Button, Card, Field, Input } from "@/components/ui";

import { homeFor, useLogin } from "./auth";

export function LoginPage() {
  const login = useLogin();
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    login.mutate(
      { email, password },
      { onSuccess: (user) => navigate(from ?? homeFor(user), { replace: true }) },
    );
  };

  return (
    <Card className="mx-auto max-w-md">
      <h1 className="mb-4 text-xl font-semibold">Sign in</h1>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email">
          <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password">
          <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <ErrorAlert error={login.error} />
        <Button type="submit" disabled={login.isPending} className="w-full">
          {login.isPending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      <p className="mt-4 text-sm text-slate-600">
        No account?{" "}
        <Link to="/register" className="text-accent underline">
          Create one
        </Link>
      </p>
    </Card>
  );
}
