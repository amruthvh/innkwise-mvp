"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { SessionProvider } from "next-auth/react";

export type ThemePreference = "light" | "dark" | "auto";

type ThemeContextValue = {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
};

const THEME_STORAGE_KEY = "innkwise_theme_preference";
const ThemeContext = createContext<ThemeContextValue | null>(null);

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider>{children}</ThemeProvider>
    </SessionProvider>
  );
}

export function useThemePreference() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useThemePreference must be used within AppProviders");
  }
  return context;
}

function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>("auto");

  useEffect(() => {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "auto") {
      setThemeState(stored);
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");

    const applyTheme = () => {
      const resolvedTheme = theme === "auto" ? (media.matches ? "dark" : "light") : theme;
      root.dataset.theme = resolvedTheme;
    };

    applyTheme();
    media.addEventListener("change", applyTheme);
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);

    return () => media.removeEventListener("change", applyTheme);
  }, [theme]);

  const value = useMemo(
    () => ({
      theme,
      setTheme: setThemeState
    }),
    [theme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
