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
import type { Resource, VerificationStatus } from "../types";
import { spacing } from "../theme";
import type { ThemeColors } from "../theme";
import { useAppTheme } from "../theme/ThemeProvider";

interface CatalogScreenProps {
  navigation: NativeStackNavigationProp<RootStackParamList, "Catalog">;
}

type VerificationFilter = "all" | VerificationStatus;
type ResourceTypeFilter = "all" | "file" | "link";

interface FilterOption<T> {
  label: string;
  value: T;
}

const VERIFICATION_OPTIONS: FilterOption<VerificationFilter>[] = [
  { label: "All", value: "all" },
  { label: "Verified", value: "verified" },
  { label: "Pending", value: "pending" },
  { label: "Rejected", value: "rejected" },
];

const RESOURCE_TYPE_OPTIONS: FilterOption<ResourceTypeFilter>[] = [
  { label: "All", value: "all" },
  { label: "File", value: "file" },
  { label: "Link", value: "link" },
];

const DEFAULT_VERIFICATION: VerificationFilter = "all";
const DEFAULT_RESOURCE_TYPE: ResourceTypeFilter = "all";

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    listContent: {
      padding: spacing.lg,
      paddingBottom: spacing.xxl,
      gap: spacing.md,
    },
    header: {
      gap: spacing.md,
      marginBottom: spacing.lg,
    },
    headerRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: spacing.md,
    },
    settingsButton: {
      borderRadius: 10,
      backgroundColor: colors.neutralBg,
      paddingHorizontal: 12,
      paddingVertical: 8,
      minHeight: 44,
      minWidth: 44,
      justifyContent: "center",
      alignItems: "center",
    },
    settingsButtonText: {
      fontSize: 20,
      color: colors.textMuted,
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
    filters: {
      gap: spacing.md,
    },
    filterGroup: {
      gap: spacing.sm,
    },
    filterLabel: {
      fontSize: 12,
      fontWeight: "600",
      textTransform: "uppercase",
      letterSpacing: 0.5,
      color: colors.textMuted,
    },
    chipRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
    },
    chip: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    chipActive: {
      borderColor: colors.primary,
      backgroundColor: colors.primaryMuted,
    },
    chipText: {
      fontSize: 13,
      fontWeight: "500",
      color: colors.textMuted,
    },
    chipTextActive: {
      color: colors.primary,
      fontWeight: "600",
    },
    priceRow: {
      flexDirection: "row",
      gap: spacing.md,
    },
    priceField: {
      flex: 1,
      gap: spacing.xs,
    },
    priceInput: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 15,
      color: colors.text,
    },
    resultsRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: spacing.md,
    },
    resultsCount: {
      flex: 1,
      fontSize: 13,
      color: colors.textMuted,
    },
    clearButton: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 10,
      backgroundColor: colors.neutralBg,
    },
    clearButtonDisabled: {
      opacity: 0.5,
    },
    clearButtonText: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.primary,
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
      color: colors.background,
      textAlign: "center",
      fontSize: 14,
      fontWeight: "500",
    },
  });
}

