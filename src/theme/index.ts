import { StyleSheet } from "react-native";
import { DarkTheme, DefaultTheme, type Theme } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useColorScheme } from "react-native";
import { useState, useEffect, useCallback, useMemo } from "react";
import { logError } from "../utils/errorLogger";

// Theme type definitions
export type ThemeMode = "light" | "dark" | "system";

export type ThemeColors = {
  background: string;
  surface: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  border: string;
  primary: string;
  primaryMuted: string;
  onPrimary: string;
  success: string;
  successBg: string;
  warning: string;
  warningBg: string;
  danger: string;
  dangerBg: string;
  onDanger: string;
  neutralBg: string;
};

export type ColorScheme = "light" | "dark";

// Light theme colors
export const lightColors: ThemeColors = {
  background: "#f9fafb",
  surface: "#ffffff",
  text: "#111827",
  textMuted: "#6b7280",
  textSubtle: "#9ca3af",
  border: "#e5e7eb",
  primary: "#4f46e5",
  primaryMuted: "#eef2ff",
  onPrimary: "#ffffff",
  success: "#15803d",
  successBg: "#dcfce7",
  warning: "#b45309",
  warningBg: "#fef3c7",
  danger: "#b91c1c",
  dangerBg: "#fee2e2",
  onDanger: "#ffffff",
  neutralBg: "#f3f4f6",
};

// Dark theme colors
export const darkColors: ThemeColors = {
  background: "#1f2937",
  surface: "#374151",
  text: "#f9fafb",
  textMuted: "#d1d5db",
  textSubtle: "#9ca3af",
  border: "#4b5563",
  primary: "#6366f1",
  primaryMuted: "#3730a3",
  onPrimary: "#ffffff",
  success: "#34d399",
  successBg: "#064e3b",
  warning: "#fbbf24",
  warningBg: "#78350f",
  danger: "#f87171",
  dangerBg: "#7f1d1d",
  onDanger: "#ffffff",
  neutralBg: "#374151",
};

// Spacing constants (same for both themes)
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

// Storage key for theme preference
const THEME_STORAGE_KEY = "@mindvault_theme_mode";

// Helper to get colors based on theme mode
export function getColors(
  mode: ThemeMode,
  systemColorScheme: ColorScheme | null | undefined
): ThemeColors {
  if (mode === "system") {
    return systemColorScheme === "dark" ? darkColors : lightColors;
  }
  return mode === "dark" ? darkColors : lightColors;
}

export function resolveColorScheme(
  mode: ThemeMode,
  systemColorScheme: ColorScheme | null | undefined
): ColorScheme {
  if (mode === "system") {
    return systemColorScheme === "dark" ? "dark" : "light";
  }
  return mode;
}

export const colors = lightColors;

export const typography = StyleSheet.create({
  heading: { fontSize: 20, fontWeight: "700", color: colors.text },
  title: { fontSize: 28, fontWeight: "700", color: colors.text },
  subtitle: { fontSize: 14, color: colors.textMuted },
  cardTitle: { fontSize: 16, fontWeight: "600", color: colors.text },
  body: { fontSize: 14, color: colors.textMuted },
  caption: { fontSize: 12, color: colors.textSubtle },
  price: { fontSize: 15, fontWeight: "600", color: colors.primary },
});

export const shared = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  card: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 8 },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: "600", textTransform: "capitalize" },
  button: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.neutralBg, minHeight: 44, minWidth: 44, justifyContent: "center", alignItems: "center" },
  buttonText: { fontSize: 12, fontWeight: "600", color: colors.text },
  primaryButton: { backgroundColor: colors.primary },
  primaryButtonText: { color: "#ffffff" },
});

const navigationThemes = new WeakMap<ThemeColors, Partial<Record<ColorScheme, Theme>>>();

/** React Navigation theme (headers, cards, backgrounds) built from the app colors. */
export function getNavigationTheme(colors: ThemeColors, colorScheme: ColorScheme): Theme {
  const cached = navigationThemes.get(colors) ?? {};
  const cachedTheme = cached[colorScheme];
  if (cachedTheme) return cachedTheme;
  const base = colorScheme === "dark" ? DarkTheme : DefaultTheme;
  const theme = {
    ...base,
    colors: {
      ...base.colors,
      primary: colors.primary,
      background: colors.background,
      card: colors.surface,
      text: colors.text,
      border: colors.border,
      notification: colors.danger,
    },
  };
  cached[colorScheme] = theme;
  navigationThemes.set(colors, cached);
  return theme;
}

const lineHeightFor = (fontSize: number) => Math.ceil(fontSize * 1.4);

// Theme hook for components
export function useTheme() {
  const systemColorScheme = useColorScheme();
  const [themeMode, setThemeMode] = useState<ThemeMode>("system");
  const [isLoading, setIsLoading] = useState(true);

  // Load saved theme preference
  useEffect(() => {
    async function loadTheme() {
      try {
        const savedMode = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (savedMode && ["light", "dark", "system"].includes(savedMode)) {
          setThemeMode(savedMode as ThemeMode);
        }
      } catch (error) {
        logError("theme.loadPreference", error);
      } finally {
        setIsLoading(false);
      }
    }
    loadTheme();
  }, []);

  // Save theme preference
  const saveTheme = useCallback(async (mode: ThemeMode) => {
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, mode);
      setThemeMode(mode);
    } catch (error) {
      logError("theme.savePreference", error);
    }
  }, []);

  const colors = useMemo(() => getColors(themeMode, systemColorScheme), [themeMode, systemColorScheme]);
  const colorScheme = resolveColorScheme(themeMode, systemColorScheme);

  // Create typography styles with current colors
  // React Native already multiplies lineHeight by the system font scale, so
  // this stays unscaled; multiplying by fontScale here would scale it twice.

  const typography = useMemo(() => StyleSheet.create({
    heading: {
      fontSize: 20,
      lineHeight: lineHeightFor(20),
      fontWeight: "700",
      color: colors.text,
    },
    title: {
      fontSize: 28,
      lineHeight: lineHeightFor(28),
      fontWeight: "700",
      color: colors.text,
    },
    subtitle: {
      fontSize: 14,
      lineHeight: lineHeightFor(14),
      color: colors.textMuted,
    },
    cardTitle: {
      fontSize: 16,
      lineHeight: lineHeightFor(16),
      fontWeight: "600",
      color: colors.text,
    },
    body: {
      fontSize: 14,
      lineHeight: lineHeightFor(14),
      color: colors.textMuted,
    },
    caption: {
      fontSize: 12,
      lineHeight: lineHeightFor(12),
      color: colors.textSubtle,
    },
    price: {
      fontSize: 15,
      lineHeight: lineHeightFor(15),
      fontWeight: "600",
      color: colors.primary,
    },
  }), [colors]);

  // Create shared styles with current colors
  const shared = useMemo(() => StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.background,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      gap: 8,
    },
    badge: {
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    badgeText: {
      fontSize: 11,
      fontWeight: "600",
      textTransform: "capitalize",
    },
    button: {
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: colors.neutralBg,
      minHeight: 44,
      minWidth: 44,
      justifyContent: "center",
      alignItems: "center",
    },
    buttonText: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.text,
    },
    primaryButton: {
      backgroundColor: colors.primary,
    },
    primaryButtonText: {
      color: "#ffffff",
    },
  }), [colors]);

  return useMemo(() => ({
    colors,
    colorScheme,
    spacing,
    typography,
    shared,
    themeMode,
    setThemeMode: saveTheme,
    isLoading,
  }), [colors, colorScheme, typography, shared, themeMode, saveTheme, isLoading]);
}
