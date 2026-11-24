import { useState, useMemo } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { maskApiKey, revokeApiKey, rotateApiKey } from "../api/publishers";
import { getApiKey, storeApiKey } from "../services/secureStorage";
import { spacing, type ThemeColors } from "../theme";
import { useAppTheme } from "../theme/ThemeProvider";

interface PublisherSettingsProps {
  visible: boolean;
  onClose: () => void;
  onApiKeySet: () => void;
  onViewProfile?: () => void;
}

type DestructiveAction = "rotate" | "revoke";

export function PublisherSettings({
  visible,
  onClose,
  onApiKeySet,
  onViewProfile,
}: PublisherSettingsProps) {
  const { colors, shared, typography } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [apiKey, setApiKey] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<DestructiveAction | null>(null);

  const loadApiKey = async () => {
    setError(null);
    setNotice(null);
    setConfirming(null);
    try {
      const key = await getApiKey();
      setHasKey(!!key);
      setApiKey(key ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load API key");
    }
  };

  const handleSave = async () => {
    if (!apiKey.trim()) {
      setError("API key cannot be empty");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await storeApiKey(apiKey.trim());
      setHasKey(true);
      onApiKeySet();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save API key");
    } finally {
      setLoading(false);
    }
  };

  const handleRotate = async () => {
    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      // The API module persists the new key only after the server confirms the
      // rotation, so a failure here leaves the old key untouched on this device.
      const newKey = await rotateApiKey();
      setApiKey(newKey);
      setHasKey(true);
      setConfirming(null);
      setNotice("API key rotated. The previous key no longer works on any device.");
      onApiKeySet();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rotate API key");
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async () => {
    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      await revokeApiKey();
      setApiKey("");
      setHasKey(false);
      setConfirming(null);
      setNotice(
        "API key revoked. This device is signed out of publisher features; save a new key to continue."
      );
      onApiKeySet();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke API key");
    } finally {
      setLoading(false);
    }
  };

  const confirmCopy =
    confirming === "rotate"
      ? {
          title: "Rotate API key?",
          body: "The current key stops working immediately. Any other device using it will be signed out.",
          confirmLabel: loading ? "Rotating..." : "Rotate key",
          onConfirm: handleRotate,
        }
      : confirming === "revoke"
        ? {
            title: "Revoke API key?",
            body: "The key is permanently disabled on the server and removed from this device. This cannot be undone.",
            confirmLabel: loading ? "Revoking..." : "Revoke key",
            onConfirm: handleRevoke,
          }
        : null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onShow={loadApiKey}
      onRequestClose={onClose}
    >
      <View style={shared.screen}>
        <View style={styles.header}>
          <Text style={typography.title}>Publisher Settings</Text>
          <Text style={typography.subtitle}>
            Configure your API key to access publisher features
          </Text>
        </View>

        <View style={styles.content}>
          {hasKey ? (
            <View style={styles.activeKeyGroup}>
              <Text style={styles.label}>Active API key</Text>
              <View style={[styles.activeKey, { borderColor: colors.border }]}>
                <Text style={styles.activeKeyValue} accessibilityLabel="Active API key">
                  {maskApiKey(apiKey)}
                </Text>
                <Text style={styles.hint}>Only the first and last four characters are shown.</Text>
              </View>
            </View>
          ) : (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>API Key (x-api-key)</Text>
              <TextInput
                value={apiKey}
                onChangeText={setApiKey}
                accessibilityLabel="API key"
                placeholder="Enter your API key"
                placeholderTextColor={colors.textSubtle}
                style={styles.input}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
              />
            </View>
          )}

          {error ? (
            <View style={[styles.errorBanner, { borderColor: colors.danger, backgroundColor: colors.dangerBg }]}>
              <Text accessibilityRole="alert" style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
            </View>
          ) : null}

          {notice ? (
            <View style={[styles.noticeBanner, { borderColor: colors.success, backgroundColor: colors.successBg }]}>
              <Text style={[styles.noticeText, { color: colors.success }]}>{notice}</Text>
            </View>
          ) : null}

          {confirmCopy ? (
            <View style={[styles.confirmCard, { borderColor: colors.danger, backgroundColor: colors.dangerBg }]}>
              <Text style={styles.confirmTitle}>{confirmCopy.title}</Text>
              <Text style={styles.confirmBody}>{confirmCopy.body}</Text>
              <Pressable
                onPress={confirmCopy.onConfirm}
                disabled={loading}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.button,
                  styles.logoutButton,
                  (pressed || loading) && styles.buttonPressed,
                ]}
              >
                <Text style={styles.logoutButtonText}>{confirmCopy.confirmLabel}</Text>
              </Pressable>
              <Pressable
                onPress={() => setConfirming(null)}
                disabled={loading}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.button,
                  styles.cancelButton,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
            </View>
          ) : hasKey ? (
            <>
              <Pressable
                onPress={() => {
                  setError(null);
                  setNotice(null);
                  setConfirming("rotate");
                }}
                disabled={loading}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.button,
                  styles.rotateButton,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Text style={styles.rotateButtonText}>Rotate API Key</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setError(null);
                  setNotice(null);
                  setConfirming("revoke");
                }}
                disabled={loading}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.button,
                  styles.logoutButton,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Text style={styles.logoutButtonText}>Revoke API Key</Text>
              </Pressable>
              {onViewProfile ? (
                <Pressable accessibilityRole="button"
                  onPress={onViewProfile}
                  disabled={loading}
                  style={({ pressed }) => [
                    styles.button,
                    styles.profileButton,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <Text style={styles.profileButtonText}>View Profile</Text>
                </Pressable>
              ) : null}
            </>
          ) : (
            <Pressable accessibilityRole="button"
              onPress={handleSave}
              disabled={loading}
              style={({ pressed }) => [
                styles.button,
                styles.saveButton,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.saveButtonText}>
                {loading ? "Saving..." : "Save API Key"}
              </Text>
            </Pressable>
          )}

          <Pressable accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => [
              styles.button,
              styles.cancelButton,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.cancelButtonText}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    header: {
      padding: spacing.lg,
      gap: spacing.sm,
    },
    content: {
      flex: 1,
      padding: spacing.lg,
      gap: spacing.lg,
    },
    inputGroup: {
      gap: spacing.sm,
    },
    activeKeyGroup: {
      gap: spacing.sm,
    },
    label: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.text,
    },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: colors.text,
    },
    activeKey: {
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      gap: spacing.xs,
      backgroundColor: colors.surface,
    },
    activeKeyValue: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.text,
      fontFamily: "monospace",
    },
    hint: {
      fontSize: 12,
      color: colors.textMuted,
    },
    errorBanner: {
      borderRadius: 12,
      borderWidth: 1,
      padding: spacing.md,
    },
    errorText: {
      fontSize: 14,
    },
    noticeBanner: {
      borderRadius: 12,
      borderWidth: 1,
      padding: spacing.md,
    },
    noticeText: {
      fontSize: 14,
    },
    confirmCard: {
      borderRadius: 12,
      borderWidth: 1,
      padding: spacing.md,
      gap: spacing.md,
    },
    confirmTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.text,
    },
    confirmBody: {
      fontSize: 14,
      color: colors.textMuted,
    },
    button: {
      borderRadius: 12,
      paddingVertical: 14,
      paddingHorizontal: 16,
      alignItems: "center",
    },
    buttonPressed: {
      opacity: 0.7,
    },
    saveButton: {
      backgroundColor: colors.primary,
    },
    saveButtonText: {
      color: colors.onPrimary,
      fontWeight: "600",
      fontSize: 16,
    },
    rotateButton: {
      backgroundColor: colors.neutralBg,
    },
    rotateButtonText: {
      color: colors.text,
      fontWeight: "600",
      fontSize: 16,
    },
    logoutButton: {
      backgroundColor: colors.danger,
    },
    logoutButtonText: {
      color: colors.onDanger,
      fontWeight: "600",
      fontSize: 16,
    },
    profileButton: {
      backgroundColor: colors.primary,
    },
    profileButtonText: {
      color: colors.onPrimary,
      fontWeight: "600",
      fontSize: 16,
    },
    cancelButton: {
      backgroundColor: colors.neutralBg,
    },
    cancelButtonText: {
      color: colors.text,
      fontWeight: "600",
      fontSize: 16,
    },
  });
}
