import { Link, NavLink, Outlet, useNavigate } from "react-router";

import { homeFor, useLogout, useMe } from "@/features/auth/auth";

const navClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-2 text-sm font-medium ${
    isActive ? "bg-navy-700 text-white" : "text-slate-200 hover:bg-navy-900"
  }`;

export function AppLayout() {
  const me = useMe();
  const logout = useLogout();
  const navigate = useNavigate();
  const user = me.data;

  return (
    <div className="min-h-screen bg-surface font-sans text-slate-900">
      <header className="bg-navy-950">
        <nav className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-3" aria-label="Main">
          <Link to={user ? homeFor(user) : "/"} className="mr-6 text-lg font-semibold text-white">
            Edu3D AI
          </Link>
          {user?.account_type === "teacher" && (
            <>
              <NavLink to="/teacher" end className={navClass}>Courses</NavLink>
              <NavLink to="/teacher/assets" className={navClass}>3D library</NavLink>
            </>
          )}
          {user?.account_type === "student" && (
            <NavLink to="/student" className={navClass}>My learning</NavLink>
          )}
          <NavLink to="/viewer" className={navClass}>3D viewer</NavLink>
          <div className="ml-auto flex items-center gap-3">
            {user ? (
              <>
                <NavLink to="/account" className="text-sm text-slate-300 hover:text-white">{user.display_name}</NavLink>
                <button
                  className="rounded-md px-3 py-2 text-sm text-slate-200 hover:bg-navy-900"
                  onClick={() => logout.mutate(undefined, { onSettled: () => navigate("/login") })}
                >
                  Sign out
                </button>
              </>
            ) : (
              <NavLink to="/login" className={navClass}>Sign in</NavLink>
            )}
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
