"use client";

import { useCallback, useEffect, useState } from "react";
import {
  applyThemeToDocument,
  readStoredTheme,
  writeStoredTheme,
  type ThemeMode,
} from "@/lib/theme";

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeMode>("light");

  useEffect(() => {
    const initial = readStoredTheme();
    setThemeState(initial);
    applyThemeToDocument(initial);
  }, []);

  const setTheme = useCallback((mode: ThemeMode) => {
    setThemeState(mode);
    writeStoredTheme(mode);
    applyThemeToDocument(mode);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [setTheme, theme]);

  return { theme, setTheme, toggleTheme };
}
