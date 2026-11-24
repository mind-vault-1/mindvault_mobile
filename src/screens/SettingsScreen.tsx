import AsyncStorage from "@react-native-async-storage/async-storage";
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
  Switch,
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
import { initializeApiBaseUrl } from "../api/resources";
import {
  getNetwork,
  getNetworkConfig,
  NETWORK_IDS,
  setNetwork,
  subscribeNetwork,
  type StellarNetworkId,
} from "../config/network";
import { checkHealth, type ServerHealth } from "../api/health";
import { collectDiagnostics, formatDiagnostics } from "../services/diagnostics";
import {
  clearStorageGroup,
  formatBytes,
  getStorageGroupSizes,
  STORAGE_GROUPS,
  STORAGE_KEYS,
  type StorageGroup,
  type StorageGroupId,
} from "../services/storage";
import { getAuditLog } from "../services/auditLog";
import {
  areHapticsEnabled,
  hapticImpact,
  setHapticsEnabled,
} from "../utils/haptics";
import {
  APP_LOCK_TIMEOUT_OPTIONS,
  useAppLock,
} from "../hooks/useAppLock";
import { openExternalUrl } from "../utils/stellarExpert";
import {
  DEFAULT_PER_PAYMENT_LIMIT,
  loadPreferences,
  savePerPaymentLimit,
} from "../services/preferences";
import {
  formatNumber,
  LANGUAGE_NAMES,
  setLanguagePreference,
  SUPPORTED_LANGUAGES,
  t,
  useLanguagePreference,
  useLocale,
  type LanguagePreference,
} from "../i18n";

const LANGUAGE_OPTIONS: readonly LanguagePreference[] = ["system", ...SUPPORTED_LANGUAGES];

/** docs/PRIVACY.md on the default branch: what is stored, what leaves the device, how to delete it. */
const PRIVACY_POLICY_URL =
  "https://github.com/mind-vault-1/mindvault_mobile/blob/main/docs/PRIVACY.md";

