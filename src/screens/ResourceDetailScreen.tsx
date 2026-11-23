import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { fetchResource, ResourceFetchError } from "../api/resources";
import { fetchLeaseStatus, type LeaseStatus } from "../api/leases";
import {
  fetchVerification,
  formatConfidence,
  type VerificationDetails,
} from "../api/verification";
import { useAppForeground } from "../hooks/useAppForeground";
import { getPublicKey } from "../services/wallet";
import { FavoriteButton, ResourceThumbnail } from "../components/ResourceCard";
import { StatusBadge } from "../components/StatusBadge";
import { PaywallModal } from "../components/PaywallModal";
import { useToast } from "../components/ToastProvider";
import type { RootStackParamList } from "../navigation";
import type { Resource } from "../types";
import { getResourceTypeLabel } from "../types";
import { spacing } from "../theme";
import type { ThemeColors } from "../theme";
import { useAppTheme } from "../theme/ThemeProvider";
import { openExternalUrl, stellarExpertTxUrl } from "../utils/stellarExpert";
import { ResourceQrSheet } from "../components/ResourceQrSheet";
import { shareResource } from "../utils/shareResource";
import { hapticImpact } from "../utils/haptics";
import { t } from "../i18n";

type Props = NativeStackScreenProps<RootStackParamList, "ResourceDetail">;

function shortenAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function formatTimestamp(value: string | undefined): string | null {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function getResourceTimestamp(resource: Resource): { label: string; text: string } | null {
  const updatedAt = formatTimestamp(resource.updatedAt);
  if (updatedAt) return { label: t("detail.lastUpdated"), text: updatedAt };

  const publishedAt = formatTimestamp(resource.publishedAt);
  if (publishedAt) return { label: t("detail.published"), text: publishedAt };

  return null;
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    centered: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      padding: spacing.lg,
      gap: spacing.md,
    },
    errorText: {
      color: colors.danger,
      fontSize: 16,
      fontWeight: "500",
    },
    content: {
      padding: spacing.lg,
      paddingBottom: spacing.xxl,
      gap: spacing.md,
    },
    price: {
      fontSize: 24,
    },
    badges: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
    },
    leaseBadge: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
      borderRadius: 8,
      alignSelf: "flex-start",
    },
    leaseBadgeText: {
      fontSize: 13,
      fontWeight: "600",
    },
    infoRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    label: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.textMuted,
    },
    metadata: {
      color: colors.textSubtle,
      fontSize: 14,
      lineHeight: 20,
    },
    titleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.sm,
    },
    titleText: {
      flex: 1,
    },
    actionButton: {
      alignSelf: "stretch",
      alignItems: "center",
      paddingVertical: 12,
    },
    urlText: {
      fontSize: 13,
      color: colors.textSubtle,
      lineHeight: 18,
      flexShrink: 1,
    },
    linkText: {
      color: colors.primary,
    },
    linkTarget: {
      minHeight: 44,
      minWidth: 44,
      justifyContent: "center",
      paddingHorizontal: 8,
    },
    mono: {
      fontFamily: "monospace",
      fontSize: 12,
      maxWidth: 220,
    },
    verificationSection: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      backgroundColor: colors.surface,
      overflow: "hidden",
      marginTop: spacing.xs,
    },
    verificationHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      padding: spacing.md,
      backgroundColor: colors.neutralBg,
    },
    verificationHeaderTitle: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.text,
    },
    verificationChevron: {
      fontSize: 14,
      color: colors.textMuted,
    },
    verificationContent: {
      padding: spacing.md,
      gap: spacing.sm,
    },
    verificationLoadingRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingVertical: spacing.xs,
    },
    verificationLoadingText: {
      color: colors.textMuted,
      fontSize: 13,
    },
    verificationErrorContainer: {
      gap: spacing.sm,
      paddingVertical: spacing.xs,
    },
    retryButton: {
      alignSelf: "flex-start",
      paddingHorizontal: 12,
      paddingVertical: 6,
      backgroundColor: colors.dangerBg,
      borderRadius: 8,
    },
    retryText: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.danger,
    },
  });
}

