import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";

import { useDemo } from "@/app/providers/DemoProvider";
import { Icon } from "@/components/ui/Icon";
import type { DemoRole } from "@/features/demo/types";

export function DemoLoginPage() {
  const [searchParams] = useSearchParams();
  const [selectedRole, setSelectedRole] = useState<DemoRole>(
    searchParams.get("role") === "student" ? "student" : "teacher",
  );
  const { setRole, theme, toggleTheme } = useDemo();
  const navigate = useNavigate();

  function enterDemo() {
    setRole(selectedRole);
    navigate(`/${selectedRole}`);
  }

  return (
    <main className="login-page">
      <div className="login-topbar">
        <Link aria-label="Beyond Books" className="brand" to="/login">
          <span className="brand-mark"><Icon name="layers" size={19} /></span>
          <span>Beyond<span className="brand-light"> Books</span></span>
        </Link>
        <button
          aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
          className="icon-button"
          onClick={toggleTheme}
          type="button"
        >
          <Icon name={theme === "light" ? "moon" : "sun"} size={18} />
        </button>
      </div>

      <section aria-labelledby="login-title" className="login-card">
        <div className="login-eyebrow"><Icon name="sparkles" size={15} /> YOUR CLASSROOM, REIMAGINED</div>
        <h1 id="login-title">Learning that<br /><span>clicks into place.</span></h1>
        <p className="login-intro">
          Explore big ideas, one curious moment at a time. Choose a demo view to step inside.
        </p>

        <fieldset className="role-options">
          <legend>Choose your demo role</legend>
          <button
            aria-pressed={selectedRole === "teacher"}
            className={`role-card${selectedRole === "teacher" ? " selected" : ""}`}
            onClick={() => setSelectedRole("teacher")}
            type="button"
          >
            <span className="role-icon teacher-role-icon"><Icon name="users" size={21} /></span>
            <span className="role-copy"><strong>I'm a teacher</strong><small>Build courses & see class insights</small></span>
            <span aria-hidden="true" className="role-radio">{selectedRole === "teacher" && <Icon name="check" size={14} />}</span>
          </button>
          <button
            aria-pressed={selectedRole === "student"}
            className={`role-card${selectedRole === "student" ? " selected" : ""}`}
            onClick={() => setSelectedRole("student")}
            type="button"
          >
            <span className="role-icon student-role-icon"><Icon name="lightbulb" size={21} /></span>
            <span className="role-copy"><strong>I'm a student</strong><small>Explore lessons & track your progress</small></span>
            <span aria-hidden="true" className="role-radio">{selectedRole === "student" && <Icon name="check" size={14} />}</span>
          </button>
        </fieldset>

        <button className="button button-primary login-submit" onClick={enterDemo} type="button">
          Enter the demo <Icon name="arrow-right" size={18} />
        </button>
        <p className="demo-note"><Icon name="check" size={14} /> No password needed. This is a demo workspace.</p>
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
    </main>
  );
}
