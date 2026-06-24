import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, shared, spacing, typography } from "../theme";

interface EmptyStateProps {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}

/**
 * Reusable empty-state card used for two scenarios:
 * 1. Catalog empty   — no resources published yet
 * 2. No search match — filters/search yield no results
 */
export function EmptyState({ title, body, actionLabel, onAction }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.icon}>🗂️</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} style={[shared.button, styles.action]}>
          <Text style={shared.buttonText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  icon: {
    fontSize: 40,
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.text,
    textAlign: "center",
  },
  body: {
    textAlign: "center",
    fontSize: 14,
    color: colors.textMuted,
    maxWidth: 320,
    lineHeight: 20,
  },
  action: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
});