export function CatalogScreen({ navigation }: CatalogScreenProps) {
  const { colors, shared, typography, colorScheme } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [resources, setResources] = useState<Resource[]>([]);
  const [registryCount, setRegistryCount] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [verification, setVerification] = useState<VerificationFilter>(DEFAULT_VERIFICATION);
  const [resourceType, setResourceType] = useState<ResourceTypeFilter>(DEFAULT_RESOURCE_TYPE);
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
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

  const hasActiveFilters =
    search.trim() !== "" ||
    verification !== DEFAULT_VERIFICATION ||
    resourceType !== DEFAULT_RESOURCE_TYPE ||
    minPrice.trim() !== "" ||
    maxPrice.trim() !== "";

  const clearFilters = useCallback(() => {
    setSearch("");
    setVerification(DEFAULT_VERIFICATION);
    setResourceType(DEFAULT_RESOURCE_TYPE);
    setMinPrice("");
    setMaxPrice("");
  }, []);

  const filteredResources = useMemo(() => {
    const query = search.trim().toLowerCase();
    const min = Number.parseFloat(minPrice);
    const max = Number.parseFloat(maxPrice);
    const hasMin = !Number.isNaN(min);
    const hasMax = !Number.isNaN(max);

    return resources.filter((resource) => {
      if (query) {
        const haystack = `${resource.title} ${resource.publisherName ?? ""} ${resource.resourceType}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }

      if (verification !== "all" && resource.verificationStatus !== verification) {
        return false;
      }

      if (resourceType !== "all" && resource.resourceType !== resourceType) {
        return false;
      }

      if (hasMin || hasMax) {
        const price = Number.parseFloat(resource.price);
        if (Number.isNaN(price)) return false;
        if (hasMin && price < min) return false;
        if (hasMax && price > max) return false;
      }

      return true;
    });
  }, [resources, search, verification, resourceType, minPrice, maxPrice]);

  function renderEmpty() {
    if (loading) return null;

    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyTitle}>
          {resources.length > 0 ? "No matches" : "The catalog is empty"}
        </Text>
        <Text style={styles.emptyBody}>
          {resources.length > 0
            ? "Try adjusting or clearing your filters."
            : "No resources have been published yet. Connect to a running MindVault server to browse the vault."}
        </Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={shared.screen} edges={["top", "left", "right"]}>
      <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
      <FlatList
        data={loading ? null : filteredResources}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void loadData(true)} />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.headerRow}>
              <View style={{ flex: 1 }}>
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
              <Pressable
                style={styles.settingsButton}
                onPress={() => navigation.navigate("Settings")}
                accessibilityRole="button"
                accessibilityLabel="Open settings"
              >
                <Text style={styles.settingsButtonText}>⚙</Text>
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

            <View style={styles.filters}>
              <View style={styles.filterGroup}>
                <Text style={styles.filterLabel}>Verification</Text>
                <View style={styles.chipRow}>
                  {VERIFICATION_OPTIONS.map((option) => {
                    const active = verification === option.value;
                    return (
                      <Pressable
                        key={option.value}
                        onPress={() => setVerification(option.value)}
                        style={[styles.chip, active && styles.chipActive]}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        accessibilityLabel={`Filter by verification: ${option.label}`}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={styles.filterGroup}>
                <Text style={styles.filterLabel}>Type</Text>
                <View style={styles.chipRow}>
                  {RESOURCE_TYPE_OPTIONS.map((option) => {
                    const active = resourceType === option.value;
                    return (
                      <Pressable
                        key={option.value}
                        onPress={() => setResourceType(option.value)}
                        style={[styles.chip, active && styles.chipActive]}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        accessibilityLabel={`Filter by type: ${option.label}`}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={styles.filterGroup}>
                <Text style={styles.filterLabel}>Price (USDC)</Text>
                <View style={styles.priceRow}>
                  <View style={styles.priceField}>
                    <TextInput
                      value={minPrice}
                      onChangeText={setMinPrice}
                      placeholder="Min"
                      placeholderTextColor={colors.textSubtle}
                      style={styles.priceInput}
                      keyboardType="decimal-pad"
                      inputMode="decimal"
                      accessibilityLabel="Minimum price"
                    />
                  </View>
                  <View style={styles.priceField}>
                    <TextInput
                      value={maxPrice}
                      onChangeText={setMaxPrice}
                      placeholder="Max"
                      placeholderTextColor={colors.textSubtle}
                      style={styles.priceInput}
                      keyboardType="decimal-pad"
                      inputMode="decimal"
                      accessibilityLabel="Maximum price"
                    />
                  </View>
                </View>
              </View>

              {!loading && resources.length > 0 ? (
                <View style={styles.resultsRow}>
                  <Text style={styles.resultsCount}>
                    Showing {filteredResources.length} of {resources.length} resource
                    {resources.length === 1 ? "" : "s"}
                  </Text>
                  <Pressable
                    onPress={clearFilters}
                    disabled={!hasActiveFilters}
                    style={[
                      styles.clearButton,
                      !hasActiveFilters && styles.clearButtonDisabled,
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !hasActiveFilters }}
                    accessibilityLabel="Clear filters"
                  >
                    <Text style={styles.clearButtonText}>Clear filters</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>

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
          <ResourceCard
            resource={item}
            onCopyUrl={setToast}
            onPress={() =>
              navigation.navigate("ResourceDetail", { resourceId: item.id })
            }
          />
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
