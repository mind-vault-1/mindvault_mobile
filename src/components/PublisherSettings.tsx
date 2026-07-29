import { useState, useMemo } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { clearApiKey, getApiKey, storeApiKey } from "../services/secureStorage";
import { spacing, type ThemeColors } from "../theme";
import { useAppTheme } from "../theme/ThemeProvider";

interface PublisherSettingsProps {
  visible: boolean;
  onClose: () => void;
  onApiKeySet: () => void;
}

export function PublisherSettings({
  visible,
  onClose,
  onApiKeySet,
}: PublisherSettingsProps) {
  const { colors, shared, typography } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [apiKey, setApiKey] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadApiKey = async () => {
    try {
      const key = await getApiKey();
      setHasKey(!!key);
      if (key) setApiKey(key);
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

  const handleLogout = async () => {
    setLoading(true);
    try {
      await clearApiKey();
      setApiKey("");
      setHasKey(false);
      onApiKeySet();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear API key");
    } finally {
      setLoading(false);
    }
  };

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
          <View style={styles.inputGroup}>
            <Text style={styles.label}>API Key (x-api-key)</Text>
            <TextInput
              value={apiKey}
              onChangeText={setApiKey}
              placeholder="Enter your API key"
              placeholderTextColor={colors.textSubtle}
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              onFocus={loadApiKey}
            />
          </View>

          {error ? (
            <View style={[styles.errorBanner, { borderColor: colors.danger, backgroundColor: colors.dangerBg }]}>
              <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
            </View>
          ) : null}

          {hasKey ? (
            <Pressable
              onPress={handleLogout}
              disabled={loading}
              style={({ pressed }) => [
                styles.button,
                styles.logoutButton,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.logoutButtonText}>
                {loading ? "Clearing..." : "Clear API Key"}
              </Text>
            </Pressable>
          ) : (
            <Pressable
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

          <Pressable
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
    errorBanner: {
      borderRadius: 12,
      borderWidth: 1,
      padding: spacing.md,
    },
    errorText: {
      fontSize: 14,
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
    logoutButton: {
      backgroundColor: colors.danger,
    },
    logoutButtonText: {
      color: colors.onDanger,
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
