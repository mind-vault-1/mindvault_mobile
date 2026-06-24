import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import * as Sharing from "expo-sharing";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { fetchResource } from "../api/resources";
import type { RootStackParamList } from "../navigation";
import type { Resource } from "../types";
import { colors, shared, spacing, typography } from "../theme";
import { openExternalUrl, stellarExpertAccountUrl, stellarExpertTxUrl } from "../utils/stellarExpert";

type Props = NativeStackScreenProps<RootStackParamList, "ResourceDetail">;

function shortenAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function verificationStyle(status: Resource["verificationStatus"]) {
  switch (status) {
    case "verified":
      return { backgroundColor: colors.successBg, color: colors.success };
    case "rejected":
      return { backgroundColor: colors.dangerBg, color: colors.danger };
    default:
      return { backgroundColor: colors.neutralBg, color: colors.textMuted };
  }
}

function onchainStyle(status: Resource["onchainStatus"]) {
  switch (status) {
    case "registered":
      return { backgroundColor: colors.primaryMuted, color: colors.primary };
    case "failed":
      return { backgroundColor: colors.dangerBg, color: colors.danger };
    case "pending":
      return { backgroundColor: colors.warningBg, color: colors.warning };
    default:
      return { backgroundColor: colors.neutralBg, color: colors.textSubtle };
  }
}

export function ResourceDetailScreen({ route, navigation }: Props) {
  const { resourceId } = route.params;
  const [resource, setResource] = useState<Resource | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const data = await fetchResource(resourceId);
        setResource(data);
        navigation.setOptions({ title: data.title });
      } catch {
        setError("Resource not found.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [resourceId, navigation]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(timer);
  }, [toast]);

  async function handleCopy() {
    if (!resource) return;
    await Clipboard.setStringAsync(resource.accessUrl);
    setToast("Resource URL copied");
  }

  async function handleShare() {
    if (!resource) return;
    try {
      await Sharing.shareAsync(resource.accessUrl);
    } catch (error) {
      setToast("Unable to share URL");
    }
  }

  function handleOpenOwner() {
    if (!resource) return;
    const url = stellarExpertAccountUrl({ accountId: resource.walletAddress });
    openExternalUrl(url).catch(() => setToast("Unable to open explorer"));
  }

  function handleOpenTx() {
    if (!resource?.onchainTxHash) return;
    const url = stellarExpertTxUrl({ txHash: resource.onchainTxHash });
    openExternalUrl(url).catch(() => setToast("Unable to open explorer"));
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
          <Pressable
            style={[shared.button, shared.primaryButton]}
            onPress={() => navigation.goBack()}
          >
            <Text style={[shared.buttonText, shared.primaryButtonText]}>
              Go Back
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const verification = verificationStyle(resource.verificationStatus);
  const onchain = onchainStyle(resource.onchainStatus);

  return (
    <SafeAreaView style={shared.screen} edges={["bottom"]}>
      <View style={styles.content}>
        <Text style={typography.subtitle}>Resource</Text>
        <Text style={typography.title}>{resource.title}</Text>

        {resource.publisherName ? (
          <Text style={typography.body}>Published by {resource.publisherName}</Text>
        ) : null}

        <View style={styles.badges}>
          <View style={[shared.badge, { backgroundColor: verification.backgroundColor }]}>
            <Text style={[shared.badgeText, { color: verification.color }]}>
              {resource.verificationStatus}
            </Text>
          </View>
          <View style={[shared.badge, { backgroundColor: onchain.backgroundColor }]}>
            <Text style={[shared.badgeText, { color: onchain.color }]}>
              {resource.onchainStatus === "none"
                ? "not on-chain"
                : resource.onchainStatus}
            </Text>
          </View>
        </View>

        <Text style={[typography.price, styles.price]}>
          {resource.price} USDC
        </Text>

        <View style={styles.infoRow}>
          <Text style={styles.label}>Owner</Text>
          <Pressable onPress={handleOpenOwner}>
            <Text style={[typography.body, styles.linkText]}>
              {shortenAddress(resource.walletAddress)}
            </Text>
          </Pressable>
        </View>

        {resource.onchainTxHash ? (
          <View style={styles.infoRow}>
            <Text style={styles.label}>Tx</Text>
            <Pressable onPress={handleOpenTx}>
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
          <Text style={typography.body}>{resource.resourceType}</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.label}>Access URL</Text>
        </View>
        <Text style={styles.urlText}>{resource.accessUrl}</Text>

        <Pressable
          style={[shared.button, shared.primaryButton, styles.actionButton]}
          onPress={handleCopy}
        >
          <Text style={[shared.buttonText, shared.primaryButtonText]}>
            Copy Access URL
          </Text>
        </Pressable>

        <Pressable
          style={[shared.button, styles.actionButton]}
          onPress={handleShare}
        >
          <Text style={shared.buttonText}>Share Access URL</Text>
        </Pressable>
      </View>

      {toast ? (
        <View style={styles.toast}>
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
    flex: 1,
    padding: spacing.lg,
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
  actionButton: {
    alignSelf: "stretch",
    alignItems: "center",
    paddingVertical: 12,
  },
  urlText: {
    fontSize: 13,
    color: colors.textSubtle,
    lineHeight: 18,
  },
  linkText: {
    color: colors.primary,
  },
  mono: {
    fontFamily: "monospace",
    fontSize: 12,
    maxWidth: 220,
  },
  toast: {
    position: "absolute",
    bottom: spacing.xl,
    left: spacing.lg,
    right: spacing.lg,
    backgroundColor: colors.text,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  toastText: {
    color: "#ffffff",
    textAlign: "center",
    fontSize: 14,
    fontWeight: "500",
  },
});
