// App.tsx
import { NavigationContainer } from "@react-navigation/native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import {
  fetchCatalog,
  fetchRegistryStatus,
  initializeApiBaseUrl,
  setApiBaseUrl,
} from "./src/api/resources";
import { ResourceCard } from "./src/components/ResourceCard";
import { EmptyState } from "./src/components/EmptyState";
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

    if (resources.length > 0) {
      return (
        <EmptyState
          title="No matches"
          body="No resources match your search. Try a different term or clear the filter."
          actionLabel="Clear search"
          onAction={() => setSearch("")}
        />
      );
    }

    return (
      <EmptyState
        title="The catalog is empty"
        body="No resources have been published yet. Connect to a running MindVault server to browse the vault."
      />
    );
  }

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <NavigationContainer>
        <RootNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
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
