import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  type ListRenderItemInfo,
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
import { useFocusEffect } from "@react-navigation/native";
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
import { useToast } from "../components/ToastProvider";
import type { RootStackParamList } from "../navigation";
import { useLayout } from "../hooks/useLayout";
import {
  clearRecentResources,
  getRecentResources,
  recordRecentResource,
} from "../services/recent";
import type { RecentResource } from "../services/recent";
import {
  addSearchQuery,
  clearSearchHistory,
  filterSearchSuggestions,
  getSearchHistory,
  removeSearchQuery,
} from "../services/searchHistory";
import {
  deleteSearch,
  getSavedSearches,
  saveSearch,
  type SavedSearch,
} from "../services/savedSearches";
import { STORAGE_KEYS } from "../services/storage";
import type { CatalogFilters, CatalogSort, Resource, VerificationStatus } from "../types";
import { spacing } from "../theme";
import type { ThemeColors } from "../theme";
import { useAppTheme } from "../theme/ThemeProvider";
import {
  INVALID_PRICE_RANGE_MESSAGE,
  parsePriceRange,
} from "../utils/priceRange";
import { getRelativeTimeString } from "../utils/time";
import { t } from "../i18n";

const CATALOG_FILTERS_KEY = STORAGE_KEYS.catalogFilters;
const SEARCH_DEBOUNCE_MS = 300;

interface PersistedFilters {
  search: string;
  verification: VerificationFilter;
  resourceType: ResourceTypeFilter;
  minPrice: string;
  maxPrice: string;
  sort: CatalogSort;
  owner: string;
}

interface CatalogScreenProps {
  navigation: NativeStackNavigationProp<RootStackParamList, "Catalog">;
  route?: { params?: { owner?: string } };
}

function shortOwner(owner: string): string {
  return owner.length > 12 ? `${owner.slice(0, 6)}…${owner.slice(-4)}` : owner;
}

type VerificationFilter = "all" | VerificationStatus;
type ResourceTypeFilter = "all" | "file" | "link";

const DEFAULT_VERIFICATION: VerificationFilter = "all";
const DEFAULT_RESOURCE_TYPE: ResourceTypeFilter = "all";
const DEFAULT_SORT: CatalogSort = "newest";

const VERIFICATION_OPTIONS: { value: VerificationFilter; label: string }[] = [
  { value: "all", label: t("catalog.verification.all") },
  { value: "verified", label: t("catalog.verification.verified") },
  { value: "pending", label: t("catalog.verification.pending") },
  { value: "rejected", label: t("catalog.verification.rejected") },
];

const RESOURCE_TYPE_OPTIONS: { value: ResourceTypeFilter; label: string }[] = [
  { value: "all", label: t("catalog.type.all") },
  { value: "file", label: t("catalog.type.file") },
  { value: "link", label: t("catalog.type.link") },
];

const SORT_OPTIONS: { value: CatalogSort; label: string }[] = [
  { value: "newest", label: t("catalog.sort.newest") },
  { value: "price_asc", label: t("catalog.sort.priceAsc") },
  { value: "price_desc", label: t("catalog.sort.priceDesc") },
  { value: "title", label: t("catalog.sort.title") },
];


