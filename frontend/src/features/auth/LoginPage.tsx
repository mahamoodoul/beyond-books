import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from "react-router";
import { usePreferences } from "@/app/providers/PreferencesProvider";
import { Icon } from "@/components/ui/Icon";
import BeyondBooksLogo from "@/components/BeyondBooksLogo";
import { ApiError } from "@/api/client";
import { ErrorAlert } from "@/components/feedback";
import { homeFor, useLogin, useMe } from "./auth";

type Role = "student" | "teacher";

/**
 * Demo sign-in: Shift+T = demo teacher, Shift+S = demo student, plus a "Use the demo account"
 * button (the accounts created by scripts/seed_demo_course.py; override with VITE_DEMO_TEACHER /
 * VITE_DEMO_STUDENT as "email:password"). Always on in development; a deployment opts in with the
 * build-time flag VITE_DEMO_LOGIN=true (the demo credentials are then part of the public bundle).
 */
const DEMO_LOGIN_ENABLED = import.meta.env.DEV || import.meta.env.VITE_DEMO_LOGIN === "true";
const DEV_QUICK_LOGIN: Record<string, { email: string; password: string }> | null = DEMO_LOGIN_ENABLED
  ? {
      T: credentials(import.meta.env.VITE_DEMO_TEACHER, "teacher@example.com:teacher-demo-123"),
      S: credentials(import.meta.env.VITE_DEMO_STUDENT, "student@example.com:student-demo-123"),
    }
  : null;

function credentials(value: string | undefined, fallback: string) {
  const [email = "", ...rest] = (value || fallback).split(":");
  return { email, password: rest.join(":") };
}

export function LoginPage() {
  const { theme, toggleTheme } = usePreferences();
  const login = useLogin();
  const me = useMe();
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [searchParams] = useSearchParams();
  const [role, setRole] = useState<Role>(searchParams.get("role") === "teacher" ? "teacher" : "student");
  // Email of the demo account last tried, so a 401 can say "not set up here" instead of "wrong password".
  const [demoAttempt, setDemoAttempt] = useState<string | null>(null);
  useEffect(() => {
    if (!DEV_QUICK_LOGIN) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.shiftKey || event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
      // Typing a capital T/S in a field must still work.
      if ((event.target as HTMLElement | null)?.closest("input, textarea, select, [contenteditable='true']")) return;
      const key = event.key.toUpperCase();
      const account = DEV_QUICK_LOGIN[key];
      if (!account || login.isPending) return;
      event.preventDefault();
      setRole(key === "T" ? "teacher" : "student");
      setDemoAttempt(account.email);
      login.mutate(account, { onSuccess: user => navigate(homeFor(user), { replace: true }) });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [login, navigate]);
  if (me.data) return <Navigate to={homeFor(me.data)} replace />;
  function submit(event: FormEvent) {
    event.preventDefault();
    setDemoAttempt(null);
    login.mutate({ email, password, role }, { onSuccess: user => navigate(from?.startsWith("/") && !from.startsWith("//") ? from : homeFor(user), { replace: true }) });
  }
  return <main id="main-content" tabIndex={-1} data-page-title="Sign in" className="login-page">
    <div className="login-topbar"><Link aria-label="Beyond Books home" className="brand" to="/"><BeyondBooksLogo showWordmark size={72} variant={theme} /></Link>
      <button className="icon-button" aria-label="Toggle colour theme" onClick={toggleTheme}><Icon name={theme === "light" ? "moon" : "sun"} size={18} /></button>
    </div>
    <section aria-labelledby="login-title" className="login-card">
      <div className="login-eyebrow"><Icon name="sparkles" size={15} /> YOUR CLASSROOM, REIMAGINED</div>
      <h1 id="login-title">Learning that<br /><span>clicks into place.</span></h1>
      <p className="login-intro">Choose how you’re signing in, then enter your account details.</p>
      <form onSubmit={submit} className="live-auth-form">
        <fieldset className="role-options login-role-options">
          <legend>I’m signing in as</legend>
          {([
            { id: "student", title: "I’m a student", hint: "Explore lessons and track your progress", icon: "lightbulb" },
            { id: "teacher", title: "I’m a teacher", hint: "Build courses and see class insights", icon: "users" },
          ] as const).map((option) => (
            <button
              aria-pressed={role === option.id}
              className={`role-card${role === option.id ? " selected" : ""}`}
              key={option.id}
              onClick={() => { setRole(option.id); login.reset(); }}
              type="button"
            >
              <span className={`role-icon ${option.id}-role-icon`}><Icon name={option.icon} size={21} /></span>
              <span className="role-copy"><strong>{option.title}</strong><small>{option.hint}</small></span>
              <span aria-hidden="true" className="role-radio">{role === option.id && <Icon name="check" size={14} />}</span>
            </button>
          ))}
        </fieldset>
        <label>Email<input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></label>
        <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></label>
        {demoAttempt && login.error instanceof ApiError && login.error.status === 401 ? (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
            The demo account {demoAttempt} isn’t set up on this server yet.{" "}
            {import.meta.env.DEV ? <>Create it with <code>make seed-demo</code>.</> : "Sign in with your own account, or create one."}
          </p>
        ) : (
          <ErrorAlert error={login.error ?? me.error} />
        )}
        <button type="submit" className="button button-primary login-submit" disabled={login.isPending}>{login.isPending ? "Signing in…" : `Sign in as ${role}`}<Icon name="arrow-right" size={18} /></button>
      </form>
      {DEV_QUICK_LOGIN && (
        <div className="login-demo">
          <button
            className="button button-secondary login-demo-button"
            disabled={login.isPending}
            onClick={() => { const account = DEV_QUICK_LOGIN[role === "teacher" ? "T" : "S"]; if (account) { setDemoAttempt(account.email); login.mutate(account, { onSuccess: user => navigate(homeFor(user), { replace: true }) }); } }}
            type="button"
          >
            Use the demo {role} account
          </button>
          <p className="login-dev-hint">Shortcut: <kbd>Shift</kbd>+<kbd>T</kbd> teacher · <kbd>Shift</kbd>+<kbd>S</kbd> student</p>
        </div>
      )}
      <p className="demo-note">New here? <Link className="text-link" to="/register">Create an account</Link></p>
    </section>
      <aside aria-label="Learning illustration" className="login-art">
        <div className="art-glow" />
        <div className="art-orbit orbit-one" />
        <div className="art-orbit orbit-two" />
        <div className="art-sphere"><span className="sphere-core" /><span className="sphere-ring" /></div>
        <div className="art-note art-note-top"><span className="note-dot violet-dot" /> Biology <span>•</span> 3D lesson</div>
        <div className="art-note art-note-bottom"><Icon name="sparkles" size={15} /> See the unseen.</div>
        <div className="art-caption">From the page<br />to the possible.</div>
      </aside>
    <div className="login-legal">© 2026 Beyond Books <span>·</span> Made for curious minds</div>
  </main>;
}
