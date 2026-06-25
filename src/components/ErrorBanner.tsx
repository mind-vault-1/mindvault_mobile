import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAppTheme } from "../theme/ThemeProvider";
import type { ThemeColors } from "../theme";

interface ErrorBannerProps {
  message: string;
  onRetry: () => void;
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.dangerBg,
      backgroundColor: colors.dangerBg,
      padding: 12,
      gap: 8,
    },
    message: {
      color: colors.danger,
      fontSize: 14,
    },
    retryButton: {
      alignSelf: "flex-start",
      borderRadius: 8,
      backgroundColor: colors.danger,
      paddingHorizontal: 12,
      paddingVertical: 8,
      minHeight: 44,
      minWidth: 44,
      justifyContent: "center",
      alignItems: "center",
    },
    retryText: {
      color: "#ffffff",
      fontWeight: "600",
      fontSize: 13,
    },
  });
}

export function ErrorBanner({ message, onRetry }: ErrorBannerProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <Text style={styles.message}>{message}</Text>
      <Pressable onPress={onRetry} style={styles.retryButton}>
        <Text style={styles.retryText}>Retry</Text>
      </Pressable>
    </View>
  );
}
