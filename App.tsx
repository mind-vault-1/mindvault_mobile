import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import {
  fetchCatalog,
  fetchRegistryStatus,
  initializeApiBaseUrl,
  setApiBaseUrl,
} from "./src/api/resources";
import { ResourceCard } from "./src/components/ResourceCard";
import type { Resource } from "./src/types";
import { colors, shared, spacing, typography } from "./src/theme";

export default function App() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [registryCount, setRegistryCount] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [apiBaseUrl, setApiBaseUrlState] = useState<string>("");
  const [apiUrlInput, setApiUrlInput] = useState<string>("");

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const [catalog, registry] = await Promise.all([
        fetchCatalog(),
        fetchRegistryStatus().catch(() => null),
      ]);
      setResources(catalog);
      setRegistryCount(registry?.resourceCount ?? null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong loading the catalog.";
      setError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadSettings = useCallback(async () => {
    const loadedUrl = await initializeApiBaseUrl();
    setApiBaseUrlState(loadedUrl);
    setApiUrlInput(loadedUrl);
  }, []);

  useEffect(() => {
    void (async () => {
      await loadSettings();
      await loadData();
    })();
  }, [loadSettings, loadData]);

  const handleSaveApiUrl = useCallback(async () => {
    try {
      const savedUrl = await setApiBaseUrl(apiUrlInput);
      setApiBaseUrlState(savedUrl);
      setApiUrlInput(savedUrl);
      setToast("API base URL saved");
      setSettingsOpen(false);
      void loadData();
    } catch {
      setToast("Unable to save API base URL");
    }
  }, [apiUrlInput, loadData]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(timer);
  }, [toast]);

  const filteredResources = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return resources;
    return resources.filter((resource) => resource.title.toLowerCase().includes(query));
  }, [resources, search]);

  function renderEmpty() {
    if (loading) return null;

    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyTitle}>
          {resources.length > 0 ? "No matches" : "The catalog is empty"}
        </Text>
        <Text style={styles.emptyBody}>
          {resources.length > 0
            ? "Try a different search term."
            : "No resources have been published yet. Connect to a running MindVault server to browse the vault."}
        </Text>
      </View>
    );
  }

export default function App() {
  return (
    <SafeAreaView style={shared.screen} edges={["top", "left", "right"]}>
      <StatusBar style="dark" />
      <FlatList
        data={filteredResources}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void loadData(true)} />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.headerTop}>
              <View>
                <Text style={typography.title}>MindVault</Text>
                <Text style={typography.subtitle}>
                  Payment-protected digital resources on Stellar
                </Text>
                {registryCount !== null ? (
                  <Text style={styles.registry}>
                    {registryCount} resource{registryCount === 1 ? "" : "s"} on-chain
                  </Text>
                ) : null}
              </View>
              <Pressable style={[shared.button, styles.settingsButton]} onPress={() => setSettingsOpen(true)}>
                <Text style={shared.buttonText}>Settings</Text>
              </Pressable>
            </View>

            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search resources…"
              placeholderTextColor={colors.textSubtle}
              style={styles.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
            />

            <Text style={styles.apiHint}>API: {apiBaseUrl || "Loading…"}</Text>

            {error ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{error}</Text>
                <Pressable
                  onPress={() => void loadData()}
                  style={styles.retryButton}
                  accessibilityRole="button"
                  accessibilityLabel="Retry loading the catalog"
                >
                  <Text style={styles.retryText}>Retry</Text>
                </Pressable>
              </View>
            ) : null}

            {loading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={colors.primary} />
                <Text style={typography.body}>Loading catalog…</Text>
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item }) => <ResourceCard resource={item} onCopyUrl={setToast} />}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={renderEmpty}
      />

      <Modal
        visible={settingsOpen}
        animationType="slide"
        onRequestClose={() => setSettingsOpen(false)}
        transparent
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            <Text style={typography.title}>Settings</Text>
            <Text style={[typography.body, styles.modalNote]}>
              The app saves an API base URL here. For physical devices, use your machine's LAN IP
              instead of localhost.
            </Text>
            <TextInput
              value={apiUrlInput}
              onChangeText={setApiUrlInput}
              placeholder="http://localhost:4021"
              placeholderTextColor={colors.textSubtle}
              style={[styles.searchInput, styles.apiInput]}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            <Text style={styles.apiHint}>Current base URL: {apiBaseUrl || "Loading…"}</Text>
            <View style={styles.modalButtons}>
              <Pressable style={[shared.button, styles.modalButton]} onPress={() => setSettingsOpen(false)}>
                <Text style={shared.buttonText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[shared.button, shared.primaryButton, styles.modalButton]}
                onPress={handleSaveApiUrl}
              >
                <Text style={[shared.buttonText, shared.primaryButtonText]}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {toast ? (
        <View
          style={styles.toast}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}

      <RegisterModal
        visible={registerModalVisible}
        resource={selectedResource}
        onClose={handleCloseRegisterModal}
        onSuccess={handleRegisterSuccess}
        onError={handleRegisterError}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  listContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  header: {
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  settingsButton: {
    alignSelf: "flex-start",
  },
  registry: {
    marginTop: spacing.xs,
    fontSize: 13,
    fontWeight: "600",
    color: colors.primary,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
  },
  apiInput: {
    marginTop: spacing.sm,
  },
  apiHint: {
    fontSize: 11,
    color: colors.textSubtle,
  },
  errorBanner: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#fecaca",
    backgroundColor: "#fef2f2",
    padding: spacing.md,
    gap: spacing.sm,
  },
  errorText: {
    color: colors.danger,
    fontSize: 14,
  },
  retryButton: {
    alignSelf: "flex-start",
    borderRadius: 8,
    backgroundColor: colors.danger,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 44,
    justifyContent: "center",
  },
  retryText: {
    color: "#ffffff",
    fontWeight: "600",
    fontSize: 13,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  separator: {
    height: spacing.md,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.text,
  },
  emptyBody: {
    textAlign: "center",
    fontSize: 14,
    color: colors.textMuted,
    maxWidth: 320,
    lineHeight: 20,
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    padding: spacing.lg,
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: spacing.lg,
    gap: spacing.md,
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
  },
  modalButton: {
    minWidth: 88,
    alignItems: "center",
  },
  modalNote: {
    color: colors.textMuted,
    lineHeight: 20,
  },
});
