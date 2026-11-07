import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
type Theme = "light" | "dark";
const Preferences = createContext<{ theme: Theme; toggleTheme: () => void } | null>(null);
export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => localStorage.getItem("beyond-books-theme") === "dark" ? "dark" : "light");
  useEffect(() => { localStorage.setItem("beyond-books-theme", theme); }, [theme]);
  return <Preferences.Provider value={{ theme, toggleTheme: () => setTheme(t => t === "light" ? "dark" : "light") }}>
    <div data-theme={theme} className="theme-root">{children}</div>
  </Preferences.Provider>;
}
export function usePreferences() {
  const value = useContext(Preferences);
  if (!value) throw new Error("PreferencesProvider is missing");
  return value;
}
