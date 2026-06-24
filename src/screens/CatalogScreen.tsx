import { useCallback, useEffect, useMemo, useState } from "react";
import {
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
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { fetchCatalog, fetchRegistryStatus, getApiBaseUrl } from "../api/resources";
import { ErrorBanner } from "../components/ErrorBanner";
import { ResourceCard } from "../components/ResourceCard";
import { SkeletonCard } from "../components/SkeletonCard";
import type { RootStackParamList } from "../navigation";
import type { Resource } from "../types";
import { colors, shared, spacing, typography } from "../theme";

interface CatalogScreenProps {
  navigation: NativeStackNavigationProp<RootStackParamList, "Catalog">;
}

export function CatalogScreen({ navigation }: CatalogScreenProps) {
  const [resources, setResources] = useState<Resource[]>([]);
  const [registryCount, setRegistryCount] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

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

  useEffect(() => {
    void loadData();
  }, [loadData]);

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

  return (
    <SafeAreaView style={shared.screen} edges={["top", "left", "right"]}>
      <StatusBar style="dark" />
      <FlatList
        data={loading ? null : filteredResources}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void loadData(true)} />
        }
        ListHeaderComponent={
          <View style={styles.header}>
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

            {error ? (
              <ErrorBanner message={error} onRetry={() => void loadData()} />
            ) : null}

            {loading ? (
              <View style={styles.skeletons}>
                {Array.from({ length: 4 }).map((_, i) => (
                  <SkeletonCard key={i} />
                ))}
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

      <Pressable
        style={styles.fab}
        onPress={() => navigation.navigate("Scanner")}
      >
        <Text style={styles.fabText}>Scan QR</Text>
      </Pressable>

      {toast ? (
        <View style={styles.toast}>
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}
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
  apiHint: {
    fontSize: 11,
    color: colors.textSubtle,
  },
  skeletons: {
    gap: 12,
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
  fab: {
    position: "absolute",
    right: spacing.lg,
    bottom: spacing.xl,
    backgroundColor: colors.primary,
    borderRadius: 28,
    paddingHorizontal: 20,
    paddingVertical: 14,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  fabText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 15,
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
