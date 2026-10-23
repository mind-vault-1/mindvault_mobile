import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  Share,
  ActivityIndicator,
} from "react-native";
import Constants from "expo-constants";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useState, useEffect, useCallback } from "react";
import { RootStackParamList } from "../navigation";
import { ThemeToggle } from "../components/ThemeToggle";
import { useAppTheme } from "../theme/ThemeProvider";
import {
  getDefaultApiBaseUrl,
  loadApiBaseUrl,
  saveApiBaseUrl,
  validateApiBaseUrl,
} from "../api/apiSettings";
import { DEFAULT_STELLAR_NETWORK, initializeApiBaseUrl } from "../api/resources";
import { checkHealth, type ServerHealth } from "../api/health";
import { collectDiagnostics, formatDiagnostics } from "../services/diagnostics";

export function SettingsScreen() {
  const { colors, shared } = useAppTheme();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [apiUrl, setApiUrl] = useState("");
  const [savedUrl, setSavedUrl] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const loadUrl = useCallback(async () => {
    const url = await loadApiBaseUrl();
    setApiUrl(url);
    setSavedUrl(url);
  }, []);

  useEffect(() => {
    loadUrl();
  }, [loadUrl]);

  const handleSave = async () => {
    const trimmed = apiUrl.trim();
    const validation = validateApiBaseUrl(trimmed);
    if (!validation.isValid) {
      Alert.alert(
        "Invalid URL",
        validation.errorMessage ?? "Invalid API base URL."
      );
      return;
    }

    setIsSaving(true);
    try {
      await saveApiBaseUrl(trimmed);
      await initializeApiBaseUrl();
      setSavedUrl(trimmed);
      Alert.alert("Saved", "API base URL updated successfully.");
    } catch {
      Alert.alert("Error", "Failed to save API base URL.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    const defaultUrl = getDefaultApiBaseUrl();
    setApiUrl(defaultUrl);
    setIsSaving(true);
    try {
      await saveApiBaseUrl(defaultUrl);
      await initializeApiBaseUrl();
      setSavedUrl(defaultUrl);
      Alert.alert("Reset", "API base URL reset to default.");
    } catch {
      Alert.alert("Error", "Failed to reset API base URL.");
    } finally {
      setIsSaving(false);
    }
  };

  const [health, setHealth] = useState<ServerHealth | null>(null);
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);

  const runHealthCheck = useCallback(async (baseUrl: string) => {
    setIsCheckingHealth(true);
    try {
      setHealth(await checkHealth(baseUrl));
    } finally {
      setIsCheckingHealth(false);
    }
  }, []);

  // Re-check whenever the saved API URL changes, so About always describes the server in use.
  useEffect(() => {
    if (savedUrl) void runHealthCheck(savedUrl);
  }, [savedUrl, runHealthCheck]);

  const appVersion = Constants.expoConfig?.version ?? "unknown";
  const serverStatus = isCheckingHealth
    ? "Checking…"
    : !health
      ? "Unknown"
      : health.status === "up"
        ? `Up (${health.latencyMs} ms)`
        : `Down — ${health.error}`;
  const serverStatusColor =
    health?.status === "up" ? colors.success : health?.status === "down" ? colors.danger : colors.textMuted;

  const isDirty = apiUrl.trim() !== savedUrl;
  const isDefault =
    apiUrl.trim() === getDefaultApiBaseUrl() && savedUrl === getDefaultApiBaseUrl();

  // The report is shown in full before anything leaves the device.
  const [diagnosticsPreview, setDiagnosticsPreview] = useState<string | null>(null);

  const handlePreviewDiagnostics = async () => {
    try {
      setDiagnosticsPreview(formatDiagnostics(await collectDiagnostics()));
    } catch {
      Alert.alert("Error", "Failed to collect diagnostics");
    }
  };

  const handleShareDiagnostics = async () => {
    if (!diagnosticsPreview) return;
    try {
      await Share.share({ message: diagnosticsPreview, title: "MindVault Diagnostics" });
      setDiagnosticsPreview(null);
    } catch {
      Alert.alert("Error", "Failed to share diagnostics");
    }
  };

  return (
    <SafeAreaView style={shared.screen}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>Settings</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            Customize your app experience
          </Text>
        </View>

        <ThemeToggle />

        <View style={[styles.infoCard, { backgroundColor: colors.neutralBg }]}>
          <Text style={[styles.infoText, { color: colors.textMuted }]}>
            Theme preferences are saved locally and persist across app launches.
          </Text>
        </View>

        {/* API Base URL */}
        <View
          style={[
            styles.infoCard,
            {
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
              marginTop: 32,
            },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            API Base URL
          </Text>
          <Text
            style={[
              styles.infoText,
              { color: colors.textMuted, marginBottom: 12 },
            ]}
          >
            The base URL used for all API requests. Changes apply
            immediately and are kept across app restarts.
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                color: colors.text,
                backgroundColor: colors.neutralBg,
                borderColor: isDirty ? colors.primary : colors.border,
              },
            ]}
            value={apiUrl}
            onChangeText={setApiUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            placeholder={getDefaultApiBaseUrl()}
            placeholderTextColor={colors.textSubtle}
            editable={!isSaving}
          />
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[
                shared.button,
                { flex: 1, backgroundColor: colors.neutralBg },
                isDefault && styles.disabledButton,
              ]}
              onPress={handleReset}
              disabled={isSaving || isDefault}
              accessibilityRole="button"
              accessibilityState={{ disabled: isSaving || isDefault }}
            >
              <Text style={[shared.buttonText, { color: colors.textMuted }]}>
                Reset to Default
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                shared.button,
                shared.primaryButton,
                { flex: 1 },
                !isDirty && styles.disabledButton,
              ]}
              onPress={handleSave}
              disabled={!isDirty || isSaving}
            >
              <Text style={[shared.buttonText, shared.primaryButtonText]}>
                {isSaving ? "Saving…" : "Save"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.infoCard, { backgroundColor: colors.neutralBg, marginTop: 32 }]}>
          <Text style={[styles.title, { fontSize: 16, color: colors.text, marginBottom: 8 }]}>
            Publisher Resources
          </Text>
          <Text style={[styles.infoText, { color: colors.textMuted, marginBottom: 16 }]}>
            Authenticate with a publisher API key to manage the resources you have published.
          </Text>
          <TouchableOpacity
            style={[shared.button, { backgroundColor: colors.primary }]}
            onPress={() => navigation.navigate("PublisherResources")}
            accessibilityRole="button"
            accessibilityLabel="Open publisher resources"
          >
            <Text style={[shared.buttonText, { color: "#ffffff" }]}>Open Publisher Resources</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.infoCard, { backgroundColor: colors.neutralBg, marginTop: 32 }]}>
          <Text style={[styles.title, { fontSize: 16, color: colors.text, marginBottom: 8 }]}>
            Purchase History
          </Text>
          <Text style={[styles.infoText, { color: colors.textMuted, marginBottom: 16 }]}>
            Review the receipts for resources you have unlocked, and export them for your records.
          </Text>
          <TouchableOpacity
            style={[shared.button, { backgroundColor: colors.primary }]}
            onPress={() => navigation.navigate("PurchaseHistory")}
            accessibilityRole="button"
            accessibilityLabel="Open purchase history"
          >
            <Text style={[shared.buttonText, { color: "#ffffff" }]}>View Purchase History</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.infoCard, { backgroundColor: colors.neutralBg, marginTop: 32 }]}>
          <Text style={[styles.title, { fontSize: 16, color: colors.text, marginBottom: 8 }]}>
            Support
          </Text>
          <Text style={[styles.infoText, { color: colors.textMuted, marginBottom: 16 }]}>
            Export diagnostic information to help us troubleshoot issues.
          </Text>
          <TouchableOpacity
            style={[shared.button, { backgroundColor: colors.primary }]}
            onPress={() => void handlePreviewDiagnostics()}
            accessibilityRole="button"
            accessibilityLabel="Share diagnostics"
            accessibilityHint="Shows the report so you can review it before sharing"
          >
            <Text style={[shared.buttonText, { color: "#ffffff" }]}>Share Diagnostics</Text>
          </TouchableOpacity>
        </View>

        <Modal
          visible={diagnosticsPreview !== null}
          animationType="slide"
          transparent
          onRequestClose={() => setDiagnosticsPreview(null)}
        >
          <View style={styles.previewOverlay}>
            <View style={[styles.previewSheet, { backgroundColor: colors.surface }]}>
              <Text style={[styles.title, { fontSize: 16, color: colors.text }]}>
                Review before sharing
              </Text>
              <ScrollView style={styles.previewBody}>
                <Text
                  selectable
                  style={[styles.previewText, { color: colors.text }]}
                  accessibilityLabel="Diagnostics report"
                >
                  {diagnosticsPreview}
                </Text>
              </ScrollView>
              <View style={styles.previewActions}>
                <TouchableOpacity
                  style={[shared.button, styles.previewButton, { backgroundColor: colors.neutralBg }]}
                  onPress={() => setDiagnosticsPreview(null)}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel"
                >
                  <Text style={[shared.buttonText, { color: colors.text }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[shared.button, styles.previewButton, { backgroundColor: colors.primary }]}
                  onPress={() => void handleShareDiagnostics()}
                  accessibilityRole="button"
                  accessibilityLabel="Share"
                >
                  <Text style={[shared.buttonText, { color: "#ffffff" }]}>Share</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <View
          style={[styles.infoCard, { backgroundColor: colors.neutralBg, marginTop: 32 }]}
          accessibilityLabel="About"
        >
          <Text style={[styles.title, { fontSize: 16, color: colors.text, marginBottom: 8 }]}>
            About
          </Text>
          {[
            { label: "App version", value: appVersion, color: colors.text },
            { label: "Network", value: DEFAULT_STELLAR_NETWORK, color: colors.text },
            { label: "API URL", value: savedUrl, color: colors.text },
            { label: "Server status", value: serverStatus, color: serverStatusColor },
          ].map((row) => (
            <View
              key={row.label}
              style={styles.aboutRow}
              accessible
              accessibilityLabel={`${row.label}: ${row.value}`}
            >
              <Text style={[styles.infoText, { color: colors.textMuted }]}>{row.label}</Text>
              <Text
                style={[styles.infoText, styles.aboutValue, { color: row.color }]}
                selectable
              >
                {row.value}
              </Text>
            </View>
          ))}
          <TouchableOpacity
            style={[
              shared.button,
              { backgroundColor: colors.primary, marginTop: 12 },
              isCheckingHealth && styles.disabledButton,
            ]}
            onPress={() => void runHealthCheck(savedUrl)}
            disabled={isCheckingHealth || !savedUrl}
            accessibilityRole="button"
            accessibilityLabel="Check server status again"
            accessibilityState={{ disabled: isCheckingHealth || !savedUrl, busy: isCheckingHealth }}
          >
            {isCheckingHealth ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={[shared.buttonText, { color: "#ffffff" }]}>Check again</Text>
            )}
          </TouchableOpacity>
        </View>

        {__DEV__ ? (
          <View style={[styles.infoCard, { backgroundColor: colors.warningBg, marginTop: 16 }]}>
            <Text style={[styles.title, { fontSize: 16, color: colors.warning, marginBottom: 8 }]}>
              Developer Options
            </Text>
            <Text style={[styles.infoText, { color: colors.warning, marginBottom: 16 }]}>
              These tools are for testing purposes only.
            </Text>
            <TouchableOpacity
              style={[shared.button, { backgroundColor: colors.warning }]}
              onPress={() => navigation.navigate("DevSigner")}
              accessibilityRole="button"
              accessibilityLabel="Open Dev Signer PoC"
            >
              <Text style={[shared.buttonText, { color: "#ffffff" }]}>Open Dev Signer PoC</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 32,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 24,
    gap: 4,
  },
  title: {
    fontSize: 32,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: 15,
  },
  infoCard: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    padding: 16,
  },
  infoText: {
    fontSize: 13,
    lineHeight: 20,
  },
  previewOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  previewSheet: {
    maxHeight: "80%",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
    gap: 12,
  },
  previewBody: {
    flexGrow: 0,
  },
  previewText: {
    fontFamily: "monospace",
    fontSize: 12,
    lineHeight: 18,
  },
  previewActions: {
    flexDirection: "row",
    gap: 8,
  },
  previewButton: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  input: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    fontFamily: "monospace",
    marginBottom: 12,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 8,
  },
  disabledButton: {
    opacity: 0.5,
  },
  aboutRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 4,
  },
  aboutValue: {
    flexShrink: 1,
    textAlign: "right",
    fontWeight: "600",
  },
});
