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
import {
  fetchVerification,
  formatConfidence,
  type VerificationDetails,
} from "../api/verification";
import { useAppForeground } from "../hooks/useAppForeground";
import { ResourceThumbnail } from "../components/ResourceCard";
import { StatusBadge } from "../components/StatusBadge";
import { PaywallModal } from "../components/PaywallModal";
import { useToast } from "../components/ToastProvider";
import type { RootStackParamList } from "../navigation";
import type { Resource } from "../types";
import { getResourceTypeLabel } from "../types";
import { spacing } from "../theme";
import type { ThemeColors } from "../theme";
import { useAppTheme } from "../theme/ThemeProvider";
import { openExternalUrl, stellarExpertAccountUrl, stellarExpertTxUrl } from "../utils/stellarExpert";
import { shareResource } from "../utils/shareResource";

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
  if (updatedAt) return { label: "Last updated", text: updatedAt };

  const publishedAt = formatTimestamp(resource.publishedAt);
  if (publishedAt) return { label: "Published", text: publishedAt };

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
        err instanceof Error ? err.message : "Failed to load verification details";
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
            setError("An unexpected error occurred.");
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
    toast.success("Resource URL copied");
  }

  async function handleShare() {
    if (!resource) return;
    const outcome = await shareResource(resource.title, resource.accessUrl);
    if (outcome === "error") {
      toast.error("Unable to share URL");
    }
  }

  function handleOpenOwner() {
    if (!resource) return;
    const url = stellarExpertAccountUrl({ accountId: resource.walletAddress });
    openExternalUrl(url).catch(() => toast.error("Unable to open explorer"));
  }

  function handleOpenTx() {
    if (!resource?.onchainTxHash) return;
    const url = stellarExpertTxUrl({ txHash: resource.onchainTxHash });
    openExternalUrl(url).catch(() => toast.error("Unable to open explorer"));
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
                Try Again
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
              Go Back
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
        <Text style={typography.subtitle}>Resource</Text>
        <Text style={typography.title}>{resource.title}</Text>

        {resource.publisherName ? (
          <Text style={typography.body}>Published by {resource.publisherName}</Text>
        ) : null}

        {timestamp ? (
          <Text style={styles.metadata}>
            {timestamp.label} {timestamp.text}
          </Text>
        ) : null}

        <View style={styles.badges}>
          <StatusBadge kind="verification" status={resource.verificationStatus} />
          <StatusBadge kind="onchain" status={resource.onchainStatus} />
        </View>

        <Text style={[typography.price, styles.price]}>
          {resource.price} USDC
        </Text>

        <Pressable
          style={[shared.button, shared.primaryButton, styles.actionButton]}
          accessibilityRole="button"
          accessibilityLabel={`Unlock for ${resource.price} USDC`}
          onPress={() => setPaywallVisible(true)}
        >
          <Text style={[shared.buttonText, shared.primaryButtonText]}>Unlock for {resource.price} USDC</Text>
        </Pressable>

        <View style={styles.infoRow}>
          <Text style={styles.label}>Owner</Text>
          <Pressable
            onPress={handleOpenOwner}
            style={styles.linkTarget}
            accessibilityRole="link"
            accessibilityLabel={`Owner: ${resource.walletAddress}`}
            accessibilityHint="Opens the owner's account in Stellar Explorer"
          >
            <Text style={[typography.body, styles.linkText]}>
              {shortenAddress(resource.walletAddress)}
            </Text>
          </Pressable>
        </View>

        {resource.onchainTxHash ? (
          <View style={styles.infoRow}>
            <Text style={styles.label}>Tx</Text>
            <Pressable
              onPress={handleOpenTx}
              style={styles.linkTarget}
              accessibilityRole="link"
              accessibilityLabel={`Transaction: ${resource.onchainTxHash}`}
              accessibilityHint="Opens the transaction in Stellar Explorer"
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
          <Text style={styles.label}>Type</Text>
          <Text style={typography.body}>{getResourceTypeLabel(resource.resourceType)}</Text>
        </View>

        <View style={styles.verificationSection}>
          <Pressable
            style={styles.verificationHeader}
            onPress={toggleVerification}
            accessibilityRole="button"
            accessibilityLabel="Verification"
            accessibilityState={{ expanded: verificationExpanded }}
            accessibilityHint="Toggles the verification details section"
          >
            <Text style={styles.verificationHeaderTitle}>Verification</Text>
            <Text style={styles.verificationChevron}>
              {verificationExpanded ? "▲" : "▼"}
            </Text>
          </Pressable>

          {verificationExpanded ? (
            <View
              style={styles.verificationContent}
              accessibilityLabel="Verification details"
            >
              {verificationLoading ? (
                <View
                  style={styles.verificationLoadingRow}
                  accessibilityRole="progressbar"
                  accessibilityLabel="Loading verification details"
                >
                  <ActivityIndicator color={colors.primary} size="small" />
                  <Text style={styles.verificationLoadingText}>
                    Loading verification details…
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
                    accessibilityLabel="Retry loading verification"
                  >
                    <Text style={styles.retryText}>Retry</Text>
                  </Pressable>
                </View>
              ) : verificationDetails ? (
                <View style={{ gap: spacing.sm }}>
                  <View style={styles.infoRow}>
                    <Text style={styles.label}>Status</Text>
                    <Text
                      style={typography.body}
                      accessibilityLabel={`Verification Status: ${verificationDetails.status}`}
                    >
                      {verificationDetails.status}
                    </Text>
                  </View>

                  {verificationDetails.verification ? (
                    <>
                      <View style={styles.infoRow}>
                        <Text style={styles.label}>Originality</Text>
                        <Text style={typography.body}>
                          {verificationDetails.verification.isOriginal
                            ? "Original"
                            : "Possible copy"}
                        </Text>
                      </View>
                      <View style={styles.infoRow}>
                        <Text style={styles.label}>Confidence</Text>
                        <Text style={typography.body}>
                          {formatConfidence(verificationDetails.verification.confidence)}
                        </Text>
                      </View>
                      {verificationDetails.verification.flags.length > 0 ? (
                        <View style={{ gap: 2 }}>
                          <Text style={styles.label}>Notes</Text>
                          {verificationDetails.verification.flags.map((flag) => (
                            <Text key={flag} style={typography.body}>
                              • {flag}
                            </Text>
                          ))}
                        </View>
                      ) : null}
                      {formatTimestamp(verificationDetails.verification.checkedAt) ? (
                        <View style={styles.infoRow}>
                          <Text style={styles.label}>Checked</Text>
                          <Text style={styles.metadata}>
                            {formatTimestamp(verificationDetails.verification.checkedAt)}
                          </Text>
                        </View>
                      ) : null}
                    </>
                  ) : (
                    <Text style={styles.metadata}>No AI check has run for this resource yet.</Text>
                  )}
                </View>
              ) : null}
            </View>
          ) : null}
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.label}>Access URL</Text>
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
            Copy Access URL
          </Text>
        </Pressable>

        <Pressable
          style={[shared.button, styles.actionButton]}
          onPress={handleShare}
        >
          <Text style={shared.buttonText}>Share Access URL</Text>
        </Pressable>
      </ScrollView>

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
