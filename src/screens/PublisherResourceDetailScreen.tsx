import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { delistResource, fetchPublisherResources } from "../api/resources";
import { fetchAnalytics, type PublisherAnalytics } from "../api/publishers";
import type { Resource } from "../types";
import type { RootStackParamList } from "../navigation";
import { spacing } from "../theme";
import { useAppTheme } from "../theme/ThemeProvider";
import { ErrorBanner } from "../components/ErrorBanner";
import { RegisterModal } from "../components/RegisterModal";
import { ResourceCard } from "../components/ResourceCard";
import { StatusBadge } from "../components/StatusBadge";
import { TransferOwnershipModal } from "../components/TransferOwnershipModal";
import { useToast } from "../components/ToastProvider";
import { logError } from "../utils/errorLogger";
import {
  openExternalUrl,
  stellarExpertAccountUrl,
  stellarExpertTxUrl,
} from "../utils/stellarExpert";
import { getFormatLocale } from "../i18n";

type DetailRoute = RouteProp<RootStackParamList, "PublisherResourceDetail">;
type DetailNavigation = NativeStackNavigationProp<RootStackParamList, "PublisherResourceDetail">;

type ResourceStats = PublisherAnalytics["resources"][number];

export const RESOURCE_NOT_FOUND_MESSAGE = "This resource is no longer in your account.";
const MAX_RECENT_PAYMENTS = 5;

