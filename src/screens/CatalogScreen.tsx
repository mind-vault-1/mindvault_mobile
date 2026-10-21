import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import {
  fetchCatalog,
  fetchRegistryStatus,
  getApiBaseUrl,
} from "../api/resources";
import { ErrorBanner } from "../components/ErrorBanner";
import { HomeSections } from "../components/HomeSections";
import { ResourceCard } from "../components/ResourceCard";
import { SkeletonCard } from "../components/SkeletonCard";
import type { RootStackParamList } from "../navigation";
import {
  clearRecentResources,
  getRecentResources,
  recordRecentResource,
} from "../services/recent";
import type { RecentResource } from "../services/recent";
import type { CatalogFilters, CatalogSort, Resource, VerificationStatus } from "../types";
import { spacing } from "../theme";
import type { ThemeColors } from "../theme";
import { useAppTheme } from "../theme/ThemeProvider";
import {
  INVALID_PRICE_RANGE_MESSAGE,
  parsePriceRange,
} from "../utils/priceRange";

const CATALOG_FILTERS_KEY = "@mindvault_catalog_filters";
const SEARCH_DEBOUNCE_MS = 300;

interface PersistedFilters {
  search: string;
  verification: VerificationFilter;
  resourceType: ResourceTypeFilter;
  minPrice: string;
  maxPrice: string;
  sort: CatalogSort;
}

interface CatalogScreenProps {
  navigation: NativeStackNavigationProp<RootStackParamList, "Catalog">;
}

type VerificationFilter = "all" | VerificationStatus;
type ResourceTypeFilter = "all" | "file" | "link";

const DEFAULT_VERIFICATION: VerificationFilter = "all";
const DEFAULT_RESOURCE_TYPE: ResourceTypeFilter = "all";
const DEFAULT_SORT: CatalogSort = "newest";

const VERIFICATION_OPTIONS: { value: VerificationFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "verified", label: "Verified" },
  { value: "pending", label: "Pending" },
  { value: "rejected", label: "Rejected" },
];

const RESOURCE_TYPE_OPTIONS: { value: ResourceTypeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "file", label: "File" },
  { value: "link", label: "Link" },
];

const SORT_OPTIONS: { value: CatalogSort; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "price_asc", label: "Price: Low to high" },
  { value: "price_desc", label: "Price: High to low" },
  { value: "title", label: "Title" },
];

function formatLastUpdated(value: Date): string {
  return value.toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

const DEFAULT_PERSISTED_FILTERS: PersistedFilters = {
  search: "",
  verification: DEFAULT_VERIFICATION,
  resourceType: DEFAULT_RESOURCE_TYPE,
  minPrice: "",
  maxPrice: "",
  sort: DEFAULT_SORT,
};

/**
 * Validates a persisted filter blob field by field so an old or corrupted
 * value can never break the screen. Any invalid (or missing) field falls
 * back to its default.
 */
function sanitizePersistedFilters(raw: unknown): PersistedFilters {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ...DEFAULT_PERSISTED_FILTERS };
  }

  const saved = raw as Record<string, unknown>;
  const isVerification = VERIFICATION_OPTIONS.some(
    (option) => option.value === saved.verification,
  );
  const isResourceType = RESOURCE_TYPE_OPTIONS.some(
    (option) => option.value === saved.resourceType,
  );
  const isSort = SORT_OPTIONS.some((option) => option.value === saved.sort);

  return {
    search: typeof saved.search === "string" ? saved.search : "",
    verification: isVerification
      ? (saved.verification as VerificationFilter)
      : DEFAULT_VERIFICATION,
    resourceType: isResourceType
      ? (saved.resourceType as ResourceTypeFilter)
      : DEFAULT_RESOURCE_TYPE,
    minPrice: typeof saved.minPrice === "string" ? saved.minPrice : "",
    maxPrice: typeof saved.maxPrice === "string" ? saved.maxPrice : "",
    sort: isSort ? (saved.sort as CatalogSort) : DEFAULT_SORT,
  };
}

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
    lastUpdated: {
      fontSize: 12,
      color: colors.textSubtle,
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
    priceInputInvalid: {
      borderColor: colors.danger,
    },
    priceError: {
      fontSize: 12,
      lineHeight: 16,
      color: colors.danger,
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
    recentSection: {
      gap: spacing.sm,
    },
    recentHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    recentRow: {
      gap: spacing.sm,
      paddingRight: spacing.lg,
    },
    recentItem: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingHorizontal: 14,
      paddingVertical: 10,
      maxWidth: 220,
    },
    recentTitle: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.text,
    },
    recentPrice: {
      fontSize: 12,
      color: colors.textMuted,
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
    footerContainer: {
      paddingVertical: spacing.md,
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.xs,
    },
    footerErrorRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    footerErrorText: {
      fontSize: 13,
      color: colors.danger,
    },
    footerRetryButton: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 6,
      backgroundColor: colors.dangerBg,
    },
    footerRetryText: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.danger,
    },
  });
}

