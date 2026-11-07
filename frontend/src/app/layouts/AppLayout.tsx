import { Link, NavLink, Outlet, useNavigate } from "react-router";
import { usePreferences } from "@/app/providers/PreferencesProvider";
import { Icon } from "@/components/ui/Icon";
import BeyondBooksLogo from "@/components/BeyondBooksLogo";
import { ErrorAlert, Loading } from "@/components/feedback";
import { homeFor, useLogout, useMe } from "@/features/auth/auth";

const teacherNavigation = [
  { to: "/teacher", label: "Overview", icon: "grid" as const, end: true },
  { to: "/teacher/courses", label: "My courses", icon: "book" as const, end: false },
  { to: "/teacher/upload", label: "Upload source", icon: "file" as const, end: false },
  { to: "/teacher/assets", label: "3D library", icon: "layers" as const, end: false },
  { to: "/studio", label: "Studio", icon: "eye" as const, end: false },
  { to: "/teacher/insights", label: "Insights", icon: "activity" as const, end: false },
  { to: "/teacher/schools", label: "Schools", icon: "users" as const, end: false },
];
const studentNavigation = [
  { to: "/student", label: "My learning", icon: "grid" as const, end: true },
  { to: "/student/courses", label: "My courses", icon: "book" as const, end: false },
  { to: "/student/progress", label: "My progress", icon: "activity" as const, end: false },
];
export function AppLayout() {
  const me = useMe();
  const logout = useLogout();
  const navigate = useNavigate();
  const { theme, toggleTheme } = usePreferences();
  if (me.isPending) return <Loading />;
  if (me.error) return <ErrorAlert error={me.error} />;
  const user = me.data;
  const navigation = user?.account_type === "teacher" ? teacherNavigation : studentNavigation;
  return <div className="app-shell">
    <header className="topbar">
      <Link aria-label="Beyond Books home" className="brand" to={user ? homeFor(user) : "/"}>
        <BeyondBooksLogo showWordmark size={44} variant={theme} />
      </Link>
      <nav aria-label="Main navigation" className="topbar-nav">{navigation.map(item =>
        <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `nav-link${isActive ? " is-active" : ""}`}><Icon name={item.icon} size={17} /><span>{item.label}</span></NavLink>
      )}</nav>
      <div className="topbar-actions">
        <button aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`} className="icon-button" onClick={toggleTheme} type="button"><Icon name={theme === "light" ? "moon" : "sun"} size={18} /></button>
        <Link to="/account" className="user-avatar" aria-label={`Account: ${user?.display_name ?? "Profile"}`}>{user?.display_name.split(" ").map(p => p[0]).slice(0, 2).join("")}</Link>
        <button className="button button-secondary" disabled={logout.isPending} onClick={() => logout.mutate(undefined, { onSuccess: () => navigate("/login", { replace: true }) })}>Sign out</button>
      </div>
    </header>
    <nav aria-label="Mobile navigation" className="mobile-nav">{navigation.map(item =>
      <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `mobile-nav-link${isActive ? " is-active" : ""}`}><Icon name={item.icon} size={19} /><span>{item.label}</span></NavLink>
    )}</nav>
    <main className="page-content live-workspace"><ErrorAlert error={logout.error} /><Outlet /></main>
    <footer className="app-footer"><BeyondBooksLogo animated={false} showWordmark size={35} variant={theme} /><span>Learning, brought to life.</span></footer>
  </div>;
}
