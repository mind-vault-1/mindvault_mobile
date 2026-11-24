import NetInfo from "@react-native-community/netinfo";
import { onlineManager, QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import React from "react";

import { ApiError } from "../api/client";
import {
  fetchCatalog,
  fetchRegistryStatus,
  fetchResource,
  ResourceFetchError,
} from "../api/resources";
import { fetchVerification } from "../api/verification";
import {
  configureQueryEnvironment,
  createQueryClient,
  createTestQueryClient,
  isTransientQueryError,
  queryKeys,
  resetQueryEnvironmentForTests,
  shouldRetryQuery,
  useCatalogQuery,
  useRegistryMetaQuery,
  useResourceDetailQuery,
  useVerificationQuery,
} from "./queries";

jest.mock("../api/resources", () => ({
  ...jest.requireActual("../api/resources"),
  fetchCatalog: jest.fn(),
  fetchResource: jest.fn(),
  fetchRegistryStatus: jest.fn(),
}));
jest.mock("../api/verification", () => ({ fetchVerification: jest.fn() }));

const mockedCatalog = fetchCatalog as jest.Mock;
const mockedResource = fetchResource as jest.Mock;
const mockedRegistry = fetchRegistryStatus as jest.Mock;
const mockedVerification = fetchVerification as jest.Mock;
const mockedAddNetInfoListener = NetInfo.addEventListener as jest.Mock;

let client: QueryClient;

function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  jest.clearAllMocks();
  client = createTestQueryClient();
});

afterEach(() => {
  client.clear();
  onlineManager.setOnline(true);
});

describe("query hooks", () => {
  it("loads the catalog under a key that includes the filters", async () => {
    const page = { items: [], total: 0, nextOffset: null };
    mockedCatalog.mockResolvedValue(page);
    const params = { search: "book", limit: 20 };

    const { result } = renderHook(() => useCatalogQuery(params), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(page);
    expect(mockedCatalog).toHaveBeenCalledWith(params, expect.any(AbortSignal));
    expect(client.getQueryData(queryKeys.catalog(params))).toEqual(page);
  });

  it("loads resource metadata and shares it between hooks", async () => {
    mockedResource.mockResolvedValue({ id: "r1", title: "Book" });

    const first = renderHook(() => useResourceDetailQuery("r1"), { wrapper });
    await waitFor(() => expect(first.result.current.data?.title).toBe("Book"));

    client.setDefaultOptions({ queries: { retry: false, staleTime: 60_000 } });
    const second = renderHook(() => useResourceDetailQuery("r1"), { wrapper });
    expect(second.result.current.data?.title).toBe("Book");
    expect(mockedResource).toHaveBeenCalledTimes(1);
  });

  it("does not fetch a disabled detail query", () => {
    renderHook(() => useResourceDetailQuery("r1", { enabled: false }), { wrapper });
    expect(mockedResource).not.toHaveBeenCalled();
  });

  it("loads registry metadata and verification details", async () => {
    mockedRegistry.mockResolvedValue({ count: 3 });
    mockedVerification.mockResolvedValue({ resourceId: "r1", status: "verified" });

    const meta = renderHook(() => useRegistryMetaQuery(), { wrapper });
    const verification = renderHook(() => useVerificationQuery("r1"), { wrapper });

    await waitFor(() => expect(meta.result.current.data).toEqual({ count: 3 }));
    await waitFor(() => expect(verification.result.current.data?.status).toBe("verified"));
    expect(mockedVerification).toHaveBeenCalledWith("r1");
  });

  it("nests verification under the resource so invalidating a resource refreshes both", () => {
    expect(queryKeys.verification("r1").slice(0, queryKeys.detail("r1").length)).toEqual(
      queryKeys.detail("r1")
    );
    expect(queryKeys.detail("r1")[0]).toBe("mindvault");
    expect(queryKeys.meta()[0]).toBe("mindvault");
  });

  it("exposes errors to the screen", async () => {
    mockedResource.mockRejectedValue(new ResourceFetchError("Resource not found.", false));
    const { result } = renderHook(() => useResourceDetailQuery("gone"), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("Resource not found.");
  });
});

describe("retry policy", () => {
  it.each([
    [new ResourceFetchError("Network error.", true), true],
    [new ResourceFetchError("Resource not found.", false), false],
    [new ApiError("network", "offline"), true],
    [new ApiError("timeout", "slow"), true],
    [new ApiError("aborted", "cancelled"), false],
    [new ApiError("http", "server", 503), true],
    [new ApiError("http", "missing", 404), false],
    [new Error("boom"), false],
  ])("treats %p as transient: %p", (error, transient) => {
    expect(isTransientQueryError(error)).toBe(transient);
  });

  it("retries transient failures a bounded number of times", () => {
    const transient = new ApiError("network", "offline");
    expect(shouldRetryQuery(0, transient)).toBe(true);
    expect(shouldRetryQuery(1, transient)).toBe(true);
    expect(shouldRetryQuery(2, transient)).toBe(false);
    expect(shouldRetryQuery(0, new ApiError("http", "missing", 404))).toBe(false);
  });

  it("configures the app client with caching, retries and offline pausing", () => {
    const appClient = createQueryClient();
    const defaults = appClient.getDefaultOptions().queries;
    expect(defaults?.staleTime).toBeGreaterThan(0);
    expect(defaults?.retry).toBe(shouldRetryQuery);
    expect(defaults?.networkMode).toBe("online");
    appClient.clear();
  });
});

describe("offline awareness", () => {
  beforeEach(() => resetQueryEnvironmentForTests());

  it("follows NetInfo through the online manager", () => {
    let listener: ((state: { isConnected: boolean | null }) => void) | undefined;
    mockedAddNetInfoListener.mockImplementation((cb) => {
      listener = cb;
      return jest.fn();
    });

    configureQueryEnvironment();
    // TanStack subscribes lazily; subscribing here triggers the NetInfo listener.
    const unsubscribe = onlineManager.subscribe(() => undefined);
    expect(listener).toBeDefined();

    act(() => listener?.({ isConnected: false }));
    expect(onlineManager.isOnline()).toBe(false);
    act(() => listener?.({ isConnected: null }));
    expect(onlineManager.isOnline()).toBe(true);
    act(() => listener?.({ isConnected: true }));
    expect(onlineManager.isOnline()).toBe(true);
    unsubscribe();
  });

  it("pauses queries while offline and resumes them on reconnect", async () => {
    mockedResource.mockResolvedValue({ id: "r1", title: "Book" });
    onlineManager.setOnline(false);

    const { result } = renderHook(() => useResourceDetailQuery("r1"), { wrapper });

    await waitFor(() => expect(result.current.fetchStatus).toBe("paused"));
    expect(result.current.isPending).toBe(true);
    expect(mockedResource).not.toHaveBeenCalled();

    act(() => onlineManager.setOnline(true));
    await waitFor(() => expect(result.current.data?.title).toBe("Book"));
    expect(mockedResource).toHaveBeenCalledTimes(1);
  });
});
