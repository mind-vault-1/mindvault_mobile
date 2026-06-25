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

import {
  deleteStoredApiKey,
  fetchPublisherResources,
  getApiBaseUrl,
  getStoredApiKey,
  storeApiKey,
} from "../api/resources";
import type { PublisherResource } from "../types";
import { spacing } from "../theme";
import { useAppTheme } from "../theme/ThemeProvider";
import { ResourceCard } from "./ResourceCard";

interface PublisherResourcesScreenProps {
  onBackToPublic?: () => void;
}

export function PublisherResourcesScreen({ onBackToPublic }: PublisherResourcesScreenProps) {
  const { colors, shared, typography } = useAppTheme();
  const [apiKey, setApiKey] = useState("");
  const [storedApiKey, setStoredApiKey] = useState<string | null>(null);
  const [resources, setResources] = useState<PublisherResource[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [authenticated, setAuthenticated] = useState(false);

  // Load stored API key on mount
  useEffect(() => {
    const loadStoredKey = async () => {
      try {
        const stored = await getStoredApiKey();
        if (stored) {
          setStoredApiKey(stored);
          setAuthenticated(true);
          await loadResources(stored);
        }
      } catch (err) {
        console.error("Failed to load stored API key:", err);
      }
    };

    void loadStoredKey();
  }, []);

  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(timer);
  }, [toast]);

  const loadResources = useCallback(
    async (key: string, isRefresh = false) => {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const data = await fetchPublisherResources(key, search || undefined);
        setResources(data);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to fetch publisher resources";
        setError(message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [search]
  );

  const handleSaveApiKey = async () => {
    if (!apiKey.trim()) {
      setError("Please enter an API key");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Test the API key by fetching resources
      const testData = await fetchPublisherResources(apiKey.trim());
      // If successful, store it
      await storeApiKey(apiKey.trim());
      setStoredApiKey(apiKey.trim());
      setAuthenticated(true);
      setResources(testData);
      setApiKey("");
      setToast("API key saved successfully");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to authenticate";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await deleteStoredApiKey();
      setStoredApiKey(null);
      setAuthenticated(false);
      setResources([]);
      setSearch("");
      setError(null);
      setToast("Logged out successfully");
    } catch (err) {
      setError("Failed to logout");
    }
  };

  const handleRefresh = async () => {
    if (storedApiKey) {
      await loadResources(storedApiKey, true);
    }
  };

  const filteredResources = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return resources;
    return resources.filter((resource) => resource.title.toLowerCase().includes(query));
  }, [resources, search]);

  const renderAuthForm = () => (
    <SafeAreaView style={shared.screen} edges={["top", "left", "right"]}>
      <StatusBar style="dark" />
      <View style={styles.container}>
        <View style={styles.authSection}>
          <Text style={typography.title}>Publisher Resources</Text>
          <Text style={typography.subtitle}>Enter your API key to view your resources</Text>

          <View style={styles.formGroup}>
            <Text style={styles.label}>API Key</Text>
            <TextInput
              value={apiKey}
              onChangeText={setApiKey}
              placeholder="Enter your API key…"
              placeholderTextColor={colors.textSubtle}
              secureTextEntry
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
            />
          </View>

          {error ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Pressable
            onPress={handleSaveApiKey}
            disabled={loading || !apiKey.trim()}
            style={[shared.button, shared.primaryButton, loading && styles.disabledButton]}
          >
            <Text style={[shared.buttonText, shared.primaryButtonText]}>
              {loading ? "Authenticating…" : "Authenticate"}
            </Text>
          </Pressable>

          {onBackToPublic ? (
            <Pressable onPress={onBackToPublic} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Back to Public Catalog</Text>
            </Pressable>
          ) : null}

          <Text style={styles.apiHint}>API: {getApiBaseUrl()}</Text>
        </View>
      </View>

      {toast ? (
        <View style={styles.toast}>
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}
    </SafeAreaView>
  );

  const renderResourcesList = () => (
    <SafeAreaView style={shared.screen} edges={["top", "left", "right"]}>
      <StatusBar style="dark" />
      <FlatList
        data={filteredResources}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <View>
                <Text style={typography.title}>My Resources</Text>
                <Text style={typography.subtitle}>Your published resources</Text>
              </View>
              {onBackToPublic ? (
                <Pressable onPress={onBackToPublic} style={styles.backButton}>
                  <Text style={styles.backButtonText}>← Public</Text>
                </Pressable>
              ) : null}
            </View>

            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search your resources…"
              placeholderTextColor={colors.textSubtle}
              style={styles.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
            />

            {error ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{error}</Text>
                <Pressable onPress={handleRefresh} style={styles.retryButton}>
                  <Text style={styles.retryText}>Retry</Text>
                </Pressable>
              </View>
            ) : null}

            {loading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={colors.primary} />
                <Text style={typography.body}>Loading your resources…</Text>
              </View>
            ) : null}

            <Pressable onPress={handleLogout} style={styles.logoutButton}>
              <Text style={styles.logoutButtonText}>Logout</Text>
            </Pressable>
          </View>
        }
        renderItem={({ item }) => <ResourceCard resource={item} onCopyUrl={setToast} />}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={() =>
          !loading ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>
                {resources.length > 0 ? "No matches" : "No resources"}
              </Text>
              <Text style={styles.emptyBody}>
                {resources.length > 0
                  ? "Try a different search term."
                  : "You haven't published any resources yet."}
              </Text>
            </View>
          ) : null
        }
      />

      {toast ? (
        <View style={styles.toast}>
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}
    </SafeAreaView>
  );

  return authenticated ? renderResourcesList() : renderAuthForm();
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.lg,
  },
  authSection: {
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  formGroup: {
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
    borderColor: "#fecaca",
    backgroundColor: "#fef2f2",
    padding: spacing.md,
    gap: spacing.sm,
  },
  errorText: {
    color: colors.danger,
    fontSize: 14,
  },
  disabledButton: {
    opacity: 0.6,
  },
  secondaryButton: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.neutralBg,
    alignItems: "center",
  },
  secondaryButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.text,
  },
  apiHint: {
    fontSize: 11,
    color: colors.textSubtle,
    textAlign: "center",
    marginTop: spacing.sm,
  },
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
  backButton: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.primaryMuted,
  },
  backButtonText: {
    fontSize: 12,
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
  retryButton: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.dangerBg,
    borderRadius: 8,
  },
  retryText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.danger,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  logoutButton: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.dangerBg,
    alignItems: "center",
  },
  logoutButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.danger,
  },
  separator: {
    height: 0,
  },
  emptyState: {
    gap: spacing.sm,
    paddingVertical: spacing.xl,
    alignItems: "center",
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
  },
  emptyBody: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: "center",
    paddingHorizontal: spacing.md,
  },
  toast: {
    position: "absolute",
    bottom: spacing.xl,
    left: spacing.md,
    right: spacing.md,
    backgroundColor: colors.text,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  toastText: {
    color: colors.surface,
    fontSize: 14,
    fontWeight: "500",
  },
});
