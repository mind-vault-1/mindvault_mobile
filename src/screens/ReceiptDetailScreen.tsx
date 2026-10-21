import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { useAppTheme } from "../theme/ThemeProvider";
import type { ThemeColors } from "../theme";
import { spacing } from "../theme";
import { getReceipt } from "../services/receipts";
import { fetchReceipt, type ServerReceipt } from "../api/payment";
import { stellarExpertTxUrl, openExternalUrl } from "../utils/stellarExpert";
import type { RootStackParamList } from "../navigation";
import type { PaymentReceipt } from "../services/receipts";

type Props = NativeStackScreenProps<RootStackParamList, "ReceiptDetail">;

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      padding: spacing.lg,
      paddingBottom: spacing.xxl,
      gap: spacing.lg,
    },
    centered: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      padding: spacing.lg,
    },
    loadingText: {
      marginTop: spacing.md,
      color: colors.textMuted,
    },
    errorContainer: {
      gap: spacing.md,
      alignItems: "center",
    },
    errorText: {
      color: colors.danger,
      textAlign: "center",
    },
    retryButton: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      backgroundColor: colors.primary,
      borderRadius: 12,
    },
    retryButtonText: {
      color: "#ffffff",
      fontWeight: "600",
    },
    section: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      backgroundColor: colors.surface,
      overflow: "hidden",
    },
    sectionHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      padding: spacing.md,
      backgroundColor: colors.neutralBg,
      borderBottomWidth: 1,
      borderColor: colors.border,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.text,
    },
    badge: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
    },
    badgeVerified: {
      backgroundColor: colors.successBg,
    },
    badgeMismatch: {
      backgroundColor: colors.dangerBg,
    },
    badgePending: {
      backgroundColor: colors.warningBg,
    },
    badgeText: {
      fontSize: 12,
      fontWeight: "600",
    },
    badgeTextVerified: {
      color: colors.success,
    },
    badgeTextMismatch: {
      color: colors.danger,
    },
    badgeTextPending: {
      color: colors.warning,
    },
    sectionContent: {
      padding: spacing.md,
      gap: spacing.sm,
    },
    row: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: spacing.md,
    },
    label: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.textMuted,
      flexShrink: 0,
      width: 100,
    },
    value: {
      fontSize: 13,
      color: colors.text,
      flex: 1,
      flexShrink: 1,
      textAlign: "right",
    },
    valueMono: {
      fontFamily: "monospace",
      fontSize: 12,
    },
    mismatch: {
      color: colors.danger,
    },
    match: {
      color: colors.success,
    },
    divider: {
      height: 1,
      backgroundColor: colors.border,
      marginHorizontal: spacing.md,
    },
    actionRow: {
      flexDirection: "row",
      gap: spacing.md,
      marginTop: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.md,
    },
    actionButton: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 10,
      alignItems: "center",
    },
    actionButtonPrimary: {
      backgroundColor: colors.primary,
    },
    actionButtonSecondary: {
      backgroundColor: colors.neutralBg,
    },
    actionButtonText: {
      fontWeight: "600",
    },
    actionButtonTextPrimary: {
      color: "#ffffff",
    },
    actionButtonTextSecondary: {
      color: colors.text,
    },
    summaryContainer: {
      padding: spacing.md,
      backgroundColor: colors.neutralBg,
      borderRadius: 12,
      gap: spacing.xs,
    },
    summaryTitle: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.text,
    },
    summaryText: {
      fontSize: 13,
      color: colors.textMuted,
    },
  });
}

