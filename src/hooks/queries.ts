/**
 * Shared server-state cache built on TanStack Query.
 *
 * Every screen used to fetch on mount and keep the result in local state, so
 * the same resource was requested again on each visit and two screens showing
 * it could disagree. Queries declared here share one cache (owned by
 * `AppQueryProvider` in App.tsx): a screen opened a second time renders the
 * cached data at once and refreshes it in the background when it is stale.
 *
 * Offline: the query client follows NetInfo through `onlineManager`. While the
 * device is offline, queries and retries pause instead of failing, and resume
 * when the connection comes back. Returning the app to the foreground counts
 * as a window focus, so stale queries refresh then too.
 *
 * ## Migrating a screen
 *
 * FavoritesScreen is the pilot. To move another screen over:
 *
 * 1. Add a key to `queryKeys` and a `…QueryOptions(…)` factory below that calls
 *    the existing `src/api` function. Keep the API function itself unchanged.
 * 2. In the screen, replace the `useState` + `useEffect(fetch…)` pair with the
 *    matching hook (`useCatalogQuery`, `useResourceDetailQuery`, …), or with
 *    `useQueries` for a list of ids, as FavoritesScreen does.
 * 3. Derive the UI from the query: `isPending` for the first load (skeletons),
 *    `data` for content, `error` for error banners, and `fetchStatus ===
 *    "paused"` for "waiting for a connection".
 * 4. Pull-to-refresh calls `refetch()` and shows `isRefetching`. On focus, call
 *    `queryClient.refetchQueries({ queryKey, stale: true })` rather than
 *    refetching unconditionally.
 * 5. After a mutation (price edit, delist, transfer), call
 *    `queryClient.invalidateQueries({ queryKey: queryKeys.detail(id) })` so
 *    every screen showing that resource refreshes.
 * 6. In tests, render inside `<QueryClientProvider client={createTestQueryClient()}>`
 *    (no retries, no cache shared between tests).
 */
import NetInfo from "@react-native-community/netinfo";
import {
  focusManager,
  onlineManager,
  QueryClient,
  QueryClientProvider,
  queryOptions,
  useQuery,
} from "@tanstack/react-query";
import { createElement, useEffect, useState, type ReactNode } from "react";
import { AppState, type AppStateStatus } from "react-native";

import { ApiError } from "../api/client";
import {
  fetchCatalog,
  fetchRegistryStatus,
  fetchResource,
  ResourceFetchError,
  type FetchCatalogParams,
} from "../api/resources";
import { fetchVerification } from "../api/verification";

/** How long fetched data counts as fresh before a background refresh. */
export const DEFAULT_STALE_TIME_MS = 30_000;
/** How long unused data stays in the cache. */
export const DEFAULT_GC_TIME_MS = 5 * 60_000;
const MAX_RETRIES = 2;

/**
 * Query keys. Every key starts with "mindvault" so the whole cache can be
 * cleared at once (for example after switching network or API URL).
 */
export const queryKeys = {
  all: ["mindvault"] as const,
  catalogs: () => [...queryKeys.all, "catalog"] as const,
  catalog: (params: FetchCatalogParams = {}) => [...queryKeys.catalogs(), params] as const,
  details: () => [...queryKeys.all, "resource"] as const,
  /** Public resource metadata (`GET /resources/:id/meta`), shown on detail screens and cards. */
  detail: (id: string) => [...queryKeys.details(), id] as const,
  /** Catalog-wide metadata: the on-chain registry status (`GET /registry/status`). */
  meta: () => [...queryKeys.all, "registry", "status"] as const,
  verification: (id: string) => [...queryKeys.detail(id), "verification"] as const,
};

/**
 * Retry only failures that may succeed later (network, timeout, 5xx). A 404 or
 * other client error is a definitive answer and is returned at once.
 */
export function isTransientQueryError(error: unknown): boolean {
  if (error instanceof ResourceFetchError) return error.isTransient;
  if (error instanceof ApiError) {
    if (error.kind === "network" || error.kind === "timeout") return true;
    if (error.kind === "aborted") return false;
    return (error.status ?? 0) >= 500;
  }
  return false;
}

export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  return failureCount < MAX_RETRIES && isTransientQueryError(error);
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: DEFAULT_STALE_TIME_MS,
        gcTime: DEFAULT_GC_TIME_MS,
        retry: shouldRetryQuery,
        // Pause (rather than fail) while offline; resume on reconnect.
        networkMode: "online",
        refetchOnReconnect: true,
        refetchOnWindowFocus: true,
      },
      mutations: { networkMode: "online" },
    },
  });
}

/** A client for tests: no retries and nothing shared between tests. */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

let environmentConfigured = false;

/**
 * Connects TanStack Query to React Native: NetInfo drives online/offline and
 * AppState drives focus. Safe to call more than once.
 */
export function configureQueryEnvironment(): void {
  if (environmentConfigured) return;
  environmentConfigured = true;

  onlineManager.setEventListener((setOnline) => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      // `isConnected` is null while unknown; only a definite false is offline.
      setOnline(state.isConnected !== false);
    });
    return unsubscribe;
  });

  focusManager.setEventListener((handleFocus) => {
    const subscription = AppState.addEventListener("change", (status: AppStateStatus) => {
      handleFocus(status === "active");
    });
    return () => subscription.remove();
  });
}

/** Test hook: lets each test start from an unconfigured environment. */
export function resetQueryEnvironmentForTests(): void {
  environmentConfigured = false;
}

interface AppQueryProviderProps {
  children: ReactNode;
  /** Defaults to a client created once for the lifetime of the provider. */
  client?: QueryClient;
}

/** Provides the shared query cache to the app. */
export function AppQueryProvider({ children, client }: AppQueryProviderProps) {
  const [ownClient] = useState(() => client ?? createQueryClient());
  useEffect(() => configureQueryEnvironment(), []);
  return createElement(QueryClientProvider, { client: client ?? ownClient }, children);
}

// ---------------------------------------------------------------------------
// Query options. Use these with useQuery/useQueries, prefetchQuery or
// ensureQueryData so every caller shares the same key and fetcher.
// ---------------------------------------------------------------------------

export function catalogQueryOptions(params: FetchCatalogParams = {}) {
  return queryOptions({
    queryKey: queryKeys.catalog(params),
    queryFn: ({ signal }) => fetchCatalog(params, signal),
  });
}

export function resourceDetailQueryOptions(id: string) {
  return queryOptions({
    queryKey: queryKeys.detail(id),
    queryFn: () => fetchResource(id),
  });
}

export function registryMetaQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.meta(),
    queryFn: () => fetchRegistryStatus(),
  });
}

export function verificationQueryOptions(id: string) {
  return queryOptions({
    queryKey: queryKeys.verification(id),
    queryFn: () => fetchVerification(id),
  });
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useCatalogQuery(params: FetchCatalogParams = {}) {
  return useQuery(catalogQueryOptions(params));
}

export function useResourceDetailQuery(id: string, options: { enabled?: boolean } = {}) {
  return useQuery({ ...resourceDetailQueryOptions(id), enabled: options.enabled ?? true });
}

export function useRegistryMetaQuery() {
  return useQuery(registryMetaQueryOptions());
}

export function useVerificationQuery(id: string, options: { enabled?: boolean } = {}) {
  return useQuery({ ...verificationQueryOptions(id), enabled: options.enabled ?? true });
}
