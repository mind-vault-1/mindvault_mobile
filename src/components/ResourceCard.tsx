// @ts-nocheck
import * as Clipboard from "expo-clipboard";
import { useMemo, useState } from "react";
import { validateStellarSecret } from "../utils/validateStellarSecret";
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
  const [secretKeyTouched, setSecretKeyTouched] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Dynamic styles that depend on runtime theme colors — must live inside the component.
  const dynamicStyles = useMemo(
    () =>
      StyleSheet.create({
        shareButton: {
          backgroundColor: colors.primary,
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
        primaryButton: {
          backgroundColor: colors.primary,
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
        secondaryButton: {
          backgroundColor: colors.neutralBg,
        },
      }),
    [colors]
  );

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

  const secretKeyValidation = useMemo(() => validateStellarSecret(secretKey), [secretKey]);

  async function handleSavePrice() {
    resetError();
    setSuccessMessage(null);

    if (!secretKeyValidation.isValid) {
      setSecretKeyTouched(true);
      return;
    }

    const ok = await editPrice(resource.id, newPrice, secretKey);
    if (ok) {
      setSuccessMessage("Price edit submitted.");
      setEditing(false);
      setSecretKey("");
      setSecretKeyTouched(false);
    }
  }

  const isBusy = status !== "idle";
  const isSaveDisabled = isBusy || !newPrice || !secretKeyValidation.isValid;

  const secretKeyFieldError = secretKeyTouched && secretKey.length > 0 && !secretKeyValidation.isValid
    ? secretKeyValidation.errorMessage
    : null;

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
          <Pressable
            onPress={handleShare}
            style={[shared.button, dynamicStyles.shareButton]}
            accessibilityRole="button"
            accessibilityLabel={`Share ${resource.title}`}
            accessibilityHint="Opens the share sheet with the resource title and URL"
          >
            <Text style={[shared.buttonText, styles.primaryButtonText]}>Share</Text>
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
            style={dynamicStyles.input}
            editable={!isBusy}
            accessibilityLabel="New price in USDC"
            accessibilityHint="Enter the updated price for this resource"
          />
          <TextInput
            value={secretKey}
            onChangeText={(text) => {
              setSecretKey(text);
              if (!secretKeyTouched) setSecretKeyTouched(true);
            }}
            onBlur={() => setSecretKeyTouched(true)}
            placeholder="Stellar secret key"
            placeholderTextColor={colors.textSubtle}
            secureTextEntry
            style={dynamicStyles.input}
            editable={!isBusy}
            accessibilityLabel="Stellar secret key"
            accessibilityHint="Enter your Stellar secret key to sign the price update transaction"
          />
          <View style={styles.actionRow}>
            <Pressable
              onPress={() => setEditing(false)}
              style={[shared.button, dynamicStyles.secondaryButton]}
              disabled={isBusy}
              accessibilityRole="button"
              accessibilityLabel="Cancel price edit"
              accessibilityHint="Discards changes and closes the price editor"
              accessibilityState={{ disabled: isBusy }}
            >
              <Text style={shared.buttonText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleSavePrice}
              style={[
                shared.button,
                dynamicStyles.primaryButton,
                isSaveDisabled ? styles.disabledButton : null,
              ]}
              disabled={isSaveDisabled}
              accessibilityRole="button"
              accessibilityLabel="Save new price"
              accessibilityHint={
                isBusy
                  ? "Transaction in progress, please wait"
                  : "Submits the price update transaction to the Stellar network"
              }
              accessibilityState={{ disabled: isSaveDisabled, busy: isBusy }}
            >
              {isBusy ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={[shared.buttonText, styles.primaryButtonText]}>Save Price</Text>
              )}
            </Pressable>
          </View>
          {statusLabel ? (
            <Text
              style={dynamicStyles.statusText}
              accessibilityLiveRegion="polite"
              accessibilityRole="status"
            >
              {statusLabel}
            </Text>
          ) : null}
          {secretKeyFieldError ? (
            <Text
              style={dynamicStyles.errorText}
              accessibilityLiveRegion="assertive"
              accessibilityRole="alert"
            >
              {secretKeyFieldError}
            </Text>
          ) : null}
          {error ? (
            <Text
              style={dynamicStyles.errorText}
              accessibilityLiveRegion="assertive"
              accessibilityRole="alert"
            >
              {error}
            </Text>
          ) : null}
          {successMessage ? (
            <Text
              style={dynamicStyles.successText}
              accessibilityLiveRegion="polite"
              accessibilityRole="status"
            >
              {successMessage}
            </Text>
          ) : null}
        </View>
      ) : (
        <Pressable
          onPress={() => setEditing(true)}
          style={[shared.button, styles.editButton]}
          accessibilityRole="button"
          accessibilityLabel={`Edit price for ${resource.title}`}
          accessibilityHint="Opens the price editor for this resource"
        >
          <Text style={shared.buttonText}>Edit price</Text>
        </Pressable>
      )}
    </View>
  );
}

// Static styles that do not depend on theme colors.
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
  editor: {
    marginTop: 16,
    gap: 10,
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  primaryButtonText: {
    color: "#ffffff",
  },
  disabledButton: {
    opacity: 0.6,
  },
  editButton: {
    marginTop: 12,
  },
});
