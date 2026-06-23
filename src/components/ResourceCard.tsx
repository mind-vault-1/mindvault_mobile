import * as Clipboard from "expo-clipboard";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { Resource } from "../types";
import { colors, shared, typography } from "../theme";

interface ResourceCardProps {
  resource: Resource;
  onCopyUrl: (message: string) => void;
  onRegister?: (resource: Resource) => void;
}

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

export function ResourceCard({ resource, onCopyUrl, onRegister }: ResourceCardProps) {
  const verification = verificationStyle(resource.verificationStatus);
  const onchain = onchainStyle(resource.onchainStatus);

  async function handleCopy() {
    await Clipboard.setStringAsync(resource.accessUrl);
    onCopyUrl("Resource URL copied");
  }

  return (
    <View style={shared.card}>
      <Text style={typography.cardTitle}>{resource.title}</Text>

      {resource.publisherName ? (
        <Text style={typography.body}>by {resource.publisherName}</Text>
      ) : null}

      <Text style={typography.caption}>
        Owner: {shortenAddress(resource.walletAddress)}
      </Text>

      <View style={styles.badges}>
        <View
          style={[shared.badge, { backgroundColor: verification.backgroundColor }]}
          accessibilityRole="text"
          accessibilityLabel={`Verification status: ${resource.verificationStatus}`}
        >
          <Text style={[shared.badgeText, { color: verification.color }]}>
            {resource.verificationStatus}
          </Text>
        </View>
        <View
          style={[shared.badge, { backgroundColor: onchain.backgroundColor }]}
          accessibilityRole="text"
          accessibilityLabel={`On-chain status: ${
            resource.onchainStatus === "none" ? "not on-chain" : resource.onchainStatus
          }`}
        >
          <Text style={[shared.badgeText, { color: onchain.color }]}>
            {resource.onchainStatus === "none" ? "not on-chain" : resource.onchainStatus}
          </Text>
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={typography.price}>{resource.price} USDC</Text>
        <Pressable
          onPress={handleCopy}
          style={shared.button}
          accessibilityRole="button"
          accessibilityLabel={`Copy URL for ${resource.title}`}
          accessibilityHint="Copies the resource access URL to your clipboard"
        >
          <Text style={shared.buttonText}>Copy URL</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  badges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  actions: {
    flexDirection: "row",
    gap: 8,
  },
  registerBtn: {
    backgroundColor: colors.primary,
  },
});
