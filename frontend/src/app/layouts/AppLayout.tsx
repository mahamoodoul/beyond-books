import { NavLink, Outlet } from "react-router";

const navClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-2 text-sm font-medium ${
    isActive ? "bg-navy-700 text-white" : "text-slate-200 hover:bg-navy-900"
  }`;

export function AppLayout() {
  return (
    <div className="min-h-screen bg-surface font-sans text-slate-900">
      <header className="bg-navy-950">
        <nav className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-3" aria-label="Main">
          <span className="mr-6 text-lg font-semibold text-white">Edu3D AI</span>
          <NavLink to="/" end className={navClass}>
            Home
          </NavLink>
          <NavLink to="/viewer" className={navClass}>
            3D Viewer
          </NavLink>
          <NavLink to="/teacher" className={navClass}>
            Teacher
          </NavLink>
          <NavLink to="/student" className={navClass}>
            Student
          </NavLink>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