function shorten(value: string): string {
  return value.length <= 12 ? value : `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function formatDate(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString(getFormatLocale());
}

export function PublisherResourceDetailScreen() {
  const { colors, shared, typography } = useAppTheme();
  const navigation = useNavigation<DetailNavigation>();
  const { params } = useRoute<DetailRoute>();
  const toast = useToast();

  const [resource, setResource] = useState<Resource | null>(null);
  const [stats, setStats] = useState<ResourceStats | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTransfer, setShowTransfer] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [showDelist, setShowDelist] = useState(false);
  const [delisting, setDelisting] = useState(false);
  const [delistError, setDelistError] = useState<string | null>(null);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
        centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm, padding: spacing.lg },
        sectionTitle: { fontSize: 16, fontWeight: "600", color: colors.text },
        row: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md, paddingVertical: 2 },
        rowLabel: { fontSize: 13, color: colors.textMuted },
        rowValue: { fontSize: 13, fontWeight: "600", color: colors.text, flexShrink: 1, textAlign: "right" },
        statsGrid: { flexDirection: "row", gap: spacing.md },
        statTile: { flex: 1, borderRadius: 12, backgroundColor: colors.neutralBg, padding: spacing.md, gap: 2 },
        statValue: { fontSize: 20, fontWeight: "700", color: colors.text },
        statLabel: { fontSize: 12, color: colors.textMuted },
        badges: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
        link: { color: colors.primary, fontWeight: "600", fontSize: 13 },
        muted: { fontSize: 13, color: colors.textMuted },
        errorText: { color: colors.danger, fontSize: 14 },
        modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: spacing.lg },
        modalCard: { backgroundColor: colors.surface, borderRadius: 20, padding: spacing.lg, gap: spacing.md },
        modalActions: { flexDirection: "row", gap: spacing.sm },
        modalButton: { flex: 1 },
        dangerButton: { flex: 1, backgroundColor: colors.danger },
        disabled: { opacity: 0.6 },
      }),
    [colors]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setStats(null);
    setStatsError(null);
    try {
      // Stats are a bonus: if analytics fail, the resource and its actions still show.
      const [resources, analytics] = await Promise.all([
        fetchPublisherResources(),
        fetchAnalytics().catch((err: unknown) => {
          setStatsError(err instanceof Error ? err.message : "Stats unavailable");
          return null;
        }),
      ]);
      const found = resources.find((r) => r.id === params.resourceId) ?? null;
      if (!found) {
        setResource(null);
        setError(RESOURCE_NOT_FOUND_MESSAGE);
        return;
      }
      setResource(found);
      setStats(analytics?.resources.find((r) => r.id === params.resourceId) ?? null);
    } catch (err) {
      logError("publisherResourceDetail.load", err);
      setError(err instanceof Error ? err.message : "Failed to load resource");
    } finally {
      setLoading(false);
    }
  }, [params.resourceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const openLink = useCallback(
    async (url: string) => {
      try {
        await openExternalUrl(url);
      } catch {
        toast.error("Unable to open the explorer");
      }
    },
    [toast]
  );

  const handlePriceUpdated = useCallback(
    (_id: string, price: string) => {
      setResource((prev) => (prev ? { ...prev, price } : prev));
      toast.success("Price updated successfully");
    },
    [toast]
  );

  const handleTransferSuccess = useCallback(() => {
    setShowTransfer(false);
    toast.success("Ownership transferred successfully");
    // The publisher no longer owns this resource, so there is nothing left to manage here.
    navigation.goBack();
  }, [navigation, toast]);

  const handleRegisterSuccess = useCallback(
    (message: string, txHash: string) => {
      setResource((prev) => (prev ? { ...prev, onchainStatus: "registered", onchainTxHash: txHash } : prev));
      toast.success(message);
    },
    [toast]
  );

  const handleConfirmDelist = useCallback(async () => {
    if (!resource) return;
    setDelisting(true);
    setDelistError(null);
    try {
      await delistResource(resource.id);
      setShowDelist(false);
      toast.success("Resource delisted");
      navigation.goBack();
    } catch (err) {
      logError("publisherResourceDetail.delist", err);
      setDelistError(err instanceof Error ? err.message : "Failed to delist resource");
    } finally {
      setDelisting(false);
    }
  }, [navigation, resource, toast]);

  if (loading) {
    return (
      <SafeAreaView style={shared.screen} edges={["left", "right"]}>
        <View style={styles.centered} accessibilityRole="progressbar" accessibilityLabel="Loading resource">
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.muted}>Loading resource…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !resource) {
    return (
      <SafeAreaView style={shared.screen} edges={["left", "right"]}>
        <View style={styles.container}>
          <ErrorBanner message={error ?? "Failed to load resource"} onRetry={() => void load()} />
          <Pressable
            onPress={() => navigation.goBack()}
            style={shared.button}
            accessibilityRole="button"
            accessibilityLabel="Back to my resources"
          >
            <Text style={shared.buttonText}>Back to my resources</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const payments = stats?.recentPayments.slice(0, MAX_RECENT_PAYMENTS) ?? [];

  return (
    <SafeAreaView style={shared.screen} edges={["left", "right"]}>
      <ScrollView contentContainerStyle={styles.container}>
        <ResourceCard
          resource={resource}
          onCopyUrl={toast.info}
          editablePrice
          onPriceUpdated={handlePriceUpdated}
          onTransferOwnership={() => setShowTransfer(true)}
          onRegister={() => setShowRegister(true)}
          onDelist={() => {
            setDelistError(null);
            setShowDelist(true);
          }}
        />

        <View style={shared.card} testID="resource-stats">
          <Text style={styles.sectionTitle} accessibilityRole="header">Stats</Text>
          {stats ? (
            <>
              <View style={styles.statsGrid}>
                <View style={styles.statTile} accessible accessibilityLabel={`Sales: ${stats.totalSales}`}>
                  <Text style={styles.statValue}>{stats.totalSales}</Text>
                  <Text style={styles.statLabel}>Sales</Text>
                </View>
                <View
                  style={styles.statTile}
                  accessible
                  accessibilityLabel={`Earned: ${stats.totalEarned} USDC`}
                >
                  <Text style={styles.statValue}>{stats.totalEarned}</Text>
                  <Text style={styles.statLabel}>Earned (USDC)</Text>
                </View>
              </View>
              <Text style={styles.rowLabel}>Recent payments</Text>
              {payments.length === 0 ? (
                <Text style={styles.muted}>No payments yet.</Text>
              ) : (
                payments.map((payment) => (
                  <View
                    key={`${payment.payerAddress}-${payment.paidAt}`}
                    style={styles.row}
                    accessible
                    accessibilityLabel={`${payment.amount} USDC from ${payment.payerAddress} on ${formatDate(payment.paidAt)}`}
                  >
                    <Text style={styles.rowLabel}>
                      {shorten(payment.payerAddress)} · {formatDate(payment.paidAt)}
                    </Text>
                    <Text style={styles.rowValue}>{payment.amount} USDC</Text>
                  </View>
                ))
              )}
            </>
          ) : (
            <Text style={styles.muted}>
              {statsError ? `Stats unavailable: ${statsError}` : "No sales recorded yet."}
            </Text>
          )}
        </View>

        <View style={shared.card} testID="resource-onchain">
          <Text style={styles.sectionTitle} accessibilityRole="header">On-chain</Text>
          <View style={styles.badges}>
            <StatusBadge kind="onchain" status={resource.onchainStatus} />
            <StatusBadge kind="verification" status={resource.verificationStatus} />
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Listed</Text>
            <Text style={styles.rowValue}>{resource.listed ? "Yes" : "No"}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Published</Text>
            <Text style={styles.rowValue}>{formatDate(resource.publishedAt)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Owner</Text>
            <Pressable
              onPress={() => void openLink(stellarExpertAccountUrl({ accountId: resource.walletAddress }))}
              accessibilityRole="link"
              accessibilityLabel={`View owner ${resource.walletAddress} on Stellar Expert`}
            >
              <Text style={styles.link}>{shorten(resource.walletAddress)}</Text>
            </Pressable>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Registration tx</Text>
            {resource.onchainTxHash ? (
              <Pressable
                onPress={() => void openLink(stellarExpertTxUrl({ txHash: resource.onchainTxHash! }))}
                accessibilityRole="link"
                accessibilityLabel={`View transaction ${resource.onchainTxHash} on Stellar Expert`}
              >
                <Text style={styles.link}>{shorten(resource.onchainTxHash)}</Text>
              </Pressable>
            ) : (
              <Text style={styles.rowValue}>Not registered</Text>
            )}
          </View>
        </View>
      </ScrollView>

      {showTransfer ? (
        <TransferOwnershipModal
          resource={resource}
          visible
          onClose={() => setShowTransfer(false)}
          onSuccess={handleTransferSuccess}
        />
      ) : null}

      {showRegister ? (
        <RegisterModal
          resource={resource}
          visible
          onClose={() => setShowRegister(false)}
          onSuccess={handleRegisterSuccess}
          onError={(message) => toast.error(message)}
        />
      ) : null}

      <Modal visible={showDelist} transparent animationType="fade" onRequestClose={() => setShowDelist(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard} testID="detail-delist-modal">
            <Text style={typography.heading}>Delist resource?</Text>
            <Text style={typography.body}>
              {resource.title} will no longer be listed in the public catalog.
            </Text>
            {delistError ? (
              <Text style={styles.errorText} accessibilityRole="alert">
                {delistError}
              </Text>
            ) : null}
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setShowDelist(false)}
                disabled={delisting}
                style={[shared.button, styles.modalButton]}
                accessibilityRole="button"
                accessibilityLabel="Cancel delist"
              >
                <Text style={shared.buttonText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => void handleConfirmDelist()}
                disabled={delisting}
                style={[shared.button, styles.dangerButton, delisting ? styles.disabled : null]}
                accessibilityRole="button"
                accessibilityLabel="Confirm delist"
                accessibilityState={{ disabled: delisting, busy: delisting }}
              >
                {delisting ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={[shared.buttonText, shared.primaryButtonText]}>Delist</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