export function ResourceDetailScreen({ route, navigation }: Props) {
  const { colors, shared, typography } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const { resourceId } = route.params;
  const [resource, setResource] = useState<Resource | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const inFlightRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [isTransientError, setIsTransientError] = useState(false);
  const toast = useToast();
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [qrVisible, setQrVisible] = useState(false);
  const [leaseStatus, setLeaseStatus] = useState<LeaseStatus | null>(null);
  const [countdown, setCountdown] = useState<string>("");

  const leaseExpiresAt = leaseStatus?.expiresAt;
  const leaseState = leaseStatus?.state;

  useEffect(() => {
    if (!leaseExpiresAt || leaseState !== "Active") {
      setCountdown("");
      return;
    }
    const expiresAt = leaseExpiresAt;
    let timer: ReturnType<typeof setInterval> | null = null;
    function updateCountdown() {
      const remainingMs = new Date(expiresAt).getTime() - Date.now();
      if (remainingMs <= 0) {
        if (timer) clearInterval(timer);
        setCountdown(t("detail.expired"));
        setLeaseStatus((prev) => (prev ? { ...prev, hasActiveLease: false, state: "Expired" } : null));
        return;
      }
      const totalSec = Math.floor(remainingMs / 1000);
      const hours = Math.floor(totalSec / 3600);
      const mins = Math.floor((totalSec % 3600) / 60);
      const secs = totalSec % 60;
      setCountdown(hours > 0 ? `${hours}h ${mins}m` : `${mins}m ${secs}s`);
    }
    updateCountdown();
    timer = setInterval(updateCountdown, 1000);
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [leaseExpiresAt, leaseState]);

  const [verificationDetails, setVerificationDetails] = useState<VerificationDetails | null>(null);
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [verificationExpanded, setVerificationExpanded] = useState(false);

  const loadVerification = useCallback(async () => {
    setVerificationLoading(true);
    setVerificationError(null);
    try {
      const data = await fetchVerification(resourceId);
      setVerificationDetails(data);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : t("detail.verificationLoadError");
      setVerificationError(message);
    } finally {
      setVerificationLoading(false);
    }
  }, [resourceId]);

  // Fetched on first expand, so opening a resource doesn't cost an extra request.
  function toggleVerification() {
    const expanding = !verificationExpanded;
    setVerificationExpanded(expanding);
    if (expanding && !verificationDetails && !verificationLoading) {
      void loadVerification();
    }
  }

  // `background` reloads keep the current content on screen (pull to refresh,
  // returning to the foreground) instead of swapping it for a spinner. Only one
  // request runs at a time; overlapping triggers are dropped.
  const loadResource = useCallback(
    async (background = false) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      if (!background) setLoading(true);
      try {
        const data = await fetchResource(resourceId);
        setResource(data);
        void getPublicKey()
          .then((holder) => fetchLeaseStatus(resourceId, holder ?? undefined))
          .then(setLeaseStatus)
          .catch(() => {});
        setError(null);
        setIsTransientError(false);
        navigation.setOptions({ title: data.title });
      } catch (err) {
        // A failed background reload leaves the last good data showing.
        if (!background) {
          if (err instanceof ResourceFetchError) {
            setError(err.message);
            setIsTransientError(err.isTransient);
          } else {
            setError(t("detail.unexpectedError"));
            setIsTransientError(true);
          }
        }
      } finally {
        inFlightRef.current = false;
        setLoading(false);
      }
    },
    [resourceId, navigation]
  );

  useEffect(() => {
    void loadResource();
  }, [loadResource]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadResource(true);
    } finally {
      setRefreshing(false);
    }
  }, [loadResource]);

  useAppForeground(() => {
    if (resource) void loadResource(true);
  });

  async function handleCopy() {
    if (!resource) return;
    await Clipboard.setStringAsync(resource.accessUrl);
    void hapticImpact();
    toast.success(t("detail.urlCopied"));
  }

  async function handleShare() {
    if (!resource) return;
    const outcome = await shareResource(resource.title, resource.accessUrl);
    if (outcome === "error") {
      toast.error(t("detail.shareError"));
    }
  }

  function handleOpenTx() {
    if (!resource?.onchainTxHash) return;
    const url = stellarExpertTxUrl({ txHash: resource.onchainTxHash });
    openExternalUrl(url).catch(() => toast.error(t("detail.explorerError")));
  }

  if (loading) {
    return (
      <SafeAreaView style={shared.screen} edges={["bottom"]}>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !resource) {
    return (
      <SafeAreaView style={shared.screen} edges={["bottom"]}>
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          {isTransientError ? (
            <Pressable
              style={[shared.button, shared.primaryButton]}
              onPress={() => void loadResource()}
            >
              <Text style={[shared.buttonText, shared.primaryButtonText]}>
                {t("detail.tryAgain")}
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            style={[shared.button, isTransientError ? undefined : shared.primaryButton]}
            onPress={() => navigation.goBack()}
          >
            <Text
              style={[
                shared.buttonText,
                isTransientError ? undefined : shared.primaryButtonText,
              ]}
            >
              {t("detail.goBack")}
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const timestamp = getResourceTimestamp(resource);

  return (
    <SafeAreaView style={shared.screen} edges={["bottom"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void handleRefresh()}
            tintColor={colors.primary}
          />
        }
      >
        {resource.thumbnailUrl ? (
          <ResourceThumbnail
            key={resource.thumbnailUrl}
            uri={resource.thumbnailUrl}
            title={resource.title}
            resourceType={resource.resourceType}
          />
        ) : null}
        <Text style={typography.subtitle}>{t("detail.resourceSubtitle")}</Text>
        <View style={styles.titleRow}>
          <Text style={[typography.title, styles.titleText]}>{resource.title}</Text>
          <FavoriteButton resourceId={resource.id} title={resource.title} />
        </View>

        {resource.publisherName ? (
          <Text style={typography.body}>
            {t("detail.publishedBy", { publisherName: resource.publisherName })}
          </Text>
        ) : null}

        {timestamp ? (
          <Text style={styles.metadata}>
            {timestamp.label} {timestamp.text}
          </Text>
        ) : null}

        <View style={styles.badges}>
          <StatusBadge kind="verification" status={resource.verificationStatus} />
          <StatusBadge kind="onchain" status={resource.onchainStatus} />
          {leaseStatus?.state === "Active" && leaseStatus.expiresAt ? (
            <View
              style={[styles.leaseBadge, { backgroundColor: colors.primaryMuted }]}
              accessibilityRole="text"
              accessibilityLabel={t("detail.activeLeaseLabel", {
                time: new Date(leaseStatus.expiresAt).toLocaleTimeString(),
                remaining: countdown ? `, ${countdown} remaining` : "",
              })}
            >
              <Text style={[styles.leaseBadgeText, { color: colors.primary }]}>
                {countdown
                  ? t("detail.accessUntil", {
                      time: new Date(leaseStatus.expiresAt).toLocaleTimeString(),
                      remaining: countdown,
                    })
                  : t("detail.accessUntilNoRemaining", {
                      time: new Date(leaseStatus.expiresAt).toLocaleTimeString(),
                    })}
              </Text>
            </View>
          ) : leaseStatus?.state === "Expired" ? (
            <View
              style={[styles.leaseBadge, { backgroundColor: colors.dangerBg ?? "#fee2e2" }]}
              accessibilityRole="text"
              accessibilityLabel={t("detail.leaseExpired")}
            >
              <Text style={[styles.leaseBadgeText, { color: colors.danger }]}>
                {t("detail.leaseExpired")}
              </Text>
            </View>
          ) : null}
        </View>

        <Text style={[typography.price, styles.price]}>
          {t("detail.priceUsdc", { price: resource.price })}
        </Text>

        {leaseStatus?.hasActiveLease ? (
          <Pressable
            style={[shared.button, shared.primaryButton, styles.actionButton]}
            accessibilityRole="button"
            accessibilityLabel={t("detail.openResource")}
            onPress={() => {
              if (resource.accessUrl) {
                void openExternalUrl(resource.accessUrl);
              } else {
                toast.info(t("detail.unlockedActive"));
              }
            }}
          >
            <Text style={[shared.buttonText, shared.primaryButtonText]}>{t("detail.open")}</Text>
          </Pressable>
        ) : (
          <Pressable
            style={[shared.button, shared.primaryButton, styles.actionButton]}
            accessibilityRole="button"
            accessibilityLabel={t("detail.unlockForPrice", { price: resource.price })}
            onPress={() => setPaywallVisible(true)}
          >
            <Text style={[shared.buttonText, shared.primaryButtonText]}>
              {t("detail.unlockForPrice", { price: resource.price })}
            </Text>
          </Pressable>
        )}

        <View style={styles.infoRow}>
          <Text style={styles.label}>{t("detail.owner")}</Text>
          <Pressable
            onPress={() => navigation.navigate("PublisherPublic", { address: resource.walletAddress })}
            style={styles.linkTarget}
            accessibilityRole="link"
            accessibilityLabel={t("detail.ownerLabel", { address: resource.walletAddress })}
            accessibilityHint={t("detail.ownerHint")}
          >
            <Text style={[typography.body, styles.linkText]}>
              {shortenAddress(resource.walletAddress)}
            </Text>
          </Pressable>
        </View>

        <Pressable
          style={[shared.button, styles.actionButton]}
          onPress={() => navigation.navigate("Catalog", { owner: resource.walletAddress })}
          accessibilityRole="button"
          accessibilityLabel={t("detail.moreFromPublisher")}
          accessibilityHint={t("detail.moreFromPublisherHint")}
        >
          <Text style={shared.buttonText}>{t("detail.moreFromPublisher")}</Text>
        </Pressable>

        {resource.onchainTxHash ? (
          <View style={styles.infoRow}>
            <Text style={styles.label}>{t("detail.tx")}</Text>
            <Pressable
              onPress={handleOpenTx}
              style={styles.linkTarget}
              accessibilityRole="link"
              accessibilityLabel={t("detail.txLabel", { txHash: resource.onchainTxHash })}
              accessibilityHint={t("detail.txHint")}
            >
              <Text
                style={[typography.body, styles.linkText, styles.mono]}
                numberOfLines={1}
                ellipsizeMode="middle"
              >
                {resource.onchainTxHash}
              </Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.infoRow}>
          <Text style={styles.label}>{t("detail.type")}</Text>
          <Text style={typography.body}>{getResourceTypeLabel(resource.resourceType)}</Text>
        </View>

        <View style={styles.verificationSection}>
          <Pressable
            style={styles.verificationHeader}
            onPress={toggleVerification}
            accessibilityRole="button"
            accessibilityLabel={t("detail.verification")}
            accessibilityState={{ expanded: verificationExpanded }}
            accessibilityHint={t("detail.verificationToggleHint")}
          >
            <Text style={styles.verificationHeaderTitle}>{t("detail.verification")}</Text>
            <Text style={styles.verificationChevron}>
              {verificationExpanded ? "▲" : "▼"}
            </Text>
          </Pressable>

          {verificationExpanded ? (
            <View
              style={styles.verificationContent}
              accessibilityLabel={t("detail.verificationDetails")}
            >
              {verificationLoading ? (
                <View
                  style={styles.verificationLoadingRow}
                  accessibilityRole="progressbar"
                  accessibilityLabel={t("detail.loadingVerificationLabel")}
                >
                  <ActivityIndicator color={colors.primary} size="small" />
                  <Text style={styles.verificationLoadingText}>
                    {t("detail.loadingVerification")}
                  </Text>
                </View>
              ) : verificationError ? (
                <View style={styles.verificationErrorContainer}>
                  <Text style={styles.errorText} accessibilityRole="alert">
                    {verificationError}
                  </Text>
                  <Pressable
                    style={styles.retryButton}
                    onPress={() => void loadVerification()}
                    accessibilityRole="button"
                    accessibilityLabel={t("detail.retryVerificationLabel")}
                  >
                    <Text style={styles.retryText}>{t("detail.retry")}</Text>
                  </Pressable>
                </View>
              ) : verificationDetails ? (
                <View style={{ gap: spacing.sm }}>
                  <View style={styles.infoRow}>
                    <Text style={styles.label}>{t("detail.status")}</Text>
                    <Text
                      style={typography.body}
                      accessibilityLabel={t("detail.statusLabel", { status: verificationDetails.status })}
                    >
                      {verificationDetails.status}
                    </Text>
                  </View>

                  {verificationDetails.verification ? (
                    <>
                      <View style={styles.infoRow}>
                        <Text style={styles.label}>{t("detail.originality")}</Text>
                        <Text style={typography.body}>
                          {verificationDetails.verification.isOriginal
                            ? t("detail.original")
                            : t("detail.possibleCopy")}
                        </Text>
                      </View>
                      <View style={styles.infoRow}>
                        <Text style={styles.label}>{t("detail.confidence")}</Text>
                        <Text style={typography.body}>
                          {formatConfidence(verificationDetails.verification.confidence)}
                        </Text>
                      </View>
                      {verificationDetails.verification.flags.length > 0 ? (
                        <View style={{ gap: 2 }}>
                          <Text style={styles.label}>{t("detail.notes")}</Text>
                          {verificationDetails.verification.flags.map((flag) => (
                            <Text key={flag} style={typography.body}>
                              • {flag}
                            </Text>
                          ))}
                        </View>
                      ) : null}
                      {formatTimestamp(verificationDetails.verification.checkedAt) ? (
                        <View style={styles.infoRow}>
                          <Text style={styles.label}>{t("detail.checked")}</Text>
                          <Text style={styles.metadata}>
                            {formatTimestamp(verificationDetails.verification.checkedAt)}
                          </Text>
                        </View>
                      ) : null}
                    </>
                  ) : (
                    <Text style={styles.metadata}>{t("detail.noAiCheck")}</Text>
                  )}
                </View>
              ) : null}
            </View>
          ) : null}
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.label}>{t("detail.accessUrl")}</Text>
        </View>
        <Text 
          style={styles.urlText}
          selectable={true}
        >
          {resource.accessUrl}
        </Text>

        <Pressable
          style={[shared.button, styles.actionButton]}
          onPress={handleCopy}
        >
          <Text style={shared.buttonText}>
            {t("detail.copyAccessUrl")}
          </Text>
        </Pressable>

        <Pressable
          style={[shared.button, styles.actionButton]}
          onPress={handleShare}
        >
          <Text style={shared.buttonText}>{t("detail.shareAccessUrl")}</Text>
        </Pressable>

        <Pressable
          style={[shared.button, styles.actionButton]}
          onPress={() => setQrVisible(true)}
          accessibilityRole="button"
          accessibilityLabel={t("detail.showQrCode")}
          accessibilityHint={t("detail.showQrCodeHint")}
        >
          <Text style={shared.buttonText}>{t("detail.shareAsQrCode")}</Text>
        </Pressable>
      </ScrollView>

      <ResourceQrSheet
        visible={qrVisible}
        resourceId={resource.id}
        resourceTitle={resource.title}
        onClose={() => setQrVisible(false)}
      />

      <PaywallModal
        key={resource.id}
        visible={paywallVisible}
        accessUrl={resource.accessUrl}
        resourceTitle={resource.title}
        price={resource.price}
        resourceId={resource.id}
        onClose={() => setPaywallVisible(false)}
      />

    </SafeAreaView>
  );
}
