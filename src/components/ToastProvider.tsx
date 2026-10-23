import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, Platform, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { spacing } from "../theme";
import type { ThemeColors } from "../theme";
import { useAppTheme } from "../theme/ThemeProvider";

export type ToastVariant = "success" | "error" | "info";

export interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
}

export interface ToastApi {
  /** Queues a toast; it shows after the ones before it have gone. */
  show: (message: string, variant?: ToastVariant) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

/** How long each toast stays on screen. */
export const TOAST_DURATION_MS = 2500;

const ToastContext = createContext<ToastApi | null>(null);

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      position: "absolute",
      left: spacing.lg,
      right: spacing.lg,
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderWidth: 1,
    },
    info: { backgroundColor: colors.text, borderColor: colors.text },
    success: { backgroundColor: colors.successBg, borderColor: colors.success },
    error: { backgroundColor: colors.dangerBg, borderColor: colors.danger },
    text: { textAlign: "center", fontSize: 14, fontWeight: "500" },
    infoText: { color: colors.background },
    successText: { color: colors.success },
    errorText: { color: colors.danger },
  });
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const [queue, setQueue] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const current = queue[0];

  const show = useCallback((message: string, variant: ToastVariant = "info") => {
    const id = nextId.current++;
    setQueue((prev) => [...prev, { id, message, variant }]);
  }, []);

  // One timer for the toast on screen; when it fires, the next one in the queue shows.
  useEffect(() => {
    if (!current) return;
    // Android reads the live region below; iOS needs an explicit announcement.
    if (Platform.OS !== "android") AccessibilityInfo.announceForAccessibility(current.message);
    const timer = setTimeout(
      () => setQueue((prev) => prev.filter((toast) => toast.id !== current.id)),
      TOAST_DURATION_MS
    );
    return () => clearTimeout(timer);
  }, [current]);

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (message) => show(message, "success"),
      error: (message) => show(message, "error"),
      info: (message) => show(message, "info"),
    }),
    [show]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {current ? (
        <View
          key={current.id}
          testID="toast"
          style={[styles.container, styles[current.variant], { bottom: insets.bottom + spacing.xl }]}
          accessibilityRole={current.variant === "error" ? "alert" : "text"}
          accessibilityLiveRegion={current.variant === "error" ? "assertive" : "polite"}
          pointerEvents="none"
        >
          <Text style={[styles.text, styles[`${current.variant}Text`]]}>{current.message}</Text>
        </View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) {
    throw new Error("useToast must be used inside a ToastProvider");
  }
  return api;
}
