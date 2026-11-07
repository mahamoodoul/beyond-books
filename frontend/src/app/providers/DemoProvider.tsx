import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

import type { DemoRole, Theme } from "@/features/demo/types";

interface DemoContextValue {
  role: DemoRole | null;
  theme: Theme;
  setRole: (role: DemoRole) => void;
  toggleTheme: () => void;
}

const DemoContext = createContext<DemoContextValue | null>(null);

function readRole(): DemoRole | null {
  const savedRole = localStorage.getItem("beyond-books-role");
  return savedRole === "teacher" || savedRole === "student" ? savedRole : null;
}

function readTheme(): Theme {
  return localStorage.getItem("beyond-books-theme") === "dark" ? "dark" : "light";
}

export function DemoProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<DemoRole | null>(readRole);
  const [theme, setTheme] = useState<Theme>(readTheme);

  const value = useMemo<DemoContextValue>(
    () => ({
      role,
      theme,
      setRole(nextRole) {
        localStorage.setItem("beyond-books-role", nextRole);
        setRoleState(nextRole);
      },
      toggleTheme() {
        setTheme((currentTheme) => {
          const nextTheme = currentTheme === "light" ? "dark" : "light";
          localStorage.setItem("beyond-books-theme", nextTheme);
          return nextTheme;
        });
      },
    }),
    [role, theme],
  );

  return (
    <DemoContext.Provider value={value}>
      <div data-theme={theme} className="theme-root">
        {children}
      </div>
    </DemoContext.Provider>
  );
}

export function useDemo(): DemoContextValue {
  const context = useContext(DemoContext);
  if (!context) throw new Error("useDemo must be used within DemoProvider");
  return context;
}