const DEFAULT_PERSISTED_FILTERS: PersistedFilters = {
  search: "",
  verification: DEFAULT_VERIFICATION,
  resourceType: DEFAULT_RESOURCE_TYPE,
  minPrice: "",
  maxPrice: "",
  sort: DEFAULT_SORT,
  owner: "",
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
    owner: typeof saved.owner === "string" ? saved.owner.trim() : "",
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
    headerButton: {
      borderRadius: 10,
      backgroundColor: colors.neutralBg,
      paddingHorizontal: 12,
      paddingVertical: 8,
      minHeight: 44,
      minWidth: 44,
      justifyContent: "center",
      alignItems: "center",
    },
    headerButtonText: {
      fontSize: 20,
      color: colors.textMuted,
    },
    gridRow: {
      gap: spacing.md,
    },
    gridItem: {
      flex: 1,
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
    suggestions: {
      gap: spacing.xs,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: spacing.sm,
    },
    suggestionRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    suggestionButton: {
      flex: 1,
      minHeight: 44,
      justifyContent: "center",
      paddingHorizontal: spacing.sm,
    },
    suggestionText: {
      fontSize: 15,
      color: colors.text,
    },
    suggestionRemove: {
      minHeight: 44,
      minWidth: 44,
      alignItems: "center",
      justifyContent: "center",
    },
    suggestionRemoveText: {
      fontSize: 14,
      color: colors.textMuted,
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
    savedSearchButton: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      minHeight: 44,
      justifyContent: "center",
    },
    saveSearchRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    saveSearchInput: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 14,
      color: colors.text,
    },
    saveSearchAction: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 12,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    savedSearchChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
    },
    savedSearchDelete: {
      minWidth: 32,
      minHeight: 44,
      alignItems: "center",
      justifyContent: "center",
    },
    savedSearchDeleteText: {
      fontSize: 20,
      color: colors.textMuted,
    },
    savedSearchName: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.text,
      marginBottom: spacing.xs,
    },
    savedSearchSummary: {
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

export function CatalogScreen({ navigation, route }: CatalogScreenProps) {
  const { colors, shared, typography, colorScheme } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const filtersRestored = useRef(false);
  const routeOwner = route?.params?.owner?.trim() || undefined;
  const routeOwnerRef = useRef(routeOwner);

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
  const [owner, setOwner] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registryFailed, setRegistryFailed] = useState(false);
  const toast = useToast();
  const { layout, columns, toggleLayout } = useLayout();
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);
  const [recent, setRecent] = useState<RecentResource[]>([]);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [searchFocused, setSearchFocused] = useState(false);
  const [relativeTimeKey, setRelativeTimeKey] = useState(0);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [saveSearchName, setSaveSearchName] = useState("");
  const [isSavingSearch, setIsSavingSearch] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setRelativeTimeKey((prev) => prev + 1);
    }, 60000);
    return () => clearInterval(timer);
  }, []);

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
        // A publisher link opened this screen: it wins over the saved owner.
        setOwner(routeOwnerRef.current ?? restored.owner);
        filtersRestored.current = true;
        setIsRestoring(false);
      }
    }
    restoreFilters();
  }, []);

  useEffect(() => {
    async function persistFilters() {
      if (!filtersRestored.current) return;
      const data: PersistedFilters = { search, verification, resourceType, minPrice, maxPrice, sort, owner };
      try {
        await AsyncStorage.setItem(CATALOG_FILTERS_KEY, JSON.stringify(data));
      } catch {
      }
    }
    persistFilters();
  }, [search, verification, resourceType, minPrice, maxPrice, sort, owner]);

  // "More from this publisher" re-targets an already-mounted catalog.
  useEffect(() => {
    routeOwnerRef.current = routeOwner;
    if (routeOwner && filtersRestored.current) setOwner(routeOwner);
  }, [routeOwner]);

  const removeOwner = useCallback(() => {
    setOwner("");
    routeOwnerRef.current = undefined;
    // Drop the param too, otherwise it would re-apply on the next focus.
    if (routeOwner) navigation.setParams?.({ owner: undefined });
  }, [navigation, routeOwner]);

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
    if (owner) filters.owner = owner;
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
          : t("catalog.loadError");
      setError(message);
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [debouncedSearch, verification, resourceType, debouncedMinPrice, debouncedMaxPrice, sort, owner, isRestoring]);

  useFocusEffect(
    useCallback(() => {
      if (lastUpdatedAt && new Date().getTime() - lastUpdatedAt.getTime() > 60000) {
        void loadData(true);
      }
    }, [lastUpdatedAt, loadData])
  );

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
    if (owner) filters.owner = owner;
    const range = parsePriceRange(debouncedMinPrice, debouncedMaxPrice);
    if (!range.isInvalid) {
      if (range.min !== null) filters.minPrice = String(range.min);
      if (range.max !== null) filters.maxPrice = String(range.max);
    }
    return filters;
  }, [debouncedSearch, verification, resourceType, debouncedMinPrice, debouncedMaxPrice, sort, owner]);

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
        err instanceof Error ? err.message : t("catalog.loadMoreError");
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
    void getRecentResources().then(setRecent);
    void getSearchHistory().then(setSearchHistory);
    void getSavedSearches().then(setSavedSearches);
  }, []);

  const rememberSearch = useCallback((query: string) => {
    if (!query.trim()) return;
    void addSearchQuery(query).then(setSearchHistory);
  }, []);

  const handleSearchSubmit = useCallback(() => {
    rememberSearch(search);
  }, [rememberSearch, search]);

  const handleSearchBlur = useCallback(() => {
    setSearchFocused(false);
    rememberSearch(search);
  }, [rememberSearch, search]);

  const applySuggestion = useCallback(
    (query: string) => {
      setSearch(query);
      // A picked suggestion runs straight away instead of waiting for the debounce.
      setDebouncedSearch(query);
      rememberSearch(query);
    },
    [rememberSearch],
  );

  const removeSuggestion = useCallback((query: string) => {
    void removeSearchQuery(query).then(setSearchHistory);
  }, []);

  const clearAllSuggestions = useCallback(() => {
    setSearchHistory([]);
    void clearSearchHistory();
  }, []);

  const suggestions = useMemo(
    () => (searchFocused ? filterSearchSuggestions(searchHistory, search) : []),
    [searchFocused, searchHistory, search],
  );

  const hasActiveFilters =
    search.trim() !== "" ||
    verification !== DEFAULT_VERIFICATION ||
    resourceType !== DEFAULT_RESOURCE_TYPE ||
    minPrice.trim() !== "" ||
    maxPrice.trim() !== "" ||
    sort !== DEFAULT_SORT ||
    owner !== "";

  const clearFilters = useCallback(() => {
    setSearch("");
    setVerification(DEFAULT_VERIFICATION);
    setResourceType(DEFAULT_RESOURCE_TYPE);
    setMinPrice("");
    setMaxPrice("");
    setSort(DEFAULT_SORT);
    removeOwner();
  }, [removeOwner]);

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

  const renderCatalogItem = useCallback(
    ({ item }: ListRenderItemInfo<Resource>) => (
      <Pressable
        onPress={() => openResource(item)}
        style={columns > 1 ? styles.gridItem : undefined}
        accessibilityRole="button"
        accessibilityLabel={t("catalog.openResource", { title: item.title })}
        accessibilityHint={t("catalog.opensResourceDetail")}
      >
        <ResourceCard resource={item} onCopyUrl={toast.info} layout={layout} />
      </Pressable>
    ),
    [openResource, toast, columns, layout, styles],
  );

  const clearRecent = useCallback(() => {
    setRecent([]);
    void clearRecentResources();
  }, []);

  const applySavedSearch = useCallback((saved: SavedSearch) => {
    setSearch(saved.search);
    setDebouncedSearch(saved.search);
    setVerification(saved.verification);
    setResourceType(saved.resourceType);
    setMinPrice(saved.minPrice);
    setMaxPrice(saved.maxPrice);
    setSort(saved.sort);
  }, []);

  const saveCurrentSearch = useCallback(async () => {
    const name = saveSearchName.trim();
    if (!name || isSavingSearch) return;
    setIsSavingSearch(true);
    try {
      const newSearch = await saveSearch({
        name,
        search,
        verification,
        resourceType,
        minPrice,
        maxPrice,
        sort,
      });
      setSavedSearches((prev) => [...prev, newSearch]);
      setSaveSearchName("");
      toast?.show(t("catalog.searchSaved", { name }));
    } catch (err) {
      const message = err instanceof Error ? err.message : t("catalog.saveSearchError");
      toast?.show(message, "error");
    } finally {
      setIsSavingSearch(false);
    }
  }, [saveSearchName, isSavingSearch, search, verification, resourceType, minPrice, maxPrice, sort, toast]);

  const deleteSavedSearch = useCallback((saved: SavedSearch) => {
    Alert.alert(
      t("catalog.deleteSearchTitle"),
      t("catalog.deleteSearchMessage", { name: saved.name }),
      [
        { text: t("catalog.cancel"), style: "cancel" },
        {
          text: t("catalog.delete"),
          style: "destructive",
          onPress: () => {
            void deleteSearch(saved.id).then((deleted) => {
              if (!deleted) return;
              setSavedSearches((prev) => prev.filter((entry) => entry.id !== saved.id));
              toast?.show(t("catalog.searchDeleted", { name: saved.name }));
            });
          },
        },
      ]
    );
  }, [toast]);

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
          accessibilityLabel={t("catalog.loadingMore")}
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
            accessibilityLabel={t("catalog.retryLoadMore")}
          >
            <Text style={styles.footerRetryText}>{t("catalog.retry")}</Text>
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
          {resources.length > 0 ? t("catalog.noMatches") : t("catalog.empty")}
        </Text>
        <Text style={styles.emptyBody}>
          {resources.length > 0
            ? t("catalog.noMatchesBody")
            : t("catalog.emptyBody")}
        </Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={shared.screen} edges={["top", "left", "right"]}>
      <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
      <FlatList
        // numColumns cannot change on the fly, so the list remounts on a switch.
        key={`catalog-${columns}`}
        data={loading ? null : resources}
        numColumns={columns}
        columnWrapperStyle={columns > 1 ? styles.gridRow : undefined}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        updateCellsBatchingPeriod={50}
        windowSize={7}
        removeClippedSubviews
        // Lets a suggestion be tapped without the first tap only dismissing the keyboard.
        keyboardShouldPersistTaps="handled"
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
                <Text style={typography.title} accessibilityRole="header">{t("app.title")}</Text>
                <Text style={typography.subtitle}>
                  {t("app.subtitle")}
                </Text>
                {registryCount !== null ? (
                  <Text
                    style={styles.registry}
                    accessibilityLabel={t("catalog.registryCount", {
                      count: registryCount,
                      suffix: registryCount === 1 ? "" : "s",
                    })}
                  >
                    {t("catalog.registryCountText", {
                      count: registryCount,
                      suffix: registryCount === 1 ? "" : "s",
                    })}
                  </Text>
                ) : registryFailed ? (
                  <Text
                    style={styles.registry}
                    accessibilityLabel={t("catalog.registryCountUnavailableLabel")}
                  >
                    {t("catalog.registryCountUnavailable")}
                  </Text>
                ) : null}
                {lastUpdatedAt ? (
                  <Text
                    style={styles.lastUpdated}
                    key={relativeTimeKey}
                    accessibilityLabel={t("catalog.updatedLabel", {
                      time: getRelativeTimeString(lastUpdatedAt),
                    })}
                  >
                    {t("catalog.updated", { time: getRelativeTimeString(lastUpdatedAt) })}
                  </Text>
                ) : null}
              </View>
              <Pressable
                style={styles.headerButton}
                onPress={() => navigation.navigate("Favorites")}
                accessibilityRole="button"
                accessibilityLabel={t("catalog.favourites")}
                accessibilityHint={t("catalog.favouritesHint")}
              >
                <Text style={styles.headerButtonText} importantForAccessibility="no">
                  ★
                </Text>
              </Pressable>
              <Pressable
                style={styles.headerButton}
                onPress={toggleLayout}
                accessibilityRole="button"
                accessibilityLabel={
                  layout === "grid" ? t("catalog.listView") : t("catalog.gridView")
                }
              >
                <Text
                  style={styles.headerButtonText}
                  importantForAccessibility="no"
                >
                  {layout === "grid" ? "☰" : "▦"}
                </Text>
              </Pressable>
              <Pressable
                style={styles.headerButton}
                onPress={() => navigation.navigate("Settings")}
                accessibilityRole="button"
                accessibilityLabel={t("catalog.settings")}
                accessibilityHint={t("catalog.settingsHint")}
              >
                <Text
                  style={styles.headerButtonText}
                  importantForAccessibility="no"
                >
                  ⚙
                </Text>
              </Pressable>
            </View>

            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder={t("catalog.searchPlaceholder")}
              placeholderTextColor={colors.textSubtle}
              style={styles.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
              accessibilityLabel={t("catalog.searchLabel")}
              accessibilityHint={
                searchHistory.length > 0
                  ? t("catalog.searchHintWithHistory")
                  : undefined
              }
              returnKeyType="search"
              onFocus={() => setSearchFocused(true)}
              onBlur={handleSearchBlur}
              onSubmitEditing={handleSearchSubmit}
            />

            {suggestions.length > 0 ? (
              <View
                style={styles.suggestions}
                testID="search-suggestions"
                accessibilityLabel={t("catalog.recentSearches")}
              >
                <View style={styles.recentHeader}>
                  <Text style={styles.filterLabel} accessibilityRole="header">
                    {t("catalog.recentSearches")}
                  </Text>
                  <Pressable
                    onPress={clearAllSuggestions}
                    style={styles.clearButton}
                    accessibilityRole="button"
                    accessibilityLabel={t("catalog.clearAllRecentLabel")}
                  >
                    <Text style={styles.clearButtonText}>{t("catalog.clearAllRecent")}</Text>
                  </Pressable>
                </View>
                {suggestions.map((query) => (
                  <View key={query} style={styles.suggestionRow}>
                    <Pressable
                      onPress={() => applySuggestion(query)}
                      style={styles.suggestionButton}
                      accessibilityRole="button"
                      accessibilityLabel={t("catalog.searchFor", { query })}
                      accessibilityHint={t("catalog.recentSearchHint")}
                    >
                      <Text style={styles.suggestionText} numberOfLines={1}>
                        {query}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => removeSuggestion(query)}
                      style={styles.suggestionRemove}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={t("catalog.removeRecentSearch", { query })}
                    >
                      <Text style={styles.suggestionRemoveText}>✕</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}

            {recent.length > 0 && search.trim() === "" ? (
              <View style={styles.recentSection}>
                <View style={styles.recentHeader}>
                  <Text style={styles.filterLabel} accessibilityRole="header">{t("catalog.recentlyViewed")}</Text>
                  <Pressable
                    onPress={clearRecent}
                    style={styles.clearButton}
                    accessibilityRole="button"
                    accessibilityLabel={t("catalog.clearRecentlyViewedLabel")}
                  >
                    <Text style={styles.clearButtonText}>{t("catalog.clearRecentlyViewed")}</Text>
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
                      accessibilityLabel={t("catalog.openRecentlyViewed", { title: entry.title })}
                      accessibilityHint={t("catalog.opensResourceDetail")}
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

            {hasActiveFilters ? (
              <View style={styles.recentSection}>
                <Text style={styles.filterLabel} accessibilityRole="header">{t("catalog.saveThisSearch")}</Text>
                <View style={styles.saveSearchRow}>
                  <TextInput
                    value={saveSearchName}
                    onChangeText={setSaveSearchName}
                    placeholder={t("catalog.searchNamePlaceholder")}
                    placeholderTextColor={colors.textSubtle}
                    style={styles.saveSearchInput}
                    accessibilityLabel={t("catalog.savedSearchName")}
                    onSubmitEditing={() => { void saveCurrentSearch(); }}
                  />
                  <Pressable
                    onPress={() => { void saveCurrentSearch(); }}
                    disabled={!saveSearchName.trim() || isSavingSearch}
                    style={[
                      styles.saveSearchAction,
                      (!saveSearchName.trim() || isSavingSearch) && styles.clearButtonDisabled,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={t("catalog.saveCurrentSearch")}
                    accessibilityState={{ disabled: !saveSearchName.trim() || isSavingSearch }}
                  >
                    <Text style={styles.clearButtonText}>{t("catalog.save")}</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            {savedSearches.length > 0 && search.trim() === "" ? (
              <View style={styles.recentSection}>
                <Text style={styles.filterLabel} accessibilityRole="header">{t("catalog.savedSearches")}</Text>
                <View style={styles.chipRow} accessibilityLabel={t("catalog.savedSearches")}>
                  {savedSearches.map((saved) => (
                    <View key={saved.id} style={styles.savedSearchChip}>
                      <Pressable
                        onPress={() => applySavedSearch(saved)}
                        style={styles.savedSearchButton}
                        accessibilityRole="button"
                        accessibilityLabel={t("catalog.applySavedSearch", { name: saved.name })}
                      >
                        <Text style={styles.savedSearchName} numberOfLines={1}>
                          {saved.name}
                        </Text>
                        <Text style={styles.savedSearchSummary} numberOfLines={1}>
                          {[saved.search, saved.verification !== "all" && saved.verification, saved.resourceType !== "all" && saved.resourceType]
                            .filter(Boolean)
                            .join(" • ")}
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => deleteSavedSearch(saved)}
                        style={styles.savedSearchDelete}
                        accessibilityRole="button"
                        accessibilityLabel={t("catalog.deleteSavedSearch", { name: saved.name })}
                      >
                        <Text style={styles.savedSearchDeleteText}>×</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {!hasActiveFilters && search.trim() === "" && (
              <HomeSections onSeeAll={handleSeeAll} />
            )}

            <View style={styles.filters}>
              {owner ? (
                <View style={styles.filterGroup}>
                  <Text style={styles.filterLabel} accessibilityRole="header">{t("catalog.publisher")}</Text>
                  <View style={styles.chipRow}>
                    <Pressable
                      onPress={removeOwner}
                      style={[styles.chip, styles.chipActive]}
                      accessibilityRole="button"
                      accessibilityLabel={t("catalog.removePublisherFilter", { owner: shortOwner(owner) })}
                    >
                      <Text style={[styles.chipText, styles.chipTextActive]}>
                        {shortOwner(owner)} ✕
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}
              <View style={styles.filterGroup}>
                <Text style={styles.filterLabel} accessibilityRole="header">{t("catalog.sort")}</Text>
                <View style={styles.chipRow} accessibilityRole="radiogroup" accessibilityLabel={t("catalog.sortLabel")}>
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
                <Text style={styles.filterLabel} accessibilityRole="header">{t("catalog.verification")}</Text>
                <View
                  style={styles.chipRow}
                  accessibilityRole="radiogroup"
                  accessibilityLabel={t("catalog.verificationLabel")}
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
                            ? t("catalog.currentlySelected")
                            : t("catalog.tapStatus")
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
                <Text style={styles.filterLabel} accessibilityRole="header">{t("catalog.type")}</Text>
                <View
                  style={styles.chipRow}
                  accessibilityRole="radiogroup"
                  accessibilityLabel={t("catalog.typeLabel")}
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
                            ? t("catalog.currentlySelected")
                            : t("catalog.tapType")
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
                <Text style={styles.filterLabel} accessibilityRole="header">{t("catalog.price")}</Text>
                <View style={styles.priceRow}>
                  <View style={styles.priceField}>
                    <TextInput
                      value={minPrice}
                      onChangeText={setMinPrice}
                      placeholder={t("catalog.min")}
                      placeholderTextColor={colors.textSubtle}
                      style={[
                        styles.priceInput,
                        priceRange.isInvalid && styles.priceInputInvalid,
                      ]}
                      keyboardType="decimal-pad"
                      inputMode="decimal"
                      accessibilityLabel={t("catalog.minimumPrice")}

                      accessibilityHint={
                        priceRange.isInvalid ? INVALID_PRICE_RANGE_MESSAGE : undefined
                      }
                    />
                  </View>
                  <View style={styles.priceField}>
                    <TextInput
                      value={maxPrice}
                      onChangeText={setMaxPrice}
                      placeholder={t("catalog.max")}
                      placeholderTextColor={colors.textSubtle}
                      style={[
                        styles.priceInput,
                        priceRange.isInvalid && styles.priceInputInvalid,
                      ]}
                      keyboardType="decimal-pad"
                      inputMode="decimal"
                      accessibilityLabel={t("catalog.maximumPrice")}

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
                    {t("catalog.resultsCount", {
                      shown: resources.length,
                      total: totalCount || resources.length,
                      suffix: (totalCount || resources.length) === 1 ? "" : "s",
                    })}
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
                    accessibilityLabel={t("catalog.clearFilters")}
                  >
                    <Text style={styles.clearButtonText}>{t("catalog.clearFilters")}</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>

            <Text style={styles.apiHint}>{t("catalog.api", { url: getApiBaseUrl() })}</Text>

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
        renderItem={renderCatalogItem}
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
        accessibilityLabel={t("catalog.scanQrLabel")}
      >
        <Text style={styles.fabText}>{t("catalog.scanQr")}</Text>
      </Pressable>

    </SafeAreaView>
  );
}
