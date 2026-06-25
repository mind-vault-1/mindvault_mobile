import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { fetchCatalog, fetchPublisherResources, fetchRegistryStatus, getApiBaseUrl } from "./src/api/resources";
import { PublisherSettings } from "./src/components/PublisherSettings";
import { ResourceCard } from "./src/components/ResourceCard";
import { getApiKey } from "./src/services/secureStorage";
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
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [publisherMode, setPublisherMode] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);

  const checkApiKey = useCallback(async () => {
    const key = await getApiKey();
    setHasApiKey(!!key);
  }, []);

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      if (publisherMode) {
        const publisherResources = await fetchPublisherResources();
        setResources(publisherResources);
      } else {
        const [catalog, registry] = await Promise.all([
          fetchCatalog(),
          fetchRegistryStatus().catch(() => null),
        ]);
        setResources(catalog);
        setRegistryCount(registry?.resourceCount ?? null);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong loading the catalog.";
      setError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [publisherMode]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    void checkApiKey();
  }, [checkApiKey]);

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

  const handleApiKeySet = useCallback(() => {
    void checkApiKey();
    void loadData();
  }, [checkApiKey, loadData]);

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
            <View style={styles.titleRow}>
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
              <Pressable onPress={() => setSettingsVisible(true)} style={styles.settingsButton}>
                <Text style={styles.settingsButtonText}>⚙️</Text>
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

            <Text style={styles.apiHint}>API: {getApiBaseUrl()}</Text>

            {hasApiKey ? (
              <Pressable
                onPress={() => setPublisherMode(!publisherMode)}
                style={({ pressed }) => [
                  styles.modeToggle,
                  publisherMode && styles.modeToggleActive,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Text style={[styles.modeToggleText, publisherMode && styles.modeToggleActiveText]}>
                  {publisherMode ? "📚 View Catalog" : "👤 Publisher Mode"}
                </Text>
              </Pressable>
            ) : null}

            {error ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{error}</Text>
                <Pressable onPress={() => void loadData()} style={styles.retryButton}>
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
        renderItem={({ item }) => (
          <ResourceCard resource={item} onCopyUrl={setToast} />
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={renderEmpty}
      />

      {toast ? (
        <View style={styles.toast}>
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}

      <PublisherSettings
        visible={settingsVisible}
        onClose={() => setSettingsVisible(false)}
        onApiKeySet={handleApiKeySet}
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
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  settingsButton: {
    padding: spacing.sm,
  },
  settingsButtonText: {
    fontSize: 24,
  },
  registry: {
    marginTop: spacing.xs,
    fontSize: 13,
    fontWeight: "600",
    color: colors.primary,
  },
  modeToggle: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  modeToggleActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  buttonPressed: {
    opacity: 0.7,
  },
  modeToggleText: {
    color: colors.text,
    fontWeight: "600",
    fontSize: 15,
  },
  modeToggleActiveText: {
    color: "#ffffff",
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
});
