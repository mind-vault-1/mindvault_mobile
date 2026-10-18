import React from "react";
import { fireEvent, render, waitFor, act } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { CatalogScreen } from "./CatalogScreen";
import { fetchCatalog, fetchRegistryStatus, getApiBaseUrl } from "../api/resources";
import { ThemeProvider } from "../theme/ThemeProvider";

jest.mock("../api/resources");
// The skeleton's looping animation keeps scheduling frames under fake timers,
// which slows waitFor down enough to time out on CI. These tests only check
// data flow, so render it as nothing.
jest.mock("../components/SkeletonCard", () => ({ SkeletonCard: () => null }));
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: any) => children,
  SafeAreaProvider: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockedFetchCatalog = fetchCatalog as jest.Mock;
const mockedFetchRegistryStatus = fetchRegistryStatus as jest.Mock;
const mockedGetApiBaseUrl = getApiBaseUrl as jest.Mock;
const mockedGetItem = AsyncStorage.getItem as jest.Mock;

const navigation = { navigate: jest.fn() } as any;

function makeResource(id: string, title: string) {
  return {
    id,
    title,
    price: "1.00",
    resourceType: "file",
    walletAddress: "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7",
    verificationStatus: "verified",
    onchainStatus: "registered",
    listed: true,
    accessUrl: `https://example.com/${id}`,
  };
}

beforeEach(() => {
  jest.useFakeTimers();
  mockedFetchCatalog.mockResolvedValue([]);
  mockedFetchRegistryStatus.mockResolvedValue({ resourceCount: 0 });
  mockedGetApiBaseUrl.mockReturnValue("http://localhost:4000");
  mockedGetItem.mockResolvedValue(null);
});

afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
});

describe("CatalogScreen search debounce", () => {
  it("does not refetch on every keystroke, only after typing pauses", async () => {
    const { getByLabelText } = render(
      <ThemeProvider>
        <CatalogScreen navigation={navigation} />
      </ThemeProvider>
    );


    await waitFor(() => expect(mockedFetchCatalog).toHaveBeenCalledTimes(1));
    mockedFetchCatalog.mockClear();

    const input = getByLabelText("Search resources");

    fireEvent.changeText(input, "s");
    fireEvent.changeText(input, "st");
    fireEvent.changeText(input, "ste");
    fireEvent.changeText(input, "stel");
    fireEvent.changeText(input, "stell");
    fireEvent.changeText(input, "stella");

    // Still within the debounce window — no fetch yet.
    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(mockedFetchCatalog).not.toHaveBeenCalled();

    // Past the debounce window — exactly one fetch, with the final value.
    act(() => {
      jest.advanceTimersByTime(200);
    });
    await waitFor(() => expect(mockedFetchCatalog).toHaveBeenCalledTimes(1));
    expect(mockedFetchCatalog).toHaveBeenCalledWith(
      expect.objectContaining({ search: "stella" }),
    );
  });
});

function renderCatalog() {
  return render(
    <ThemeProvider>
      <CatalogScreen navigation={navigation} />
    </ThemeProvider>
  );
}

describe("CatalogScreen stale responses", () => {
  it("only applies the latest response, even when an older request resolves last", async () => {
    let resolveFirst!: (value: any[]) => void;
    mockedFetchCatalog
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce([makeResource("r2", "Fast")]);

    const { getByText, queryByText } = renderCatalog();

    // The initial load is stuck on a slow request.
    await waitFor(() => expect(mockedFetchCatalog).toHaveBeenCalledTimes(1));

    // A filter change kicks off a second request that resolves first.
    fireEvent.press(getByText("Verified"));
    await waitFor(() => expect(mockedFetchCatalog).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(getByText("Fast")).toBeTruthy());

    // The slow, superseded response arrives afterwards — it must not
    // overwrite the newer data.
    await act(async () => {
      resolveFirst([makeResource("r1", "Slow")]);
    });

    expect(queryByText("Slow")).toBeNull();
    expect(getByText("Fast")).toBeTruthy();
  });

  it("does not surface an error from a superseded request", async () => {
    let rejectFirst!: (err: Error) => void;
    mockedFetchCatalog
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectFirst = reject;
          }),
      )
      .mockResolvedValueOnce([makeResource("r2", "Fast")]);

    const { getByText, queryByText } = renderCatalog();

    await waitFor(() => expect(mockedFetchCatalog).toHaveBeenCalledTimes(1));

    fireEvent.press(getByText("Verified"));
    await waitFor(() => expect(mockedFetchCatalog).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(getByText("Fast")).toBeTruthy());

    await act(async () => {
      rejectFirst(new Error("slow failure"));
    });

    expect(queryByText("slow failure")).toBeNull();
  });
});

describe("CatalogScreen parallel loading", () => {
  it("starts the registry request alongside the catalog request", async () => {
    // Never settles: the catalog request must not wait for the registry.
    mockedFetchRegistryStatus.mockReturnValue(new Promise(() => {}));

    renderCatalog();

    await waitFor(() => expect(mockedFetchCatalog).toHaveBeenCalledTimes(1));
    expect(mockedFetchRegistryStatus).toHaveBeenCalledTimes(1);
  });

  it("still shows the catalog when the registry request fails", async () => {
    mockedFetchRegistryStatus.mockRejectedValue(new Error("registry down"));
    mockedFetchCatalog.mockResolvedValue([makeResource("r1", "Vault item")]);

    const { getByText } = renderCatalog();

    await waitFor(() => expect(getByText("Vault item")).toBeTruthy());
    expect(getByText("On-chain count unavailable")).toBeTruthy();
  });
});

describe("CatalogScreen saved filter validation", () => {
  it("falls back to defaults when the saved filters are not valid JSON", async () => {
    mockedGetItem.mockResolvedValue("{definitely-not-json");

    const { getByLabelText } = renderCatalog();

    await waitFor(() => expect(mockedFetchCatalog).toHaveBeenCalledTimes(1));
    expect(mockedFetchCatalog).toHaveBeenCalledWith(undefined);
    expect(getByLabelText("Search resources").props.value).toBe("");
  });

  it("falls back per field when saved filter values are invalid", async () => {
    mockedGetItem.mockResolvedValue(
      JSON.stringify({
        search: "stellar",
        verification: "bogus",
        resourceType: 42,
        minPrice: { min: 1 },
        maxPrice: null,
      }),
    );

    const { getByLabelText } = renderCatalog();

    // Only the valid `search` field survives validation and is sent as a filter.
    await waitFor(() =>
      expect(mockedFetchCatalog).toHaveBeenCalledWith({ search: "stellar" }),
    );
    expect(getByLabelText("Search resources").props.value).toBe("stellar");
  });
});