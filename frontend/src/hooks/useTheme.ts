import { useEffect, useState } from "react";

export type Theme = "light" | "dark";
const read = (): Theme => { try { return localStorage.getItem("cp_theme") === "dark" ? "dark" : "light"; } catch { return "light"; } };

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(read);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem("cp_theme", theme); } catch { /* ignore */ }
  }, [theme]);
  return { theme, setTheme };
}
