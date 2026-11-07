import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router";
import { usePreferences } from "@/app/providers/PreferencesProvider";
import { Icon } from "@/components/ui/Icon";
import BeyondBooksLogo from "@/components/BeyondBooksLogo";
import { ErrorAlert } from "@/components/feedback";
import { homeFor, useLogin, useMe } from "./auth";

/**
 * Development-only quick sign-in: Shift+T = demo teacher, Shift+S = demo student (the accounts
 * created by scripts/seed_demo_course.py; override with VITE_DEMO_TEACHER / VITE_DEMO_STUDENT as
 * "email:password"). `import.meta.env.DEV` is false in production builds, so this is stripped there.
 */
const DEV_QUICK_LOGIN: Record<string, { email: string; password: string }> | null = import.meta.env.DEV
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
  useEffect(() => {
    if (!DEV_QUICK_LOGIN) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.shiftKey || event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
      // Typing a capital T/S in a field must still work.
      if ((event.target as HTMLElement | null)?.closest("input, textarea, select, [contenteditable='true']")) return;
      const account = DEV_QUICK_LOGIN[event.key.toUpperCase()];
      if (!account || login.isPending) return;
      event.preventDefault();
      login.mutate(account, { onSuccess: user => navigate(homeFor(user), { replace: true }) });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [login, navigate]);
  if (me.data) return <Navigate to={homeFor(me.data)} replace />;
  function submit(event: FormEvent) {
    event.preventDefault();
    login.mutate({ email, password }, { onSuccess: user => navigate(from?.startsWith("/") && !from.startsWith("//") ? from : homeFor(user), { replace: true }) });
  }
  return <main className="login-page">
    <div className="login-topbar"><Link aria-label="Beyond Books home" className="brand" to="/"><BeyondBooksLogo showWordmark size={72} variant={theme} /></Link>
      <button className="icon-button" aria-label="Toggle colour theme" onClick={toggleTheme}><Icon name={theme === "light" ? "moon" : "sun"} size={18} /></button>
    </div>
    <section aria-labelledby="login-title" className="login-card">
      <div className="login-eyebrow"><Icon name="sparkles" size={15} /> YOUR CLASSROOM, REIMAGINED</div>
      <h1 id="login-title">Learning that<br /><span>clicks into place.</span></h1>
      <p className="login-intro">Sign in to your classroom. Your account opens your teacher or student workspace.</p>
      <form onSubmit={submit} className="live-auth-form">
        <label>Email<input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></label>
        <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></label>
        <ErrorAlert error={login.error ?? me.error} />
        <button type="submit" className="button button-primary login-submit" disabled={login.isPending}>{login.isPending ? "Signing in…" : "Sign in"}<Icon name="arrow-right" size={18} /></button>
      </form>
      {DEV_QUICK_LOGIN && <p className="login-dev-hint">Dev shortcut: <kbd>Shift</kbd>+<kbd>T</kbd> teacher · <kbd>Shift</kbd>+<kbd>S</kbd> student</p>}
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
