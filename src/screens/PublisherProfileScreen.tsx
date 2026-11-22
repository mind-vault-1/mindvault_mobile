import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { fetchMe, type PublisherProfile } from "../api/publishers";
import { clearApiKey, storeApiKey } from "../services/secureStorage";
import { spacing, type ThemeColors } from "../theme";
import { useAppTheme } from "../theme/ThemeProvider";
import type { RootStackParamList } from "../navigation";

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

export function PublisherProfileScreen() {
  const { colors, shared, typography } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [profile, setProfile] = useState<PublisherProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newKey, setNewKey] = useState("");
  const [savingKey, setSavingKey] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [keyMessage, setKeyMessage] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setProfile(await fetchMe());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load publisher profile");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  // The new key is checked against the server first, so a typo never
  // replaces a working key.
  async function handleReplaceKey() {
    const candidate = newKey.trim();
    if (!candidate) return;
    setSavingKey(true);
    setKeyError(null);
    setKeyMessage(null);
    try {
      const owner = await fetchMe(candidate);
      await storeApiKey(candidate);
      setProfile(owner);
      setError(null);
      setNewKey("");
      setKeyMessage("API key replaced.");
    } catch (err) {
      setKeyError(err instanceof Error ? err.message : "Couldn't validate that key.");
    } finally {
      setSavingKey(false);
    }
  }

  async function handleLogout() {
    try {
      await clearApiKey();
      navigation.goBack();
    } catch {
      setKeyError("Couldn't remove the stored API key.");
    }
  }

  return (
    <SafeAreaView style={shared.screen} edges={["left", "right"]}>
      <ScrollView contentContainerStyle={styles.container}>
        {loading ? (
          <View style={styles.centerContent}>
            <ActivityIndicator
              size="large"
              color={colors.primary}
              accessibilityLabel="Loading publisher profile"
            />
          </View>
        ) : error ? (
          <View style={styles.centerContent}>
            <Text style={styles.errorText} accessibilityRole="alert">
              {error}
            </Text>
            <Pressable
              onPress={() => void loadProfile()}
              style={styles.primaryButton}
              accessibilityRole="button"
              accessibilityLabel="Retry loading profile"
            >
              <Text style={styles.primaryButtonText}>Retry</Text>
            </Pressable>
          </View>
        ) : profile ? (
          <View style={styles.card}>
            {[
              ["Publisher name", profile.name],
              ["Wallet", profile.walletAddress],
              ["Email", profile.email],
              ["Created", formatDate(profile.createdAt)],
            ].map(([label, value], index) => (
              <View key={label} style={[styles.field, index > 0 && styles.fieldDivider]}>
                <Text style={styles.fieldLabel}>{label}</Text>
                <Text
                  style={[styles.fieldValue, label === "Wallet" && styles.mono]}
                  selectable
                >
                  {value}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {profile && !loading && !error ? (
          <Pressable
            onPress={() => navigation.navigate("PublisherAnalytics")}
            accessibilityRole="button"
            accessibilityLabel="View publisher analytics"
            style={[shared.button, shared.primaryButton]}
          >
            <Text style={[shared.buttonText, shared.primaryButtonText]}>View analytics</Text>
          </Pressable>
        ) : null}

        <View style={styles.card}>
          <View style={styles.field}>
            <Text style={typography.cardTitle}>API key</Text>
            <TextInput
              value={newKey}
              onChangeText={(text) => {
                setNewKey(text);
                setKeyError(null);
                setKeyMessage(null);
              }}
              placeholder="Paste a new API key"
              placeholderTextColor={colors.textSubtle}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              editable={!savingKey}
              accessibilityLabel="New API key"
              style={styles.input}
            />
            {keyError ? (
              <Text style={styles.errorText} accessibilityRole="alert">
                {keyError}
              </Text>
            ) : null}
            {keyMessage ? <Text style={styles.successText}>{keyMessage}</Text> : null}
            <Pressable
              onPress={() => void handleReplaceKey()}
              disabled={savingKey || !newKey.trim()}
              style={[styles.primaryButton, (savingKey || !newKey.trim()) && styles.disabled]}
              accessibilityRole="button"
              accessibilityLabel="Replace API key"
              accessibilityState={{ disabled: savingKey || !newKey.trim() }}
            >
              {savingKey ? (
                <ActivityIndicator color={colors.onPrimary} />
              ) : (
                <Text style={styles.primaryButtonText}>Replace key</Text>
              )}
            </Pressable>
            <Pressable
              onPress={() => void handleLogout()}
              style={styles.dangerButton}
              accessibilityRole="button"
              accessibilityLabel="Log out"
              accessibilityHint="Removes the stored API key from this device"
            >
              <Text style={styles.dangerButtonText}>Log out</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flexGrow: 1, padding: spacing.lg, gap: spacing.lg },
    centerContent: {
      justifyContent: "center",
      alignItems: "center",
      paddingVertical: spacing.xl,
      gap: spacing.md,
    },
    card: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      overflow: "hidden",
    },
    field: { padding: spacing.md, gap: spacing.xs },
    fieldDivider: { borderTopWidth: 1, borderTopColor: colors.border },
    fieldLabel: { fontSize: 13, fontWeight: "500", color: colors.textMuted },
    fieldValue: { fontSize: 15, fontWeight: "500", color: colors.text },
    mono: { fontFamily: "monospace", fontSize: 13 },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: colors.text,
    },
    errorText: { fontSize: 14, color: colors.danger },
    successText: { fontSize: 14, color: colors.success },
    primaryButton: {
      backgroundColor: colors.primary,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: 8,
      alignItems: "center",
    },
    primaryButtonText: { color: colors.onPrimary, fontWeight: "600", fontSize: 14 },
    dangerButton: {
      backgroundColor: colors.dangerBg,
      paddingVertical: spacing.sm,
      borderRadius: 8,
      alignItems: "center",
    },
    dangerButtonText: { color: colors.danger, fontWeight: "600", fontSize: 14 },
    disabled: { opacity: 0.5 },
  });
}