export function CatalogScreen({ navigation }: CatalogScreenProps) {
  const { colors, shared, typography, colorScheme } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const filtersRestored = useRef(false);

  const [resources, setResources] = useState<Resource[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [registryCount, setRegistryCount] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  // Price bounds are debounced like search so typing "12.50" sends one request.
  const [debouncedMinPrice, setDebouncedMinPrice] = useState("");
  const [debouncedMaxPrice, setDebouncedMaxPrice] = useState("");
  const [verification, setVerification] =
    useState<VerificationFilter>(DEFAULT_VERIFICATION);
  const [resourceType, setResourceType] = useState<ResourceTypeFilter>(
    DEFAULT_RESOURCE_TYPE,
  );
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [sort, setSort] = useState<CatalogSort>(DEFAULT_SORT);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registryFailed, setRegistryFailed] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);
  const [recent, setRecent] = useState<RecentResource[]>([]);

  useEffect(() => {
    async function restoreFilters() {
      let restored = { ...DEFAULT_PERSISTED_FILTERS };
      try {
        const raw = await AsyncStorage.getItem(CATALOG_FILTERS_KEY);
        if (raw) {
          restored = sanitizePersistedFilters(JSON.parse(raw));
        }
      } catch {
        // Invalid JSON or a storage failure — keep the defaults.
      } finally {
        setSearch(restored.search);
        setDebouncedSearch(restored.search);
        setVerification(restored.verification);
        setResourceType(restored.resourceType);
        setMinPrice(restored.minPrice);
        setMaxPrice(restored.maxPrice);
        setDebouncedMinPrice(restored.minPrice);
        setDebouncedMaxPrice(restored.maxPrice);
        setSort(restored.sort);
        filtersRestored.current = true;
        setIsRestoring(false);
      }
    }
    restoreFilters();
  }, []);

  useEffect(() => {
    async function persistFilters() {
      if (!filtersRestored.current) return;
      const data: PersistedFilters = { search, verification, resourceType, minPrice, maxPrice, sort };
      try {
        await AsyncStorage.setItem(CATALOG_FILTERS_KEY, JSON.stringify(data));
      } catch {
      }
    }
    persistFilters();
  }, [search, verification, resourceType, minPrice, maxPrice, sort]);

  const requestIdRef = useRef(0);

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRestoring) return;

    // Only the latest request may update state; older, slower responses
    // (or their errors) are discarded.
    const requestId = ++requestIdRef.current;

    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    const filters: CatalogFilters = {};
    if (debouncedSearch.trim()) filters.search = debouncedSearch.trim();
    if (verification !== DEFAULT_VERIFICATION) {
      filters.verificationStatus = verification;
    }
    if (resourceType !== DEFAULT_RESOURCE_TYPE) {
      filters.resourceType = resourceType;
    }
    if (sort !== DEFAULT_SORT) filters.sort = sort;
    const range = parsePriceRange(debouncedMinPrice, debouncedMaxPrice);
    if (!range.isInvalid) {
      if (range.min !== null) filters.minPrice = String(range.min);
      if (range.max !== null) filters.maxPrice = String(range.max);
    }

    try {
      const [catalogResult, registryResult] = await Promise.all([
        fetchCatalog(Object.keys(filters).length > 0 ? filters : undefined),
        // The registry count is supplementary: a failure must not fail the
        // catalog load, it only hides the count.
        fetchRegistryStatus().catch(() => null),
      ]);

      if (requestId !== requestIdRef.current) return;

      const items = Array.isArray(catalogResult) ? catalogResult : (catalogResult?.items ?? []);
      const total = Array.isArray(catalogResult)
        ? catalogResult.length
        : typeof catalogResult?.total === "number"
        ? catalogResult.total
        : items.length;
      const next = Array.isArray(catalogResult) ? null : (catalogResult?.nextOffset ?? null);

      setResources(items);
      setTotalCount(total);
      setNextOffset(next);
      setLoadMoreError(null);
      setRegistryFailed(registryResult === null);
      setRegistryCount(registryResult?.resourceCount ?? null);
      setLastUpdatedAt(new Date());
    } catch (err) {
      if (requestId !== requestIdRef.current) return;

      const message =
        err instanceof Error
          ? err.message
          : "Something went wrong loading the catalog.";
      setError(message);
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [debouncedSearch, verification, resourceType, debouncedMinPrice, debouncedMaxPrice, sort, isRestoring]);

  const currentFilters = useMemo(() => {
    const filters: CatalogFilters = {};
    if (debouncedSearch.trim()) filters.search = debouncedSearch.trim();
    if (verification !== DEFAULT_VERIFICATION) {
      filters.verificationStatus = verification;
    }
    if (resourceType !== DEFAULT_RESOURCE_TYPE) {
      filters.resourceType = resourceType;
    }
    if (sort !== DEFAULT_SORT) filters.sort = sort;
    const range = parsePriceRange(debouncedMinPrice, debouncedMaxPrice);
    if (!range.isInvalid) {
      if (range.min !== null) filters.minPrice = String(range.min);
      if (range.max !== null) filters.maxPrice = String(range.max);
    }
    return filters;
  }, [debouncedSearch, verification, resourceType, debouncedMinPrice, debouncedMaxPrice, sort]);

  const loadMore = useCallback(async () => {
    if (loading || loadingMore || nextOffset === null) {
      return;
    }

    // A filter change, search or refresh starts a new first-page request and
    // bumps the id; a next page that arrives after that belongs to the old
    // results and must not be appended.
    const requestId = requestIdRef.current;
    setLoadingMore(true);
    setLoadMoreError(null);

    try {
      const response = await fetchCatalog({
        ...currentFilters,
        offset: nextOffset,
      });
      if (requestId !== requestIdRef.current) return;

      const newItems = Array.isArray(response) ? response : (response?.items ?? []);
      const total = Array.isArray(response)
        ? response.length
        : typeof response?.total === "number"
        ? response.total
        : 0;
      const next = Array.isArray(response) ? null : (response?.nextOffset ?? null);

      setResources((prev) => {
        const existingIds = new Set(prev.map((item) => item.id));
        const filteredNewItems = newItems.filter((item) => !existingIds.has(item.id));
        return [...prev, ...filteredNewItems];
      });

      if (!Array.isArray(response) && typeof response?.total === "number") {
        setTotalCount(total);
      }
      setNextOffset(next);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      const message =
        err instanceof Error ? err.message : "Failed to load more resources.";
      setLoadMoreError(message);
    } finally {
      setLoadingMore(false);
    }
  }, [loading, loadingMore, nextOffset, currentFilters]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedMinPrice(minPrice);
      setDebouncedMaxPrice(maxPrice);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [minPrice, maxPrice]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    // Recently viewed is a shortcut, not data the screen depends on: a failed
    // read simply leaves the row hidden.
    void getRecentResources().then(setRecent);
  }, []);

  const hasActiveFilters =
    search.trim() !== "" ||
    verification !== DEFAULT_VERIFICATION ||
    resourceType !== DEFAULT_RESOURCE_TYPE ||
    minPrice.trim() !== "" ||
    maxPrice.trim() !== "" ||
    sort !== DEFAULT_SORT;

  const clearFilters = useCallback(() => {
    setSearch("");
    setVerification(DEFAULT_VERIFICATION);
    setResourceType(DEFAULT_RESOURCE_TYPE);
    setMinPrice("");
    setMaxPrice("");
    setSort(DEFAULT_SORT);
  }, []);

  const openResource = useCallback(
    (resource: RecentResource) => {
      // Record first, so the row is already right when the user comes back.
      void recordRecentResource({
        id: resource.id,
        title: resource.title,
        price: resource.price,
      }).then(setRecent);
      navigation.navigate("ResourceDetail", { resourceId: resource.id });
    },
    [navigation],
  );

  const clearRecent = useCallback(() => {
    setRecent([]);
    void clearRecentResources();
  }, []);

  const handleSeeAll = useCallback(
    (sectionSort?: CatalogSort, sectionFilter?: { verificationStatus?: "verified" }) => {
      if (sectionSort) {
        setSort(sectionSort);
      }
      if (sectionFilter?.verificationStatus) {
        setVerification(sectionFilter.verificationStatus);
      }
    },
    []
  );

  const priceRange = useMemo(
    () => parsePriceRange(minPrice, maxPrice),
    [minPrice, maxPrice],
  );

  function renderFooter() {
    if (loadingMore) {
      return (
        <View
          style={styles.footerContainer}
          accessibilityRole="progressbar"
          accessibilityLabel="Loading more resources"
        >
          <ActivityIndicator color={colors.primary} size="small" />
        </View>
      );
    }
    if (loadMoreError) {
      return (
        <View style={[styles.footerContainer, styles.footerErrorRow]}>
          <Text style={styles.footerErrorText}>{loadMoreError}</Text>
          <Pressable
            onPress={() => void loadMore()}
            style={styles.footerRetryButton}
            accessibilityRole="button"
            accessibilityLabel="Retry loading more resources"
          >
            <Text style={styles.footerRetryText}>Retry</Text>
          </Pressable>
        </View>
      );
    }
    return null;
  }

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
        data={loading ? null : resources}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void loadData(true)}
          />
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
                    {registryCount} resource{registryCount === 1 ? "" : "s"}{" "}
                    on-chain
                  </Text>
                ) : registryFailed ? (
                  <Text style={styles.registry}>
                    On-chain count unavailable
                  </Text>
                ) : null}
                {lastUpdatedAt ? (
                  <Text style={styles.lastUpdated}>
                    Last updated {formatLastUpdated(lastUpdatedAt)}
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
              accessibilityLabel="Search resources"
            />

            {recent.length > 0 && search.trim() === "" ? (
              <View style={styles.recentSection}>
                <View style={styles.recentHeader}>
                  <Text style={styles.filterLabel}>Recently viewed</Text>
                  <Pressable
                    onPress={clearRecent}
                    style={styles.clearButton}
                    accessibilityRole="button"
                    accessibilityLabel="Clear recently viewed"
                  >
                    <Text style={styles.clearButtonText}>Clear</Text>
                  </Pressable>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.recentRow}
                >
                  {recent.map((entry) => (
                    <Pressable
                      key={entry.id}
                      onPress={() => openResource(entry)}
                      style={styles.recentItem}
                      accessibilityRole="button"
                      accessibilityLabel={`Open recently viewed ${entry.title}`}
                      accessibilityHint="Opens the resource detail"
                    >
                      <Text style={styles.recentTitle} numberOfLines={1}>
                        {entry.title}
                      </Text>
                      <Text style={styles.recentPrice}>{entry.price} USDC</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            ) : null}

            {!hasActiveFilters && search.trim() === "" && (
              <HomeSections onSeeAll={handleSeeAll} />
            )}

            <View style={styles.filters}>
              <View style={styles.filterGroup}>
                <Text style={styles.filterLabel}>Sort</Text>
                <View style={styles.chipRow} accessibilityRole="radiogroup" accessibilityLabel="Sort catalog">
                  {SORT_OPTIONS.map((option) => {
                    const active = sort === option.value;
                    return (
                      <Pressable
                        key={option.value}
                        onPress={() => setSort(option.value)}
                        style={[styles.chip, active && styles.chipActive]}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: active }}
                        accessibilityLabel={option.label}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>{option.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
              <View style={styles.filterGroup}>
                <Text style={styles.filterLabel}>Verification</Text>
                <View
                  style={styles.chipRow}
                  accessibilityRole="radiogroup"
                  accessibilityLabel="Verification filter"
                >
                  {VERIFICATION_OPTIONS.map((option) => {
                    const active = verification === option.value;
                    return (
                      <Pressable
                        key={option.value}
                        onPress={() => setVerification(option.value)}
                        style={[styles.chip, active && styles.chipActive]}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: active }}
                        accessibilityLabel={option.label}
                        accessibilityHint={
                          active
                            ? "Currently selected"
                            : "Tap to filter by this status"
                        }
                      >
                        <Text
                          style={[
                            styles.chipText,
                            active && styles.chipTextActive,
                          ]}
                        >
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={styles.filterGroup}>
                <Text style={styles.filterLabel}>Type</Text>
                <View
                  style={styles.chipRow}
                  accessibilityRole="radiogroup"
                  accessibilityLabel="Resource type filter"
                >
                  {RESOURCE_TYPE_OPTIONS.map((option) => {
                    const active = resourceType === option.value;
                    return (
                      <Pressable
                        key={option.value}
                        onPress={() => setResourceType(option.value)}
                        style={[styles.chip, active && styles.chipActive]}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: active }}
                        accessibilityLabel={option.label}
                        accessibilityHint={
                          active
                            ? "Currently selected"
                            : "Tap to filter by this type"
                        }
                      >
                        <Text
                          style={[
                            styles.chipText,
                            active && styles.chipTextActive,
                          ]}
                        >
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
                      style={[
                        styles.priceInput,
                        priceRange.isInvalid && styles.priceInputInvalid,
                      ]}
                      keyboardType="decimal-pad"
                      inputMode="decimal"
                      accessibilityLabel="Minimum price"

                      accessibilityHint={
                        priceRange.isInvalid ? INVALID_PRICE_RANGE_MESSAGE : undefined
                      }
                    />
                  </View>
                  <View style={styles.priceField}>
                    <TextInput
                      value={maxPrice}
                      onChangeText={setMaxPrice}
                      placeholder="Max"
                      placeholderTextColor={colors.textSubtle}
                      style={[
                        styles.priceInput,
                        priceRange.isInvalid && styles.priceInputInvalid,
                      ]}
                      keyboardType="decimal-pad"
                      inputMode="decimal"
                      accessibilityLabel="Maximum price"

                      accessibilityHint={
                        priceRange.isInvalid ? INVALID_PRICE_RANGE_MESSAGE : undefined
                      }
                    />
                  </View>
                </View>
                {priceRange.isInvalid ? (
                  <Text
                    style={styles.priceError}
                    accessibilityRole="alert"
                    accessibilityLiveRegion="polite"
                  >
                    {INVALID_PRICE_RANGE_MESSAGE}
                  </Text>
                ) : null}
              </View>

              {!loading && resources.length > 0 ? (
                <View style={styles.resultsRow}>
                  <Text style={styles.resultsCount}>
                    Showing {resources.length} of {totalCount || resources.length} resource
                    {(totalCount || resources.length) === 1 ? "" : "s"}
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
          <Pressable
            onPress={() => openResource(item)}
            accessibilityRole="button"
            accessibilityLabel={`Open ${item.title}`}
            accessibilityHint="Opens the resource detail"
          >
            <ResourceCard resource={item} onCopyUrl={setToast} />
          </Pressable>
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={renderEmpty}
        onEndReached={() => void loadMore()}
        onEndReachedThreshold={0.5}
        ListFooterComponent={renderFooter}
      />

      <Pressable
        style={styles.fab}
        onPress={() => navigation.navigate("Scanner")}
        accessibilityRole="button"
        accessibilityLabel="Scan QR code"
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
