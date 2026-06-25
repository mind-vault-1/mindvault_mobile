import * as Clipboard from "expo-clipboard";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import type { Resource } from "../types";
import { useEditPrice } from "../hooks/useEditPrice";
import type { ThemeColors } from "../theme";
import { useAppTheme } from "../theme/ThemeProvider";

interface ResourceCardProps {
  resource: Resource;
  onCopyUrl: (message: string) => void;
  onRegister?: (resource: Resource) => void;
  onPress?: () => void;
}

function shortenAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function verificationStyle(status: Resource["verificationStatus"], colors: ThemeColors) {
  switch (status) {
    case "verified":
      return { backgroundColor: colors.successBg, color: colors.success };
    case "rejected":
      return { backgroundColor: colors.dangerBg, color: colors.danger };
    default:
      return { backgroundColor: colors.neutralBg, color: colors.textMuted };
  }
}

function onchainStyle(status: Resource["onchainStatus"], colors: ThemeColors) {
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

export function ResourceCard({ resource, onCopyUrl, onRegister, onPress }: ResourceCardProps) {
  const { colors, shared, typography } = useAppTheme();
  const verification = verificationStyle(resource.verificationStatus, colors);
  const onchain = onchainStyle(resource.onchainStatus, colors);
  const { status, error, editPrice, resetError } = useEditPrice();
  const [editing, setEditing] = useState(false);
  const [newPrice, setNewPrice] = useState(resource.price);
  const [secretKey, setSecretKey] = useState("");
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function handleCopy() {
    await Clipboard.setStringAsync(resource.accessUrl);
    onCopyUrl("Resource URL copied");
  }

  /**
   * Opens the native iOS/Android share sheet with the resource title and URL.
   * - `message` is used on Android (plain text share).
   * - `url` is used on iOS (triggers the URL sharing path in the share sheet).
   * Both are included so the shared content always contains title + URL.
   */
  async function handleShare() {
    await Share.share({
      title: resource.title,
      message: `${resource.title}\n${resource.accessUrl}`,
      url: resource.accessUrl,
    });
  }

  async function handleSavePrice() {
    resetError();
    setSuccessMessage(null);
    const ok = await editPrice(resource.id, newPrice, secretKey);
    if (ok) {
      setSuccessMessage("Price edit submitted.");
      setEditing(false);
      setSecretKey("");
    }
  }

  const isBusy = status !== "idle";
  const statusLabel =
    status === "preparing"
      ? "Preparing transaction…"
      : status === "signing"
      ? "Signing transaction…"
      : status === "submitting"
      ? "Submitting transaction…"
      : null;

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
          <Pressable onPress={handleShare} style={[shared.button, styles.shareButton]}>
            <Text style={shared.buttonText}>Share</Text>
          </Pressable>
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

      {editing ? (
        <View style={styles.editor}>
          <TextInput
            value={newPrice}
            onChangeText={setNewPrice}
            placeholder="New price"
            placeholderTextColor={colors.textSubtle}
            keyboardType="numeric"
            style={styles.input}
            editable={!isBusy}
          />
          <TextInput
            value={secretKey}
            onChangeText={setSecretKey}
            placeholder="Stellar secret key"
            placeholderTextColor={colors.textSubtle}
            secureTextEntry
            style={styles.input}
            editable={!isBusy}
          />
          <View style={styles.actionRow}>
            <Pressable
              onPress={() => setEditing(false)}
              style={[shared.button, styles.secondaryButton]}
              disabled={isBusy}
            >
              <Text style={shared.buttonText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleSavePrice}
              style={[
                shared.button,
                styles.primaryButton,
                isBusy ? styles.disabledButton : null,
              ]}
              disabled={isBusy || !newPrice || !secretKey}
            >
              {isBusy ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={[shared.buttonText, styles.primaryButtonText]}>Save Price</Text>
              )}
            </Pressable>
          </View>
          {statusLabel ? <Text style={styles.statusText}>{statusLabel}</Text> : null}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          {successMessage ? <Text style={styles.successText}>{successMessage}</Text> : null}
        </View>
      ) : (
        <Pressable
          onPress={() => setEditing(true)}
          style={[shared.button, styles.editButton]}
        >
          <Text style={shared.buttonText}>Edit price</Text>
        </Pressable>
      )}
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
  shareButton: {
    backgroundColor: colors.primary,
  },
  editor: {
    marginTop: 16,
    gap: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    fontSize: 14,
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  primaryButton: {
    backgroundColor: colors.primary,
  },
  primaryButtonText: {
    color: "#ffffff",
  },
  disabledButton: {
    opacity: 0.6,
  },
  statusText: {
    color: colors.primary,
    fontSize: 13,
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
  },
  successText: {
    color: colors.success,
    fontSize: 13,
  },
  editButton: {
    marginTop: 12,
  },
  secondaryButton: {
    backgroundColor: colors.neutralBg,
  },
});