function formatUsdc(atomic: string): string {
  const padded = atomic.padStart(8, "0");
  const whole = padded.slice(0, -7).replace(/^0+(?=\d)/, "");
  const fraction = padded.slice(-7).replace(/0+$/, "").padEnd(2, "0");
  return `${whole}.${fraction} USDC`;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function shortenHash(hash: string): string {
  if (hash.length <= 20) return hash;
  return `${hash.slice(0, 10)}…${hash.slice(-8)}`;
}

function getVerificationStatus(
  local: PaymentReceipt | null,
  server: ServerReceipt
): { status: "verified" | "mismatch" | "pending"; label: string } {
  if (!local) {
    return { status: "pending", label: "No local receipt" };
  }

  const txMatch = local.txHash === server.txHash;
  const amountMatch = local.amount === server.amount;
  const networkMatch = local.network === server.network;

  if (txMatch && amountMatch && networkMatch) {
    return { status: "verified", label: "Verified" };
  }

  return { status: "mismatch", label: "Mismatch" };
}

export function ReceiptDetailScreen({ route, navigation }: Props) {
  const { colors, shared, typography } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const { txHash } = route.params;
  const [localReceipt, setLocalReceipt] = useState<PaymentReceipt | null>(null);
  const [serverReceipt, setServerReceipt] = useState<ServerReceipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingServer, setLoadingServer] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadLocalReceipt = useCallback(async () => {
    try {
      const receipt = await getReceipt(txHash);
      setLocalReceipt(receipt);
    } catch {
      setLocalReceipt(null);
    }
  }, [txHash]);

  const loadServerReceipt = useCallback(async () => {
    setLoadingServer(true);
    try {
      const receipt = await fetchReceipt(txHash);
      setServerReceipt(receipt);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch server receipt";
      setError(message);
    } finally {
      setLoadingServer(false);
      setLoading(false);
    }
  }, [txHash]);

  useEffect(() => {
    loadLocalReceipt().then(loadServerReceipt);
  }, [loadLocalReceipt, loadServerReceipt]);

  const handleOpenExplorer = useCallback(async () => {
    if (!serverReceipt) return;
    try {
      const url = stellarExpertTxUrl({ txHash: serverReceipt.txHash, network: serverReceipt.network });
      await openExternalUrl(url);
    } catch {
      Alert.alert("Unable to open explorer");
    }
  }, [serverReceipt]);

  const handleRetry = useCallback(() => {
    setError(null);
    loadServerReceipt();
  }, [loadServerReceipt]);

  if (loading) {
    return (
      <SafeAreaView style={shared.screen} edges={["bottom"]}>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" accessibilityLabel="Loading receipt" />
          <Text style={styles.loadingText}>Loading receipt details…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error && !serverReceipt) {
    return (
      <SafeAreaView style={shared.screen} edges={["bottom"]}>
        <View style={styles.centered}>
          <Text style={styles.errorText} accessibilityRole="alert">
            {error}
          </Text>
          <Pressable onPress={handleRetry} style={styles.retryButton} accessibilityRole="button">
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (!serverReceipt) {
    return (
      <SafeAreaView style={shared.screen} edges={["bottom"]}>
        <View style={styles.centered}>
          <Text style={styles.errorText} accessibilityRole="alert">
            Receipt not found on server
          </Text>
          <Pressable onPress={handleRetry} style={styles.retryButton} accessibilityRole="button">
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const verification = getVerificationStatus(localReceipt, serverReceipt);
  const badgeStyle =
    verification.status === "verified"
      ? styles.badgeVerified
      : verification.status === "mismatch"
      ? styles.badgeMismatch
      : styles.badgePending;
  const badgeTextStyle =
    verification.status === "verified"
      ? styles.badgeTextVerified
      : verification.status === "mismatch"
      ? styles.badgeTextMismatch
      : styles.badgeTextPending;

  return (
    <SafeAreaView style={shared.screen} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Receipt Verification</Text>
            <View style={[styles.badge, badgeStyle]}>
              <Text style={[styles.badgeText, badgeTextStyle]}>{verification.label}</Text>
            </View>
          </View>
          <View style={styles.sectionContent}>
            <View style={styles.summaryContainer}>
              <Text style={styles.summaryTitle}>
                {verification.status === "verified"
                  ? "✓ Local receipt matches server record"
                  : verification.status === "mismatch"
                  ? "⚠ Local receipt differs from server"
                  : "⟳ No local receipt to compare"}
              </Text>
              <Text style={styles.summaryText}>
                {verification.status === "verified"
                  ? "All fields match. This payment is confirmed on-chain."
                  : verification.status === "mismatch"
                  ? "Some fields don't match. Check the comparison below."
                  : "The server has a record but no local receipt was found."}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Server Receipt</Text>
          </View>
          <View style={styles.sectionContent}>
            <View style={styles.row}>
              <Text style={styles.label}>Resource</Text>
              <Text style={styles.value}>{serverReceipt.resourceTitle || "Unknown"}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Amount</Text>
              <Text style={[styles.value, styles.valueMono]}>{formatUsdc(serverReceipt.amount)}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Asset</Text>
              <Text style={[styles.value, styles.valueMono]}>{serverReceipt.asset}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Network</Text>
              <Text style={[styles.value, styles.valueMono]}>{serverReceipt.network}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Payer</Text>
              <Text style={[styles.value, styles.valueMono]}>{shortenHash(serverReceipt.payer)}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Paid At</Text>
              <Text style={styles.value}>{formatDate(serverReceipt.paidAt)}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Tx Hash</Text>
              <Text style={[styles.value, styles.valueMono]} numberOfLines={1} ellipsizeMode="middle">
                {serverReceipt.txHash}
              </Text>
            </View>
          </View>
          <View style={styles.actionRow}>
            <Pressable
              onPress={handleOpenExplorer}
              style={styles.actionButton}
              style={[styles.actionButton, styles.actionButtonSecondary]}
              accessibilityRole="button"
              accessibilityLabel="View transaction on Stellar Expert"
            >
              <Text style={[styles.actionButtonText, styles.actionButtonTextSecondary]}>View on Explorer</Text>
            </Pressable>
          </View>
        </View>

        {localReceipt && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Local Receipt</Text>
            </View>
            <View style={styles.sectionContent}>
              <View style={styles.row}>
                <Text style={styles.label}>Amount</Text>
                <Text
                  style={[
                    styles.value,
                    styles.valueMono,
                    localReceipt.amount === serverReceipt.amount ? styles.match : styles.mismatch,
                  ]}
                >
                  {formatUsdc(localReceipt.amount)} {localReceipt.amount === serverReceipt.amount ? "✓" : "✗"}
                </Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>Asset</Text>
                <Text
                  style={[
                    styles.value,
                    styles.valueMono,
                    localReceipt.asset === serverReceipt.asset ? styles.match : styles.mismatch,
                  ]}
                >
                  {localReceipt.asset} {localReceipt.asset === serverReceipt.asset ? "✓" : "✗"}
                </Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>Network</Text>
                <Text
                  style={[
                    styles.value,
                    styles.valueMono,
                    localReceipt.network === serverReceipt.network ? styles.match : styles.mismatch,
                  ]}
                >
                  {localReceipt.network} {localReceipt.network === serverReceipt.network ? "✓" : "✗"}
                </Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>Tx Hash</Text>
                <Text
                  style={[
                    styles.value,
                    styles.valueMono,
                    localReceipt.txHash === serverReceipt.txHash ? styles.match : styles.mismatch,
                  ]}
                >
                  {shortenHash(localReceipt.txHash)} {localReceipt.txHash === serverReceipt.txHash ? "✓" : "✗"}
                </Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>Payer</Text>
                <Text
                  style={[
                    styles.value,
                    styles.valueMono,
                    localReceipt.payer === serverReceipt.payer ? styles.match : styles.mismatch,
                  ]}
                >
                  {shortenHash(localReceipt.payer)} {localReceipt.payer === serverReceipt.payer ? "✓" : "✗"}
                </Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>Paid At</Text>
                <Text
                  style={[
                    styles.value,
                    localReceipt.paidAt === serverReceipt.paidAt ? styles.match : styles.mismatch,
                  ]}
                >
                  {formatDate(localReceipt.paidAt)} {localReceipt.paidAt === serverReceipt.paidAt ? "✓" : "✗"}
                </Text>
              </View>
            </View>
          </View>
        )}

        {!localReceipt && serverReceipt && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Local Receipt</Text>
            </View>
            <View style={styles.sectionContent}>
              <Text style={styles.summaryText} textAlign="center">
                No local receipt found for this transaction.
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}