import AsyncStorage from "@react-native-async-storage/async-storage";
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
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import {
  deleteStoredApiKey,
  delistResource,
  fetchPublisherResources,
  getApiBaseUrl,
  getStoredApiKey,
  storeApiKey,
} from "../api/resources";
import type { Resource } from "../types";
import type { RootStackParamList } from "../navigation";
import { spacing } from "../theme";
import { STORAGE_KEYS } from "../services/storage";
import { useAppTheme } from "../theme/ThemeProvider";
import { RegisterModal } from "../components/RegisterModal";
import { ResourceCard } from "../components/ResourceCard";
import { SkeletonCard } from "../components/SkeletonCard";
import { TransferOwnershipModal } from "../components/TransferOwnershipModal";
import { PublisherSignupSheet } from "../components/PublisherSignupSheet";
import { useToast } from "../components/ToastProvider";
import { useNetworkStatus } from "../hooks/useNetworkStatus";
import { enqueueMutation } from "../services/mutationQueue";
import { logError } from "../utils/errorLogger";

type PublisherResourcesNavigation = NativeStackNavigationProp<
  RootStackParamList,
  "PublisherResources"
>;

const PUBLISHER_FILTERS_KEY = `${STORAGE_KEYS.catalogFilters}:publisher`;

export function PublisherResourcesScreen() {
  const { colors, colorScheme, shared, typography } = useAppTheme();
  const navigation = useNavigation<PublisherResourcesNavigation>();

  const goToPublicCatalog = useCallback(() => {
    navigation.popToTop();
  }, [navigation]);

  const [apiKey, setApiKey] = useState("");
  const [storedApiKey, setStoredApiKey] = useState<string | null>(null);
  const [resources, setResources] = useState<Resource[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [checkingStoredKey, setCheckingStoredKey] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const { isOffline } = useNetworkStatus();
  const [authenticated, setAuthenticated] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showSignup, setShowSignup] = useState(false);
  const [verificationFilter, setVerificationFilter] = useState<"all" | "verified" | "pending" | "rejected">("all");
  const [onchainStatusFilter, setOnchainStatusFilter] = useState<"all" | "registered" | "unregistered">("all");
  const [sortBy, setSortBy] = useState<"newest" | "price_asc" | "price_desc" | "title">("newest");
  /** Issue #66: the resource currently open in the TransferOwnershipModal, or null */
  const [transferResource, setTransferResource] = useState<Resource | null>(null);
  /** Issue #204: the resource currently open in the RegisterModal, or null */
  const [registerResource, setRegisterResource] = useState<Resource | null>(null);
  /** Issue #220: the resource awaiting delist confirmation, or null */
  const [delistTarget, setDelistTarget] = useState<Resource | null>(null);
  const [delisting, setDelisting] = useState(false);
  const [delistError, setDelistError] = useState<string | null>(null);

  const styles = useMemo(() => {
    return StyleSheet.create({
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
      helpCard: {
        marginTop: spacing.md,
        padding: spacing.md,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        gap: spacing.xs,
      },
      helpHeaderRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
      },
      helpTitle: {
        fontSize: 13,
        fontWeight: "600",
        color: colors.text,
        flex: 1,
      },
      helpToggleButton: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 6,
        backgroundColor: colors.primaryMuted,
      },
      helpToggleText: {
        fontSize: 12,
        fontWeight: "600",
        color: colors.primary,
      },
      helpBody: {
        fontSize: 13,
        color: colors.textMuted,
        lineHeight: 18,
      },
      helpDetails: {
        marginTop: spacing.xs,
        paddingTop: spacing.xs,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        gap: 4,
      },
      helpStep: {
        fontSize: 12,
        color: colors.textSubtle,
        lineHeight: 16,
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
      skeletons: {
        gap: 12,
      },
      publishButton: {
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 8,
        marginBottom: spacing.sm,
        backgroundColor: colors.primaryMuted,
        alignItems: "center",
      },
      publishButtonText: {
        fontSize: 12,
        fontWeight: "600",
        color: colors.primary,
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
      filterRow: {
        flexDirection: "row",
        gap: spacing.sm,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        flexWrap: "wrap",
      },
      chip: {
        borderRadius: 999,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        paddingHorizontal: 12,
        paddingVertical: 6,
      },
      chipActive: {
        borderColor: colors.primary,
        backgroundColor: colors.primaryMuted,
      },
      chipText: {
        fontSize: 12,
        fontWeight: "500",
        color: colors.textMuted,
      },
      chipTextActive: {
        color: colors.primary,
        fontWeight: "600",
      },
      manageButton: {
        marginTop: spacing.sm,
        minHeight: 44,
        borderRadius: 10,
        backgroundColor: colors.primaryMuted,
        alignItems: "center",
        justifyContent: "center",
      },
      manageButtonText: {
        fontSize: 13,
        fontWeight: "600",
        color: colors.primary,
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
      modalOverlay: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.5)",
        justifyContent: "center",
        padding: spacing.lg,
      },
      modalCard: {
        backgroundColor: colors.surface,
        borderRadius: 20,
        padding: spacing.lg,
        gap: spacing.md,
      },
      modalBody: {
        color: colors.textMuted,
      },
      modalActions: {
        flexDirection: "row",
        gap: spacing.sm,
        marginTop: spacing.sm,
      },
      modalCancelButton: {
        flex: 1,
        backgroundColor: colors.neutralBg,
        alignItems: "center",
      },
      modalCancelText: {
        color: colors.text,
        fontWeight: "600",
      },
      modalConfirmButton: {
        flex: 1,
        backgroundColor: colors.danger,
        alignItems: "center",
      },
    });
  }, [colors]);

  const loadResources = useCallback(
    async (key: string, isRefresh = false, searchTerm?: string) => {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const data = await fetchPublisherResources(key, searchTerm || undefined);
        setResources(data);
        return true;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to fetch publisher resources";
        setError(message);
        return false;
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    const loadStoredKey = async () => {
      try {
        const stored = await getStoredApiKey();
        if (stored) {
          setStoredApiKey(stored);
          const loaded = await loadResources(stored);
          if (loaded) {
            setAuthenticated(true);
          }
        }
      } catch (err) {
        logError("publisherResources.loadStoredApiKey", err);
      } finally {
        setCheckingStoredKey(false);
      }
    };

    void loadStoredKey();
  }, [loadResources]);

  useEffect(() => {
    async function restoreFilters() {
      try {
        const raw = await AsyncStorage.getItem(PUBLISHER_FILTERS_KEY);
        if (raw) {
          const filters = JSON.parse(raw);
          if (filters.verificationFilter && ["all", "verified", "pending", "rejected"].includes(filters.verificationFilter)) {
            setVerificationFilter(filters.verificationFilter);
          }
          if (filters.onchainStatusFilter && ["all", "registered", "unregistered"].includes(filters.onchainStatusFilter)) {
            setOnchainStatusFilter(filters.onchainStatusFilter);
          }
          if (filters.sortBy && ["newest", "price_asc", "price_desc", "title"].includes(filters.sortBy)) {
            setSortBy(filters.sortBy);
          }
        }
      } catch {
      }
    }
    void restoreFilters();
  }, []);

  useEffect(() => {
    async function persistFilters() {
      try {
        await AsyncStorage.setItem(
          PUBLISHER_FILTERS_KEY,
          JSON.stringify({
            verificationFilter,
            onchainStatusFilter,
            sortBy,
          })
        );
      } catch {
      }
    }
    void persistFilters();
  }, [verificationFilter, onchainStatusFilter, sortBy]);

  const handleSaveApiKey = async () => {
    if (!apiKey.trim()) {
      setError("Please enter an API key");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const testData = await fetchPublisherResources(apiKey.trim());
      await storeApiKey(apiKey.trim());
      setStoredApiKey(apiKey.trim());
      setAuthenticated(true);
      setResources(testData);
      setApiKey("");
      toast.success("API key saved successfully");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to authenticate";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleApiKeyChange = (value: string) => {
    setApiKey(value);
    setError(null);
  };

  const handleLogout = async () => {
    try {
      await deleteStoredApiKey();
      setStoredApiKey(null);
      setAuthenticated(false);
      setResources([]);
      setSearch("");
      setError(null);
      toast.success("Logged out successfully");
    } catch {
      setError("Failed to logout");
    }
  };

  const handleSignupSuccess = useCallback(async (newApiKey: string) => {
    const normalizedKey = newApiKey.trim();
    try {
      await storeApiKey(normalizedKey);
      setStoredApiKey(normalizedKey);
      setAuthenticated(true);
      setShowSignup(false);
      const loaded = await loadResources(normalizedKey);
      if (loaded) toast.success("Publisher account created successfully");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save publisher API key";
      setError(message);
    }
  }, [loadResources, toast]);

  const handleRefresh = async () => {
    if (storedApiKey) {
      await loadResources(storedApiKey, true, search);
    }
  };

  /**
   * Issue #65: When a price edit succeeds, update the resource in local state
   * immediately so the displayed price does not remain stale. The next pull-to-
   * refresh will re-fetch the authoritative value from the server.
   */
  const handlePriceUpdated = useCallback((resourceId: string, newPrice: string) => {
    setResources((prev) =>
      prev.map((r) => (r.id === resourceId ? { ...r, price: newPrice } : r))
    );
    toast.success("Price updated successfully");
  }, [toast]);

  /**
   * Issue #66: Open the TransferOwnershipModal for the given resource.
   */
  const handleOpenTransfer = useCallback((resource: Resource) => {
    setTransferResource(resource);
  }, []);

  /**
   * Issue #66: Called when ownership transfer completes successfully.
   * Removes the resource from the local list (the publisher no longer owns it)
   * and shows a confirmation toast. All state updaters are pure — the
   * transferred resource is read from the closure, not from inside an
   * updater function.
   */
  const handleTransferSuccess = useCallback(
    (_txHash: string | null) => {
      const transferredId = transferResource?.id;
      if (transferredId) {
        setResources((prev) => prev.filter((r) => r.id !== transferredId));
      }
      setTransferResource(null);
      toast.success("Ownership transferred successfully");
    },
    [transferResource, toast]
  );

  /**
   * Issue #204: Open the RegisterModal for the given resource.
   */
  const handleOpenRegister = useCallback((resource: Resource) => {
    setRegisterResource(resource);
  }, []);

  /**
   * Issue #204: Called when on-chain registration completes successfully.
   * Updates the resource in local state to registered with the tx hash and shows a toast.
   * The modal stays open on its success step (explorer link) until the user closes it.
   */
  const handleRegisterSuccess = useCallback(
    (message: string, txHash: string) => {
      const registeredId = registerResource?.id;
      if (registeredId) {
        setResources((prev) =>
          prev.map((r) =>
            r.id === registeredId
              ? {
                  ...r,
                  onchainStatus: "registered",
                  onchainTxHash: txHash,
                }
              : r
          )
        );
      }
      toast.success(message);
    },
    [registerResource, toast]
  );

  const handleRegisterError = useCallback((message: string) => {
    toast.error(message);
  }, [toast]);

  /**
   * Issue #220: Open the delist confirmation for the given resource.
   */
  const handleOpenDelist = useCallback((resource: Resource) => {
    setDelistError(null);
    setDelistTarget(resource);
  }, []);

  const handleCloseDelist = useCallback(() => {
    setDelistTarget(null);
    setDelistError(null);
  }, []);

  /**
   * Issue #220: Delist the resource, then drop it from the local list. The
   * modal stays open on failure so the server message stays visible.
   */
  const handleConfirmDelist = useCallback(async () => {
    const target = delistTarget;
    if (!target) return;

    if (isOffline) {
      // Queued offline — no spinner, just a Queued confirmation.
      await enqueueMutation({
        kind: "delist",
        payload: { resourceId: target.id, title: target.title },
        idempotencyKey: `delist:${target.id}`,
      });
      setDelistTarget(null);
      toast.info("Queued — delist will complete when you're back online");
      return;
    }

    setDelisting(true);
    setDelistError(null);

    try {
      await delistResource(target.id);
      setResources((prev) => prev.filter((r) => r.id !== target.id));
      setDelistTarget(null);
      toast.success("Resource delisted");
    } catch (err) {
      logError("publisherResources.delist", err);
      setDelistError(err instanceof Error ? err.message : "Failed to delist resource");
    } finally {
      setDelisting(false);
    }
  }, [delistTarget, isOffline, toast]);

  const filteredResources = useMemo(() => {
    let result = resources;

    const query = search.trim().toLowerCase();
    if (query) {
      result = result.filter((resource) =>
        [
          resource.title,
          resource.publisherName,
          resource.walletAddress,
          resource.resourceType,
          resource.accessUrl,
        ].some((value) => value?.toLowerCase().includes(query))
      );
    }

    if (verificationFilter !== "all") {
      result = result.filter((r) => r.verificationStatus === verificationFilter);
    }

    if (onchainStatusFilter !== "all") {
      const isRegistered = onchainStatusFilter === "registered";
      result = result.filter((r) => (r.onchainStatus === "registered") === isRegistered);
    }

    result.sort((a, b) => {
      switch (sortBy) {
        case "newest":
          return new Date(b.publishedAt ?? b.updatedAt ?? 0).getTime() - new Date(a.publishedAt ?? a.updatedAt ?? 0).getTime();
        case "price_asc":
          return parseFloat(a.price || "0") - parseFloat(b.price || "0");
        case "price_desc":
          return parseFloat(b.price || "0") - parseFloat(a.price || "0");
        case "title":
          return a.title.localeCompare(b.title);
        default:
          return 0;
      }
    });

    return result;
  }, [resources, search, verificationFilter, onchainStatusFilter, sortBy]);

  const renderStoredKeyLoading = () => (
    <SafeAreaView style={shared.screen} edges={["top", "left", "right"]}>
      <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
      <View style={[styles.container, styles.emptyState]}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={styles.emptyBody}>Checking saved API key…</Text>
      </View>
    </SafeAreaView>
  );

  const renderAuthForm = () => (
    <SafeAreaView style={shared.screen} edges={["top", "left", "right"]}>
      <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
      <View style={styles.container}>
        <View style={styles.authSection}>
          <Text style={typography.title}>Publisher Resources</Text>
          <Text style={typography.subtitle}>Enter your API key to view your resources</Text>

          <View style={styles.formGroup}>
            <Text style={styles.label}>API Key</Text>
            <TextInput
              value={apiKey}
              onChangeText={handleApiKeyChange}
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

          <Pressable
            onPress={() => setShowSignup(true)}
            disabled={loading}
            style={[shared.button, styles.secondaryButton, loading && styles.disabledButton]}
          >
            <Text style={styles.secondaryButtonText}>Create a publisher account</Text>
          </Pressable>

          <Pressable onPress={goToPublicCatalog} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Back to Public Catalog</Text>
          </Pressable>

          <View style={styles.helpCard}>
            <View style={styles.helpHeaderRow}>
              <Text style={styles.helpTitle}>🔑 Where do API keys come from?</Text>
              <Pressable
                onPress={() => setShowHelp((prev) => !prev)}
                style={styles.helpToggleButton}
              >
                <Text style={styles.helpToggleText}>
                  {showHelp ? "Hide Guide" : "Setup Guide"}
                </Text>
              </Pressable>
            </View>
            <Text style={styles.helpBody}>
              Publisher API keys are generated by your MindVault API server administrator or configured in server environment variables.
            </Text>
            {showHelp ? (
              <View style={styles.helpDetails}>
                <Text style={styles.helpStep}>
                  1. Ensure your MindVault server is running and reachable.
                </Text>
                <Text style={styles.helpStep}>
                  2. Obtain an API key configured in `PUBLISHER_API_KEYS` on your server.
                </Text>
                <Text style={styles.helpStep}>
                  3. Enter the key above and tap Authenticate to access your resources.
                </Text>
              </View>
            ) : null}
          </View>

          <Text style={styles.apiHint}>API: {getApiBaseUrl()}</Text>
        </View>
      </View>


      <PublisherSignupSheet
        visible={showSignup}
        onClose={() => setShowSignup(false)}
        onSuccess={handleSignupSuccess}
      />
    </SafeAreaView>
  );

  const renderResourcesList = () => (
    <SafeAreaView style={shared.screen} edges={["top", "left", "right"]}>
      <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
      <FlatList
        data={loading ? null : filteredResources}
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
              <Pressable onPress={goToPublicCatalog} style={styles.backButton}>
                <Text style={styles.backButtonText}>← Public</Text>
              </Pressable>
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

            <View>
              <Text style={styles.label}>Sort by</Text>
              <View style={styles.filterRow}>
                {(["newest", "price_asc", "price_desc", "title"] as const).map((option) => {
                  const labels: Record<typeof option, string> = {
                    newest: "Newest",
                    price_asc: "Price: Low to High",
                    price_desc: "Price: High to Low",
                    title: "Title",
                  };
                  const isActive = sortBy === option;
                  return (
                    <Pressable
                      key={option}
                      onPress={() => setSortBy(option)}
                      style={[styles.chip, isActive && styles.chipActive]}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: isActive }}
                      accessibilityLabel={labels[option]}
                    >
                      <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                        {labels[option]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View>
              <Text style={styles.label}>Verification Status</Text>
              <View style={styles.filterRow}>
                {(["all", "verified", "pending", "rejected"] as const).map((option) => {
                  const labels: Record<typeof option, string> = {
                    all: "All",
                    verified: "Verified",
                    pending: "Pending",
                    rejected: "Rejected",
                  };
                  const isActive = verificationFilter === option;
                  return (
                    <Pressable
                      key={option}
                      onPress={() => setVerificationFilter(option)}
                      style={[styles.chip, isActive && styles.chipActive]}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: isActive }}
                      accessibilityLabel={labels[option]}
                    >
                      <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                        {labels[option]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View>
              <Text style={styles.label}>On-Chain Status</Text>
              <View style={styles.filterRow}>
                {(["all", "registered", "unregistered"] as const).map((option) => {
                  const labels: Record<typeof option, string> = {
                    all: "All",
                    registered: "Registered",
                    unregistered: "Not Registered",
                  };
                  const isActive = onchainStatusFilter === option;
                  return (
                    <Pressable
                      key={option}
                      onPress={() => setOnchainStatusFilter(option)}
                      style={[styles.chip, isActive && styles.chipActive]}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: isActive }}
                      accessibilityLabel={labels[option]}
                    >
                      <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                        {labels[option]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {error ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{error}</Text>
                <Pressable onPress={handleRefresh} style={styles.retryButton}>
                  <Text style={styles.retryText}>Retry</Text>
                </Pressable>
              </View>
            ) : null}

            {loading ? (
              <View style={styles.skeletons}>
                {Array.from({ length: 4 }).map((_, i) => (
                  <SkeletonCard key={i} />
                ))}
              </View>
            ) : null}

            <Pressable
              onPress={() => navigation.navigate("PublishResource")}
              style={styles.publishButton}
              accessibilityRole="button"
              accessibilityLabel="Publish a link"
            >
              <Text style={styles.publishButtonText}>Publish a link</Text>
            </Pressable>

            <Pressable onPress={handleLogout} style={styles.logoutButton}>
              <Text style={styles.logoutButtonText}>Logout</Text>
            </Pressable>
          </View>
        }
        renderItem={({ item }) => (
          <View>
            <ResourceCard
              resource={item}
              onCopyUrl={toast.info}
              editablePrice={true}
              onPriceUpdated={handlePriceUpdated}
              onTransferOwnership={handleOpenTransfer}
              onRegister={handleOpenRegister}
              onDelist={handleOpenDelist}
            />
            <Pressable
              onPress={() =>
                navigation.navigate("PublisherResourceDetail", { resourceId: item.id })
              }
              style={styles.manageButton}
              accessibilityRole="button"
              accessibilityLabel={`Manage ${item.title}`}
              accessibilityHint="Opens stats, on-chain info and actions for this resource"
            >
              <Text style={styles.manageButtonText}>Manage resource ›</Text>
            </Pressable>
          </View>
        )}
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


      {transferResource ? (
        <TransferOwnershipModal
          resource={transferResource}
          visible={true}
          onClose={() => setTransferResource(null)}
          onSuccess={handleTransferSuccess}
        />
      ) : null}

      {registerResource ? (
        <RegisterModal
          resource={registerResource}
          visible={true}
          onClose={() => setRegisterResource(null)}
          onSuccess={handleRegisterSuccess}
          onError={handleRegisterError}
        />
      ) : null}

      <Modal
        visible={delistTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={handleCloseDelist}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard} testID="delist-modal">
            <Text style={typography.title}>Delist resource?</Text>
            <Text style={[typography.body, styles.modalBody]}>
              {delistTarget?.title} will no longer be listed in the public catalog.
            </Text>

            {delistError ? (
              <Text style={styles.errorText} accessibilityRole="alert">
                {delistError}
              </Text>
            ) : null}

            <View style={styles.modalActions}>
              <Pressable
                onPress={handleCloseDelist}
                disabled={delisting}
                style={[shared.button, styles.modalCancelButton]}
                accessibilityRole="button"
                accessibilityLabel="Cancel delist"
                accessibilityState={{ disabled: delisting }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => void handleConfirmDelist()}
                disabled={delisting}
                style={[
                  shared.button,
                  styles.modalConfirmButton,
                  delisting ? styles.disabledButton : null,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Confirm delist"
                accessibilityHint="Removes this resource from the public catalog"
                accessibilityState={{ disabled: delisting, busy: delisting }}
              >
                {delisting ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={shared.buttonText}>Delist</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );

  if (checkingStoredKey) return renderStoredKeyLoading();

  return authenticated ? renderResourcesList() : renderAuthForm();
}

// Styles are now generated dynamically in the component using useMemo to capture theme colors.
