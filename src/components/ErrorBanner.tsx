import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, spacing } from "../theme";

interface ErrorBannerProps {
  message: string;
  onRetry: () => void;
}

export function ErrorBanner({ message, onRetry }: ErrorBannerProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.message}>{message}</Text>
      <Pressable onPress={onRetry} style={styles.retryButton}>
        <Text style={styles.retryText}>Retry</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#fecaca",
    backgroundColor: "#fef2f2",
    padding: spacing.md,
    gap: spacing.sm,
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
