import { createContext, useContext, useMemo, ReactNode } from "react";
import { useTheme } from "./index";

type ThemeContextType = ReturnType<typeof useTheme>;

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { colors, colorScheme, spacing, typography, shared, themeMode, setThemeMode, isLoading } = useTheme();
  const theme = useMemo(() => ({
    colors, colorScheme, spacing, typography, shared, themeMode, setThemeMode, isLoading,
  }), [colors, colorScheme, spacing, typography, shared, themeMode, setThemeMode, isLoading]);

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useAppTheme must be used within a ThemeProvider");
  }
  return context;
}