export function SettingsScreen() {
  const { colors, shared } = useAppTheme();
  // Re-render in the new language as soon as it is picked.
  useLocale();
  const languagePreference = useLanguagePreference();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [apiUrl, setApiUrl] = useState("");
  const [savedUrl, setSavedUrl] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [hapticsEnabled, setHapticsEnabledState] = useState(true);
  const [perPaymentLimit, setPerPaymentLimit] = useState(DEFAULT_PER_PAYMENT_LIMIT);
  const [perPaymentLimitDraft, setPerPaymentLimitDraft] = useState(DEFAULT_PER_PAYMENT_LIMIT);
  const [savingLimit, setSavingLimit] = useState(false);
  const [network, setNetworkState] = useState<StellarNetworkId>(getNetwork());
  const {
    enabled: appLockEnabled,
    timeoutMinutes: appLockTimeout,
    error: appLockError,
    setEnabled: setAppLockEnabled,
    setTimeoutMinutes: setAppLockTimeout,
  } = useAppLock();

  const [auditLogPreview, setAuditLogPreview] = useState<string | null>(null);

  useEffect(() => {
    void areHapticsEnabled().then(setHapticsEnabledState);
  }, []);

  useEffect(() => {
    void loadPreferences().then(({ perPaymentLimit: limit }) => {
      setPerPaymentLimit(limit);
      setPerPaymentLimitDraft(limit);
    });
  }, []);

  useEffect(() => subscribeNetwork(setNetworkState), []);

  const handleLanguageChange = useCallback(async (next: LanguagePreference) => {
    try {
      await setLanguagePreference(next);
    } catch {
      // The language still changed for this session; only saving it failed.
      Alert.alert(t("settings.error"), t("settings.languageSaveFailed"));
    }
  }, []);

  const handleNetworkChange = useCallback(
    (next: StellarNetworkId) => {
      if (next === network) return;
      const apply = () => {
        setNetwork(next);
        setNetworkState(next);
        Alert.alert(t("settings.networkChanged"), t("settings.nowUsingNetwork", { label: getNetworkConfig(next).label }));
      };
      if (next === "mainnet") {
        Alert.prompt(
          t("settings.switchToMainnetTitle"),
          t("settings.switchToMainnetPrompt"),
          (value) => {
            if (value?.trim() === "MAINNET") apply();
          },
          "plain-text"
        );
        return;
      }
      apply();
    },
    [network]
  );

  const handleHapticsChange = useCallback(async (enabled: boolean) => {
    setHapticsEnabledState(enabled);
    await setHapticsEnabled(enabled);
    if (enabled) void hapticImpact();
  }, []);

  const handleSavePaymentLimit = useCallback(async () => {
    setSavingLimit(true);
    try {
      const saved = await savePerPaymentLimit(perPaymentLimitDraft);
      setPerPaymentLimit(saved.perPaymentLimit);
      setPerPaymentLimitDraft(saved.perPaymentLimit);
      Alert.alert(
        t("settings.spendingLimitSaved"),
        t("settings.spendingLimitSavedMessage", { limit: saved.perPaymentLimit })
      );
    } catch (error) {
      Alert.alert(
        t("settings.invalidLimit"),
        error instanceof Error ? error.message : t("settings.enterValidLimit")
      );
    } finally {
      setSavingLimit(false);
    }
  }, [perPaymentLimitDraft]);

  const handleAppLockChange = useCallback(async (enabled: boolean) => {
    const saved = await setAppLockEnabled(enabled);
    if (!saved) {
      Alert.alert(
        t("settings.appLockUnavailable"),
        t("settings.appLockUnavailableBody")
      );
    }
  }, [setAppLockEnabled]);

  const handleReopenOnboarding = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(STORAGE_KEYS.onboarding);
      navigation.navigate("Onboarding");
    } catch {
      Alert.alert(t("settings.error"), t("settings.reopenOnboardingFailed"));
    }
  }, [navigation]);

  const handleViewAuditLog = useCallback(async () => {
    try {
      const log = await getAuditLog();
      if (log.length === 0) {
        Alert.alert(t("settings.auditLog"), t("settings.noAuditActions"));
        return;
      }
      const preview = log.map((entry) => {
        const lines = [
          `${entry.action.replace(/_/g, " ")} - ${entry.timestamp}`,
          `Outcome: ${entry.outcome}`,
        ];
        if (entry.metadata?.walletAddress) {
          lines.push(`Wallet: ${entry.metadata.walletAddress}`);
        }
        if (entry.metadata?.errorMessage) {
          lines.push(`Error: ${entry.metadata.errorMessage}`);
        }
        return lines.join("\n");
      }).join("\n\n");
      setAuditLogPreview(preview);
    } catch {
      Alert.alert(t("settings.error"), t("settings.loadAuditLogFailed"));
    }
  }, []);

  const handleExportAuditLog = useCallback(async () => {
    if (!auditLogPreview) return;
    try {
      await Share.share({
        message: auditLogPreview,
        title: t("settings.auditLogShareTitle"),
      });
      setAuditLogPreview(null);
    } catch {
      Alert.alert(t("settings.error"), t("settings.shareAuditLogFailed"));
    }
  }, [auditLogPreview]);

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
        t("settings.invalidUrl"),
        validation.errorMessage ?? t("settings.invalidUrl")
      );
      return;
    }

    setIsSaving(true);
    try {
      await saveApiBaseUrl(trimmed);
      await initializeApiBaseUrl();
      setSavedUrl(trimmed);
      Alert.alert(t("settings.saved"), t("settings.urlUpdated"));
    } catch {
      Alert.alert(t("settings.error"), t("settings.saveUrlFailed"));
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
      Alert.alert(t("settings.reset"), t("settings.urlReset"));
    } catch {
      Alert.alert(t("settings.error"), t("settings.resetUrlFailed"));
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
    ? t("settings.checkingStatus")
    : !health
      ? t("settings.unknownStatus")
      : health.status === "up"
        ? t("settings.serverUp", { latencyMs: formatNumber(health.latencyMs) })
        : t("settings.serverDown", { error: health.error });
  const serverStatusColor =
    health?.status === "up" ? colors.success : health?.status === "down" ? colors.danger : colors.textMuted;

  const isDirty = apiUrl.trim() !== savedUrl;
  const isDefault =
    apiUrl.trim() === getDefaultApiBaseUrl() && savedUrl === getDefaultApiBaseUrl();

  const [dataSizes, setDataSizes] = useState<Partial<Record<StorageGroupId, number | null>>>({});
  const [clearingGroup, setClearingGroup] = useState<StorageGroupId | null>(null);

  const refreshDataSizes = useCallback(async () => {
    try {
      setDataSizes(await getStorageGroupSizes());
    } catch {
      setDataSizes({});
    }
  }, []);

  useEffect(() => {
    void refreshDataSizes();
  }, [refreshDataSizes]);

  const sizeLabel = (id: StorageGroupId) => {
    const size = dataSizes[id];
    return typeof size === "number" ? formatBytes(size) : t("settings.sizeUnknown");
  };

  const clearGroup = async (group: StorageGroup) => {
    setClearingGroup(group.id);
    try {
      await clearStorageGroup(group.id);
      Alert.alert(t("settings.cleared"), t("settings.clearedMessage", { label: group.label }));
    } catch {
      Alert.alert(t("settings.error"), t("settings.clearFailedMessage", { label: group.label.toLowerCase() }));
    } finally {
      setClearingGroup(null);
      void refreshDataSizes();
    }
  };

  const confirmClearGroup = (group: StorageGroup) => {
    Alert.alert(
      t("settings.confirmClearTitle", { label: group.label.toLowerCase() }),
      t("settings.confirmClearMessage", { description: group.description, size: sizeLabel(group.id) }),
      [
        { text: t("settings.cancel"), style: "cancel" },
        { text: t("settings.clear"), style: "destructive", onPress: () => void clearGroup(group) },
      ]
    );
  };

  // The report is shown in full before anything leaves the device.
  const [diagnosticsPreview, setDiagnosticsPreview] = useState<string | null>(null);

  const handlePreviewDiagnostics = async () => {
    try {
      setDiagnosticsPreview(formatDiagnostics(await collectDiagnostics()));
    } catch {
      Alert.alert(t("settings.error"), t("settings.collectDiagnosticsFailed"));
    }
  };

  const handleShareDiagnostics = async () => {
    if (!diagnosticsPreview) return;
    try {
      await Share.share({ message: diagnosticsPreview, title: t("settings.diagnosticsShareTitle") });
      setDiagnosticsPreview(null);
    } catch {
      Alert.alert(t("settings.error"), t("settings.shareDiagnosticsFailed"));
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
          <Text style={[styles.title, { color: colors.text }]}>{t("settings.title")}</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            {t("settings.subtitle")}
          </Text>
        </View>

        <ThemeToggle />

        <View
          style={[
            styles.infoCard,
            {
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
            },
          ]}
          accessibilityRole="radiogroup"
          accessibilityLabel={t("settings.language")}
        >
          <Text style={[styles.sectionTitle, { color: colors.text }]} accessibilityRole="header">
            {t("settings.language")}
          </Text>
          <Text style={[styles.infoText, { color: colors.textMuted, marginBottom: 12 }]}>
            {t("settings.languageBody")}
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {LANGUAGE_OPTIONS.map((option) => {
              const selected = option === languagePreference;
              const name = option === "system" ? t("settings.languageSystem") : LANGUAGE_NAMES[option];
              return (
                <TouchableOpacity
                  key={option}
                  onPress={() => void handleLanguageChange(option)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={t("settings.selectLanguage", { language: name })}
                  style={{
                    borderRadius: 999,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    backgroundColor: selected ? colors.primaryMuted : colors.neutralBg,
                  }}
                >
                  <Text style={{ color: selected ? colors.primary : colors.text }}>{name}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View
          style={[
            styles.infoCard,
            {
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
            },
          ]}
        >
          <View style={styles.hapticsRow}>
            <View style={styles.hapticsCopy}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                {t("settings.haptics")}
              </Text>
              <Text style={[styles.infoText, { color: colors.textMuted }]}>
                {t("settings.hapticsBody")}
              </Text>
            </View>
            <Switch
              value={hapticsEnabled}
              onValueChange={(value) => void handleHapticsChange(value)}
              accessibilityLabel={t("settings.haptics")}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={colors.surface}
            />
          </View>
        </View>

        <View
          style={[
            styles.infoCard,
            {
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
            },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            {t("settings.spendingGuard")}
          </Text>
          <Text
            style={[
              styles.infoText,
              { color: colors.textMuted, marginBottom: 12 },
            ]}
          >
            {t("settings.spendingGuardBody")}
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                color: colors.text,
                backgroundColor: colors.neutralBg,
                borderColor: colors.border,
              },
            ]}
            value={perPaymentLimitDraft}
            onChangeText={setPerPaymentLimitDraft}
            keyboardType="decimal-pad"
            autoCapitalize="none"
            accessibilityLabel={t("settings.spendingLimitLabel")}
            placeholder={DEFAULT_PER_PAYMENT_LIMIT}
            placeholderTextColor={colors.textSubtle}
            editable={!savingLimit}
          />
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[
                shared.button,
                shared.primaryButton,
                (perPaymentLimitDraft.trim() === perPaymentLimit || savingLimit) && styles.disabledButton,
              ]}
              onPress={() => void handleSavePaymentLimit()}
              disabled={perPaymentLimitDraft.trim() === perPaymentLimit || savingLimit}
              accessibilityRole="button"
              accessibilityState={{ disabled: perPaymentLimitDraft.trim() === perPaymentLimit || savingLimit }}
              accessibilityLabel={t("settings.saveSpendingLimit")}
            >
              <Text style={[shared.buttonText, shared.primaryButtonText]}>
                {savingLimit ? t("settings.saving") : t("settings.saveLimit")}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View
          style={[
            styles.infoCard,
            {
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
            },
          ]}
        >
          <View style={styles.hapticsRow}>
            <View style={styles.hapticsCopy}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                {t("settings.lockAfterInactivity")}
              </Text>
              <Text style={[styles.infoText, { color: colors.textMuted }]}>
                {t("settings.lockBody")}
              </Text>
            </View>
            <Switch
              value={appLockEnabled}
              onValueChange={(value) => void handleAppLockChange(value)}
              accessibilityLabel={t("settings.lockAfterInactivity")}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={colors.surface}
            />
          </View>
          {appLockEnabled ? (
            <View style={{ marginTop: 16, gap: 8 }}>
              <Text style={[styles.infoText, { color: colors.textMuted }]}>
                {t("settings.lockAfter")}
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {APP_LOCK_TIMEOUT_OPTIONS.map((minutes) => {
                  const selected = minutes === appLockTimeout;
                  return (
                    <TouchableOpacity
                      key={minutes}
                      onPress={() => void setAppLockTimeout(minutes)}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected }}
                      accessibilityLabel={t("settings.minutesLabel", { minutes: formatNumber(minutes), suffix: minutes === 1 ? "" : "s" })}
                      style={{
                        borderRadius: 999,
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        backgroundColor: selected ? colors.primaryMuted : colors.neutralBg,
                      }}
                    >
                      <Text style={{ color: selected ? colors.primary : colors.text }}>
                        {t("settings.minutesShort", { minutes: formatNumber(minutes) })}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ) : null}
          {appLockError ? (
            <Text
              style={[styles.infoText, { color: colors.danger, marginTop: 8 }]}
              accessibilityRole="alert"
            >
              {appLockError}
            </Text>
          ) : null}
        </View>

        <View style={[styles.infoCard, { backgroundColor: colors.neutralBg }]}>
          <Text style={[styles.infoText, { color: colors.textMuted }]}>
            {t("settings.themeNote")}
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
            {t("settings.apiUrl")}
          </Text>
          <Text
            style={[
              styles.infoText,
              { color: colors.textMuted, marginBottom: 12 },
            ]}
          >
            {t("settings.apiUrlBody")}
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
            accessibilityLabel={t("settings.apiUrl")}
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
                {t("settings.resetToDefault")}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button"
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
                {isSaving ? t("settings.saving") : t("settings.save")}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.infoCard, { backgroundColor: colors.neutralBg, marginTop: 32 }]}>
          <Text style={[styles.title, { fontSize: 16, color: colors.text, marginBottom: 8 }]}>
            {t("settings.publisherResources")}
          </Text>
          <Text style={[styles.infoText, { color: colors.textMuted, marginBottom: 16 }]}>
            {t("settings.publisherResourcesBody")}
          </Text>
          <TouchableOpacity
            style={[shared.button, { backgroundColor: colors.primary }]}
            onPress={() => navigation.navigate("PublisherResources")}
            accessibilityRole="button"
            accessibilityLabel={t("settings.openPublisherResources")}
          >
            <Text style={[shared.buttonText, { color: "#ffffff" }]}>
              {t("settings.openPublisherResourcesButton")}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.infoCard, { backgroundColor: colors.neutralBg, marginTop: 32 }]}>
          <Text style={[styles.title, { fontSize: 16, color: colors.text, marginBottom: 8 }]}>
            {t("settings.purchaseHistory")}
          </Text>
          <Text style={[styles.infoText, { color: colors.textMuted, marginBottom: 16 }]}>
            {t("settings.purchaseHistoryBody")}
          </Text>
          <TouchableOpacity
            style={[shared.button, { backgroundColor: colors.primary }]}
            onPress={() => navigation.navigate("PurchaseHistory")}
            accessibilityRole="button"
            accessibilityLabel={t("settings.openPurchaseHistory")}
          >
            <Text style={[shared.buttonText, { color: "#ffffff" }]}>
              {t("settings.viewPurchaseHistory")}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.infoCard, { backgroundColor: colors.neutralBg, marginTop: 32 }]}>
          <Text
            style={[styles.title, { fontSize: 16, color: colors.text, marginBottom: 8 }]}
            accessibilityRole="header"
          >
            {t("settings.wallet")}
          </Text>
          <Text style={[styles.infoText, { color: colors.textMuted, marginBottom: 16 }]}>
            {t("settings.walletBody")}
          </Text>
          <TouchableOpacity
            style={[shared.button, { backgroundColor: colors.primary }]}
            onPress={() => navigation.navigate("Wallet")}
            accessibilityRole="button"
            accessibilityLabel={t("settings.openWallet")}
          >
            <Text style={[shared.buttonText, { color: "#ffffff" }]}>
              {t("settings.manageWallet")}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.infoCard, { backgroundColor: colors.neutralBg, marginTop: 32 }]}>
          <Text
            style={[styles.title, { fontSize: 16, color: colors.text, marginBottom: 8 }]}
            accessibilityRole="header"
          >
            {t("settings.publisherLeaderboard")}
          </Text>
          <Text style={[styles.infoText, { color: colors.textMuted, marginBottom: 16 }]}>
            {t("settings.publisherLeaderboardBody")}
          </Text>
          <TouchableOpacity
            style={[shared.button, { backgroundColor: colors.primary }]}
            onPress={() => navigation.navigate("Leaderboard")}
            accessibilityRole="button"
            accessibilityLabel={t("settings.openLeaderboard")}
          >
            <Text style={[shared.buttonText, { color: "#ffffff" }]}>
              {t("settings.viewLeaderboard")}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.infoCard, { backgroundColor: colors.neutralBg, marginTop: 32 }]}>
          <Text
            style={[styles.title, { fontSize: 16, color: colors.text, marginBottom: 8 }]}
            accessibilityRole="header"
          >
            {t("settings.localData")}
          </Text>
          <Text style={[styles.infoText, { color: colors.textMuted, marginBottom: 12 }]}>
            {t("settings.localDataBody")}
          </Text>
          <TouchableOpacity
            style={{ minHeight: 44, justifyContent: "center", marginBottom: 12 }}
            onPress={() =>
              openExternalUrl(PRIVACY_POLICY_URL).catch(() =>
                Alert.alert(t("settings.error"), t("settings.openPrivacyPolicyFailed"))
              )
            }
            accessibilityRole="link"
            accessibilityLabel={t("settings.privacyPolicy")}
            accessibilityHint={t("settings.privacyPolicyHint")}
          >
            <Text style={[styles.infoText, { color: colors.primary, fontWeight: "600" }]}>
              {t("settings.privacyPolicyLink")}
            </Text>
          </TouchableOpacity>
          {STORAGE_GROUPS.map((group) => {
            const busy = clearingGroup === group.id;
            return (
              <View key={group.id} style={styles.dataRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.infoText, { color: colors.text, fontWeight: "600" }]}>
                    {group.label}
                  </Text>
                  <Text style={[styles.infoText, { color: colors.textMuted }]}>
                    {sizeLabel(group.id)}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[shared.button, { backgroundColor: colors.dangerBg }, busy && styles.disabledButton]}
                  onPress={() => confirmClearGroup(group)}
                  disabled={clearingGroup !== null}
                  accessibilityRole="button"
                  accessibilityLabel={t("settings.clearGroupLabel", { label: group.label.toLowerCase(), size: sizeLabel(group.id) })}
                  accessibilityHint={t("settings.clearGroupHint")}
                  accessibilityState={{ disabled: clearingGroup !== null, busy }}
                >
                  {busy ? (
                    <ActivityIndicator color={colors.danger} />
                  ) : (
                    <Text style={[shared.buttonText, { color: colors.danger }]}>{t("settings.clear")}</Text>
                  )}
                </TouchableOpacity>
              </View>
            );
          })}
        </View>

        <View style={[styles.infoCard, { backgroundColor: colors.neutralBg, marginTop: 32 }]}>
          <Text
            style={[styles.title, { fontSize: 16, color: colors.text, marginBottom: 8 }]}
            accessibilityRole="header"
          >
            {t("settings.auditLog")}
          </Text>
          <Text style={[styles.infoText, { color: colors.textMuted, marginBottom: 12 }]}>
            {t("settings.auditLogBody")}
          </Text>
          <TouchableOpacity
            style={[shared.button, { backgroundColor: colors.primary }]}
            onPress={handleViewAuditLog}
            accessibilityRole="button"
            accessibilityLabel={t("settings.viewAuditLog")}
            accessibilityHint={t("settings.viewAuditLogHint")}
          >
            <Text style={[shared.buttonText, { color: "#ffffff" }]}>{t("settings.viewAuditLogButton")}</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.infoCard, { backgroundColor: colors.neutralBg, marginTop: 32 }]}>
          <Text style={[styles.title, { fontSize: 16, color: colors.text, marginBottom: 8 }]}>
            {t("settings.learn")}
          </Text>
          <Text style={[styles.infoText, { color: colors.textMuted, marginBottom: 16 }]}>
            {t("settings.learnBody")}
          </Text>
          <TouchableOpacity
            style={[shared.button, { backgroundColor: colors.primary }]}
            onPress={handleReopenOnboarding}
            accessibilityRole="button"
            accessibilityLabel={t("settings.reopenOnboarding")}
          >
            <Text style={[shared.buttonText, { color: "#ffffff" }]}>{t("settings.viewOnboarding")}</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.infoCard, { backgroundColor: colors.neutralBg, marginTop: 32 }]}>
          <Text style={[styles.title, { fontSize: 16, color: colors.text, marginBottom: 8 }]}>
            {t("settings.support")}
          </Text>
          <Text style={[styles.infoText, { color: colors.textMuted, marginBottom: 16 }]}>
            {t("settings.supportBody")}
          </Text>
          <TouchableOpacity
            style={[shared.button, { backgroundColor: colors.primary }]}
            onPress={() => void handlePreviewDiagnostics()}
            accessibilityRole="button"
            accessibilityLabel={t("settings.shareDiagnostics")}
            accessibilityHint={t("settings.shareDiagnosticsHint")}
          >
            <Text style={[shared.buttonText, { color: "#ffffff" }]}>{t("settings.shareDiagnosticsButton")}</Text>
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
                {t("settings.reviewBeforeSharing")}
              </Text>
              <ScrollView style={styles.previewBody}>
                <Text
                  selectable
                  style={[styles.previewText, { color: colors.text }]}
                  accessibilityLabel={t("settings.diagnosticsReportLabel")}
                >
                  {diagnosticsPreview}
                </Text>
              </ScrollView>
              <View style={styles.previewActions}>
                <TouchableOpacity
                  style={[shared.button, styles.previewButton, { backgroundColor: colors.neutralBg }]}
                  onPress={() => setDiagnosticsPreview(null)}
                  accessibilityRole="button"
                  accessibilityLabel={t("settings.cancel")}
                >
                  <Text style={[shared.buttonText, { color: colors.text }]}>{t("settings.cancel")}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[shared.button, styles.previewButton, { backgroundColor: colors.primary }]}
                  onPress={() => void handleShareDiagnostics()}
                  accessibilityRole="button"
                  accessibilityLabel={t("settings.share")}
                >
                  <Text style={[shared.buttonText, { color: "#ffffff" }]}>{t("settings.share")}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <Modal
          visible={auditLogPreview !== null}
          animationType="slide"
          transparent
          onRequestClose={() => setAuditLogPreview(null)}
        >
          <View style={styles.previewOverlay}>
            <View style={[styles.previewSheet, { backgroundColor: colors.surface }]}>
              <Text style={[styles.title, { fontSize: 16, color: colors.text }]}>
                {t("settings.auditLog")}
              </Text>
              <ScrollView style={styles.previewBody}>
                <Text
                  selectable
                  style={[styles.previewText, { color: colors.text }]}
                  accessibilityLabel={t("settings.auditLogEntriesLabel")}
                >
                  {auditLogPreview}
                </Text>
              </ScrollView>
              <View style={styles.previewActions}>
                <TouchableOpacity
                  style={[shared.button, styles.previewButton, { backgroundColor: colors.neutralBg }]}
                  onPress={() => setAuditLogPreview(null)}
                  accessibilityRole="button"
                  accessibilityLabel={t("settings.close")}
                >
                  <Text style={[shared.buttonText, { color: colors.text }]}>{t("settings.close")}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[shared.button, styles.previewButton, { backgroundColor: colors.primary }]}
                  onPress={() => void handleExportAuditLog()}
                  accessibilityRole="button"
                  accessibilityLabel={t("settings.share")}
                >
                  <Text style={[shared.buttonText, { color: "#ffffff" }]}>{t("settings.share")}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <View
          style={[styles.infoCard, { backgroundColor: colors.neutralBg, marginTop: 32 }]}
          accessibilityLabel={t("settings.stellarNetwork")}
        >
          <Text style={[styles.title, { fontSize: 16, color: colors.text, marginBottom: 8 }]}>
            {t("settings.stellarNetwork")}
          </Text>
          <Text style={[styles.infoText, { color: colors.textMuted, marginBottom: 12 }]}>
            {t("settings.currentNetwork", { label: getNetworkConfig(network).label })}
          </Text>
          {NETWORK_IDS.map((id) => (
            <TouchableOpacity
              key={id}
              style={[
                shared.button,
                styles.networkButton,
                { backgroundColor: id === network ? colors.primary : colors.neutralBg },
              ]}
              onPress={() => handleNetworkChange(id)}
              accessibilityRole="button"
              accessibilityLabel={t("settings.selectNetwork", { label: getNetworkConfig(id).label.toLowerCase() })}
              accessibilityState={{ selected: id === network }}
            >
              <Text
                style={[
                  shared.buttonText,
                  id === network ? shared.buttonText : { color: colors.text },
                ]}
              >
                {getNetworkConfig(id).label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View
          style={[styles.infoCard, { backgroundColor: colors.neutralBg, marginTop: 16 }]}
          accessibilityLabel={t("settings.about")}
        >
          <Text style={[styles.title, { fontSize: 16, color: colors.text, marginBottom: 8 }]}>
            {t("settings.about")}
          </Text>
          {[
            { label: t("settings.appVersion"), value: appVersion, color: colors.text },
            { label: t("settings.network"), value: network, color: colors.text },
            { label: t("settings.apiUrlLabel"), value: savedUrl, color: colors.text },
            { label: t("settings.serverStatus"), value: serverStatus, color: serverStatusColor },
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
            accessibilityLabel={t("settings.checkStatusAgain")}
            accessibilityState={{ disabled: isCheckingHealth || !savedUrl, busy: isCheckingHealth }}
          >
            {isCheckingHealth ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={[shared.buttonText, { color: "#ffffff" }]}>{t("settings.checkAgain")}</Text>
            )}
          </TouchableOpacity>
        </View>

        {__DEV__ ? (
          <View style={[styles.infoCard, { backgroundColor: colors.warningBg, marginTop: 16 }]}>
            <Text style={[styles.title, { fontSize: 16, color: colors.warning, marginBottom: 8 }]}>
              {t("settings.devOptions")}
            </Text>
            <Text style={[styles.infoText, { color: colors.warning, marginBottom: 16 }]}>
              {t("settings.devOptionsBody")}
            </Text>
            <TouchableOpacity
              style={[shared.button, { backgroundColor: colors.warning }]}
              onPress={() => navigation.navigate("DevSigner")}
              accessibilityRole="button"
              accessibilityLabel={t("settings.openDevSigner")}
            >
              <Text style={[shared.buttonText, { color: "#ffffff" }]}>{t("settings.openDevSigner")}</Text>
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
  hapticsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  hapticsCopy: {
    flex: 1,
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
  dataRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 6,
  },
  networkButton: {
    marginBottom: 8,
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
