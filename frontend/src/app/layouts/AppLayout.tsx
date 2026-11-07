import { Link, NavLink, Navigate, Outlet, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";

import { useDemo } from "@/app/providers/DemoProvider";
import { Icon } from "@/components/ui/Icon";
import { getDemoUser } from "@/lib/api";

const teacherNavigation = [
  { to: "/teacher", label: "Overview", icon: "grid" as const, end: true },
  { to: "/teacher/courses", label: "My courses", icon: "book" as const },
  { to: "/teacher/upload", label: "Upload source", icon: "file" as const },
  { to: "/teacher/insights", label: "Insights", icon: "activity" as const },
];

const studentNavigation = [
  { to: "/student", label: "My learning", icon: "grid" as const, end: true },
  { to: "/student/courses/circulatory-system/lessons/heart-structure", label: "My courses", icon: "book" as const },
  { to: "/student/progress", label: "My progress", icon: "activity" as const },
];

export function AppLayout() {
  const { role, theme, setRole, toggleTheme } = useDemo();
  const navigate = useNavigate();
  const userQuery = useQuery({
    queryKey: ["demo", "user", role ?? "student"],
    queryFn: () => getDemoUser(role ?? "student"),
    enabled: Boolean(role),
  });

  if (!role) return <Navigate to="/login" replace />;
  if (userQuery.isError) throw userQuery.error;
  if (userQuery.isPending) return <p className="page-loading" role="status">Loading your profile…</p>;
  const user = userQuery.data;
  const navigation = role === "teacher" ? teacherNavigation : studentNavigation;

  function changeRole(nextRole: "teacher" | "student") {
    setRole(nextRole);
    navigate(`/${nextRole}`);
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link aria-label="Beyond Books home" className="brand" to={role === "teacher" ? "/teacher" : "/student"}>
          <span className="brand-mark"><Icon name="layers" size={19} /></span>
          <span>Beyond<span className="brand-light"> Books</span></span>
        </Link>

        <nav aria-label="Main navigation" className="topbar-nav">
          {navigation.map((item) => (
            <NavLink
              key={item.to}
              end={item.end}
              to={item.to}
              className={({ isActive }) => `nav-link${isActive ? " is-active" : ""}`}
            >
              <Icon name={item.icon} size={17} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="topbar-actions">
          <button
            aria-label={`Switch to ${role === "teacher" ? "student" : "teacher"} view`}
            className="role-switch"
            onClick={() => changeRole(role === "teacher" ? "student" : "teacher")}
            type="button"
          >
            <span className="role-switch-label">{role === "teacher" ? "Teacher" : "Student"} view</span>
            <Icon name="chevron-down" size={15} />
          </button>
          <button
            aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
            className="icon-button theme-toggle"
            onClick={toggleTheme}
            type="button"
          >
            <Icon name={theme === "light" ? "moon" : "sun"} size={18} />
          </button>
          <button aria-label={`Signed in as ${user.name}`} className="user-avatar" type="button">
            {user.initials}
          </button>
        </div>
      </header>

      <nav aria-label="Mobile navigation" className="mobile-nav">
        {navigation.map((item) => (
          <NavLink
            key={item.to}
            end={item.end}
            to={item.to}
            className={({ isActive }) => `mobile-nav-link${isActive ? " is-active" : ""}`}
          >
            <Icon name={item.icon} size={19} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <main className="page-content">
        <Outlet />
      </main>
      <footer className="app-footer">
        <span>Beyond Books</span>
        <span>Learning, brought to life.</span>
      </footer>
    </div>
  );
}
