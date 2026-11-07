import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router";
import { usePreferences } from "@/app/providers/PreferencesProvider";
import { Icon } from "@/components/ui/Icon";
import BeyondBooksLogo from "@/components/BeyondBooksLogo";
import { ErrorAlert } from "@/components/feedback";
import { homeFor, useLogin, useMe } from "./auth";

export function LoginPage() {
  const { theme, toggleTheme } = usePreferences();
  const login = useLogin();
  const me = useMe();
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
