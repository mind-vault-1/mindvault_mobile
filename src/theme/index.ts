import { StyleSheet } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useColorScheme } from "react-native";
import { useState, useEffect } from "react";

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
  success: string;
  successBg: string;
  warning: string;
  warningBg: string;
  danger: string;
  dangerBg: string;
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
  success: "#15803d",
  successBg: "#dcfce7",
  warning: "#b45309",
  warningBg: "#fef3c7",
  danger: "#b91c1c",
  dangerBg: "#fee2e2",
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
  success: "#34d399",
  successBg: "#064e3b",
  warning: "#fbbf24",
  warningBg: "#78350f",
  danger: "#f87171",
  dangerBg: "#7f1d1d",
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
        console.error("Failed to load theme preference:", error);
      } finally {
        setIsLoading(false);
      }
    }
    loadTheme();
  }, []);

  // Save theme preference
  async function saveTheme(mode: ThemeMode) {
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, mode);
      setThemeMode(mode);
    } catch (error) {
      console.error("Failed to save theme preference:", error);
    }
  }

  const colors = getColors(themeMode, systemColorScheme);
  const colorScheme = resolveColorScheme(themeMode, systemColorScheme);

  // Create typography styles with current colors
  const typography = StyleSheet.create({
    heading: {
      fontSize: 20,
      fontWeight: "700",
      color: colors.text,
    },
    title: {
      fontSize: 28,
      fontWeight: "700",
      color: colors.text,
    },
    subtitle: {
      fontSize: 14,
      color: colors.textMuted,
    },
    cardTitle: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.text,
    },
    body: {
      fontSize: 14,
      color: colors.textMuted,
    },
    caption: {
      fontSize: 12,
      color: colors.textSubtle,
    },
    price: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.primary,
    },
  });

  // Create shared styles with current colors
  const shared = StyleSheet.create({
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
  });

  return {
    colors,
    colorScheme,
    spacing,
    typography,
    shared,
    themeMode,
    setThemeMode: saveTheme,
    isLoading,
  };
}
