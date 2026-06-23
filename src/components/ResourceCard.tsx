import * as Clipboard from "expo-clipboard";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { Resource } from "../types";
import { colors, shared, typography } from "../theme";
import { PaywallModal } from "./PaywallModal";

interface ResourceCardProps {
  resource: Resource;
  onCopyUrl: (message: string) => void;
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

export function ResourceCard({ resource, onCopyUrl }: ResourceCardProps) {
  const verification = verificationStyle(resource.verificationStatus);
  const onchain = onchainStyle(resource.onchainStatus);
  const [paywallOpen, setPaywallOpen] = useState(false);

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
        <View style={[shared.badge, { backgroundColor: verification.backgroundColor }]}>
          <Text style={[shared.badgeText, { color: verification.color }]}>
            {resource.verificationStatus}
          </Text>
        </View>
        <View style={[shared.badge, { backgroundColor: onchain.backgroundColor }]}>
          <Text style={[shared.badgeText, { color: onchain.color }]}>
            {resource.onchainStatus === "none" ? "not on-chain" : resource.onchainStatus}
          </Text>
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={typography.price}>{resource.price} USDC</Text>
        <View style={styles.actions}>
          <Pressable
            onPress={() => setPaywallOpen(true)}
            style={[shared.button, shared.primaryButton]}
            accessibilityLabel={`Access ${resource.title}`}
          >
            <Text style={[shared.buttonText, shared.primaryButtonText]}>Access</Text>
          </Pressable>
          <Pressable onPress={handleCopy} style={shared.button}>
            <Text style={shared.buttonText}>Copy URL</Text>
          </Pressable>
        </View>
      </View>

      <PaywallModal
        visible={paywallOpen}
        accessUrl={resource.accessUrl}
        resourceTitle={resource.title}
        price={resource.price}
        onClose={() => setPaywallOpen(false)}
      />
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
});
