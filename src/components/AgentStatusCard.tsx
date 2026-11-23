import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import {
  fetchAgentStatus,
  formatConfidence,
  type AgentStatus,
} from "../api/verification";
import { spacing, type ThemeColors } from "../theme";
import { useAppTheme } from "../theme/ThemeProvider";

export interface AgentStatusCardProps {
  status?: AgentStatus | null;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

export function AgentStatusCard(props: AgentStatusCardProps) {
  const { onRetry } = props;
  const { colors, typography } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [internalStatus, setInternalStatus] = useState<AgentStatus | null>(null);
  const [internalLoading, setInternalLoading] = useState(false);
  const [internalError, setInternalError] = useState<string | null>(null);

  const isControlled =
    props.status !== undefined || props.loading !== undefined || props.error !== undefined;

  const status = isControlled ? props.status : internalStatus;
  const loading = isControlled ? props.loading : internalLoading;
  const error = isControlled ? props.error : internalError;

  const load = useCallback(async () => {
    if (isControlled) {
      onRetry?.();
      return;
    }
    setInternalLoading(true);
    setInternalError(null);
    try {
      const data = await fetchAgentStatus();
      setInternalStatus(data);
    } catch (err) {
      setInternalError(err instanceof Error ? err.message : "Failed to load agent status");
    } finally {
      setInternalLoading(false);
    }
  }, [isControlled, onRetry]);

  useEffect(() => {
    if (!isControlled) {
      void load();
    }
  }, [isControlled, load]);

  if (loading) {
    return (
      <View
        style={styles.card}
        accessible
        accessibilityRole="summary"
        accessibilityLabel="Loading verification agent status"
      >
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.loadingText}>Loading agent status…</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View
        style={styles.card}
        accessible
        accessibilityRole="alert"
        accessibilityLabel={`Agent status error: ${error}`}
      >
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            onPress={() => void load()}
            style={styles.retryButton}
            accessibilityRole="button"
            accessibilityLabel="Retry loading agent status"
          >
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (!status) return null;

  const formattedProcessed = status.verificationsProcessed.toLocaleString();
  const formattedApproval = formatConfidence(status.approvalRate);
  const formattedEarnings = `${status.earnings} USDC`;

  return (
    <View
      style={styles.card}
      accessible
      accessibilityRole="summary"
      accessibilityLabel={`AI verification agent status: ${formattedProcessed} verifications processed, ${formattedApproval} approval rate, ${formattedEarnings} earned`}
    >
      <View style={styles.header}>
        <Text style={[styles.title, typography.cardTitle]}>AI Verification Agent</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{status.status ?? "Active"}</Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View
          style={styles.statBox}
          accessible
          accessibilityRole="text"
          accessibilityLabel={`${formattedProcessed} verifications processed`}
        >
          <Text style={styles.statValue}>{formattedProcessed}</Text>
          <Text style={styles.statLabel}>Processed</Text>
        </View>

        <View
          style={styles.statBox}
          accessible
          accessibilityRole="text"
          accessibilityLabel={`Approval rate ${formattedApproval}`}
        >
          <Text style={styles.statValue}>{formattedApproval}</Text>
          <Text style={styles.statLabel}>Approval Rate</Text>
        </View>

        <View
          style={styles.statBox}
          accessible
          accessibilityRole="text"
          accessibilityLabel={`Total earnings ${formattedEarnings}`}
        >
          <Text style={styles.statValue}>{formattedEarnings}</Text>
          <Text style={styles.statLabel}>Earnings</Text>
        </View>
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      padding: spacing.md,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    title: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.text,
    },
    badge: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: 6,
      backgroundColor: colors.primaryMuted ?? colors.neutralBg,
    },
    badgeText: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.primary,
    },
    statsRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      gap: spacing.sm,
    },
    statBox: {
      flex: 1,
      padding: spacing.sm,
      borderRadius: 8,
      backgroundColor: colors.neutralBg,
      alignItems: "center",
      gap: 2,
    },
    statValue: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.text,
      textAlign: "center",
    },
    statLabel: {
      fontSize: 11,
      fontWeight: "500",
      color: colors.textMuted,
      textAlign: "center",
    },
    loadingContainer: {
      padding: spacing.md,
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.xs,
    },
    loadingText: {
      fontSize: 13,
      color: colors.textMuted,
    },
    errorContainer: {
      padding: spacing.sm,
      alignItems: "center",
      gap: spacing.sm,
    },
    errorText: {
      fontSize: 13,
      color: colors.danger,
      textAlign: "center",
    },
    retryButton: {
      paddingHorizontal: spacing.md,
      paddingVertical: 6,
      borderRadius: 8,
      backgroundColor: colors.dangerBg,
    },
    retryText: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.danger,
    },
  });
}
