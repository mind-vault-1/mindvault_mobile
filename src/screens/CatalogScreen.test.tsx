import React from "react";
import { fireEvent, render, waitFor, act } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { CatalogScreen } from "./CatalogScreen";
import { fetchCatalog, fetchRegistryStatus, getApiBaseUrl } from "../api/resources";
import {
  clearRecentResources,
  getRecentResources,
  recordRecentResource,
} from "../services/recent";
import { ThemeProvider } from "../theme/ThemeProvider";
import { ToastProvider } from "../components/ToastProvider";

jest.mock("../api/resources");
jest.mock("../components/HomeSections", () => {
  const RN = jest.requireActual("react-native");
  const sections = [
    { title: "Newest", sort: "newest" },
    { title: "Cheapest", sort: "price_asc" },
    { title: "Verified", sort: undefined },
  ];
  return {
    HomeSections: ({ onSeeAll }: any) => (
      <RN.View>
        {sections.map((section) => (
          <RN.View key={section.title}>
            <RN.Text>{`Home section: ${section.title}`}</RN.Text>
            <RN.Pressable
              accessibilityLabel={`See all ${section.title.toLowerCase()} resources`}
              onPress={() => onSeeAll?.(section.sort)}
            >
              <RN.Text>{`See all ${section.title}`}</RN.Text>
            </RN.Pressable>
          </RN.View>
        ))}
      </RN.View>
    ),
  };
});
jest.mock("../services/recent", () => ({
  getRecentResources: jest.fn(),
  recordRecentResource: jest.fn(),
  clearRecentResources: jest.fn(),
}));
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
const mockedGetRecentResources = getRecentResources as jest.Mock;
const mockedRecordRecentResource = recordRecentResource as jest.Mock;
const mockedClearRecentResources = clearRecentResources as jest.Mock;

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
  mockedFetchCatalog.mockResolvedValue({ items: [], total: 0, nextOffset: null });
  mockedFetchRegistryStatus.mockResolvedValue({ resourceCount: 0 });
  mockedGetApiBaseUrl.mockReturnValue("http://localhost:4000");
  mockedGetItem.mockResolvedValue(null);
  mockedGetRecentResources.mockResolvedValue([]);
  mockedRecordRecentResource.mockResolvedValue([]);
  mockedClearRecentResources.mockResolvedValue(undefined);
});

afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
});

describe("CatalogScreen search debounce", () => {
  it("renders every supported sort chip", async () => {
    const screen = renderCatalog();
    await waitFor(() => expect(mockedFetchCatalog).toHaveBeenCalled());
    for (const label of ["Newest", "Price: Low to high", "Price: High to low", "Title"]) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
  });

  it("sends sorting and price bounds to the server without filtering its response locally", async () => {
    mockedFetchCatalog.mockResolvedValue([makeResource("r1", "Server result")]);
    const screen = renderCatalog();
    await waitFor(() => expect(mockedFetchCatalog).toHaveBeenCalledTimes(1));

    fireEvent.press(screen.getByLabelText("Price: High to low"));
    fireEvent.changeText(screen.getByLabelText("Minimum price"), "5");

    await waitFor(() =>
      expect(mockedFetchCatalog).toHaveBeenLastCalledWith({ sort: "price_desc", minPrice: "5" })
    );
    expect(screen.getByText("Server result")).toBeTruthy();
  });

  it("does not refetch on every keystroke, only after typing pauses", async () => {
    const { getByLabelText } = render(
      <ThemeProvider>
        <ToastProvider>
          <CatalogScreen navigation={navigation} />
        </ToastProvider>
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

  it("waits for a pause before refetching when price bounds are typed", async () => {
    const screen = renderCatalog();
    await waitFor(() => expect(mockedFetchCatalog).toHaveBeenCalledTimes(1));
    mockedFetchCatalog.mockClear();

    const input = screen.getByLabelText("Maximum price");
    for (const value of ["1", "12", "12.", "12.5", "12.50"]) {
      fireEvent.changeText(input, value);
    }

    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(mockedFetchCatalog).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(200);
    });
    await waitFor(() => expect(mockedFetchCatalog).toHaveBeenCalledTimes(1));
    expect(mockedFetchCatalog).toHaveBeenCalledWith({ maxPrice: "12.5" });
  });
});

function renderCatalog() {
  return render(
    <ThemeProvider>
      <ToastProvider>
        <CatalogScreen navigation={navigation} />
      </ToastProvider>
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

describe("CatalogScreen infinite scroll pagination", () => {
  it("appends the next page de-duplicated by id and updates 'Showing X of Y'", async () => {
    const page1 = [makeResource("r1", "Resource 1"), makeResource("r2", "Resource 2")];
    const page2 = [makeResource("r2", "Resource 2 Duplicate"), makeResource("r3", "Resource 3")];

    mockedFetchCatalog
      .mockResolvedValueOnce({ items: page1, total: 3, nextOffset: 2 })
      .mockResolvedValueOnce({ items: page2, total: 3, nextOffset: null });

    const screen = renderCatalog();

    await waitFor(() => expect(screen.getByText("Resource 1")).toBeTruthy());
    expect(screen.getByText("Resource 2")).toBeTruthy();
    expect(screen.getByText("Showing 2 of 3 resources")).toBeTruthy();

    // Trigger onEndReached
    const flatList = screen.UNSAFE_getByType(require("react-native").FlatList);
    await act(async () => {
      flatList.props.onEndReached();
    });

    await waitFor(() => expect(screen.getByText("Resource 3")).toBeTruthy());
    expect(mockedFetchCatalog).toHaveBeenCalledWith({ offset: 2 });
    expect(screen.getByText("Showing 3 of 3 resources")).toBeTruthy();

    // Subsequent onEndReached does nothing because nextOffset is null
    mockedFetchCatalog.mockClear();
    await act(async () => {
      flatList.props.onEndReached();
    });
    expect(mockedFetchCatalog).not.toHaveBeenCalled();
  });

  it("shows an inline retry when next-page load fails and retains loaded items", async () => {
    const page1 = [makeResource("r1", "Resource 1")];
    mockedFetchCatalog
      .mockResolvedValueOnce({ items: page1, total: 2, nextOffset: 1 })
      .mockRejectedValueOnce(new Error("Network connection lost"));

    const screen = renderCatalog();

    await waitFor(() => expect(screen.getByText("Resource 1")).toBeTruthy());

    const flatList = screen.UNSAFE_getByType(require("react-native").FlatList);
    await act(async () => {
      flatList.props.onEndReached();
    });

    // Error is displayed inline with retry button, and initial item is still present
    await waitFor(() => expect(screen.getByText("Network connection lost")).toBeTruthy());
    expect(screen.getByText("Resource 1")).toBeTruthy();
    const retryButton = screen.getByLabelText("Retry loading more resources");
    expect(retryButton).toBeTruthy();

    // Successful retry
    mockedFetchCatalog.mockResolvedValueOnce({
      items: [makeResource("r2", "Resource 2")],
      total: 2,
      nextOffset: null,
    });

    fireEvent.press(retryButton);

    await waitFor(() => expect(screen.getByText("Resource 2")).toBeTruthy());
    expect(screen.queryByText("Network connection lost")).toBeNull();
    expect(screen.getByText("Showing 2 of 2 resources")).toBeTruthy();
  });

  it("resets to page 1 when changing filters or searching", async () => {
    mockedFetchCatalog
      .mockResolvedValueOnce({
        items: [makeResource("r1", "Item 1"), makeResource("r2", "Item 2")],
        total: 10,
        nextOffset: 2,
      })
      .mockResolvedValueOnce({
        items: [makeResource("r3", "Searched Item")],
        total: 1,
        nextOffset: null,
      });

    const screen = renderCatalog();
    await waitFor(() => expect(screen.getByText("Item 1")).toBeTruthy());

    // Search input change resets to page 1
    const searchInput = screen.getByLabelText("Search resources");
    fireEvent.changeText(searchInput, "search term");

    act(() => {
      jest.advanceTimersByTime(350);
    });

    await waitFor(() => expect(screen.getByText("Searched Item")).toBeTruthy());
    expect(screen.queryByText("Item 1")).toBeNull();
    expect(screen.getByText("Showing 1 of 1 resource")).toBeTruthy();
  });

  it("drops a next page that arrives after the filters changed", async () => {
    let resolveStalePage: (value: unknown) => void = () => {};
    mockedFetchCatalog
      .mockResolvedValueOnce({
        items: [makeResource("r1", "Item 1")],
        total: 10,
        nextOffset: 1,
      })
      .mockReturnValueOnce(new Promise((resolve) => (resolveStalePage = resolve)))
      .mockResolvedValueOnce({
        items: [makeResource("r9", "Searched Item")],
        total: 1,
        nextOffset: null,
      });

    const screen = renderCatalog();
    await waitFor(() => expect(screen.getByText("Item 1")).toBeTruthy());

    // Start loading page 2, then search before it arrives.
    const flatList = screen.UNSAFE_getByType(require("react-native").FlatList);
    await act(async () => {
      flatList.props.onEndReached();
    });
    fireEvent.changeText(screen.getByLabelText("Search resources"), "search term");
    act(() => {
      jest.advanceTimersByTime(350);
    });
    await waitFor(() => expect(screen.getByText("Searched Item")).toBeTruthy());

    await act(async () => {
      resolveStalePage({ items: [makeResource("r2", "Stale Page Item")], total: 10, nextOffset: 2 });
    });

    expect(screen.queryByText("Stale Page Item")).toBeNull();
    expect(screen.getByText("Showing 1 of 1 resource")).toBeTruthy();
  });
});

describe("CatalogScreen recently viewed", () => {
  it("records a view and opens the detail when a catalog resource is tapped", async () => {
    mockedFetchCatalog.mockResolvedValue([makeResource("r9", "Vault item")]);
    mockedRecordRecentResource.mockResolvedValue([
      { id: "r9", title: "Vault item", price: "1.00" },
    ]);

    const screen = renderCatalog();
    await waitFor(() => expect(screen.getByLabelText("Open Vault item")).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getByLabelText("Open Vault item"));
    });

    expect(mockedRecordRecentResource).toHaveBeenCalledWith({
      id: "r9",
      title: "Vault item",
      price: "1.00",
    });
    expect(navigation.navigate).toHaveBeenCalledWith("ResourceDetail", {
      resourceId: "r9",
    });
    expect(screen.getByText("Recently viewed")).toBeTruthy();
  });

  it("opens the detail of a recently viewed resource", async () => {
    mockedGetRecentResources.mockResolvedValue([
      { id: "r7", title: "Seen earlier", price: "2.00" },
    ]);

    const screen = renderCatalog();
    await waitFor(() =>
      expect(screen.getByLabelText("Open recently viewed Seen earlier")).toBeTruthy(),
    );

    await act(async () => {
      fireEvent.press(screen.getByLabelText("Open recently viewed Seen earlier"));
    });

    expect(navigation.navigate).toHaveBeenCalledWith("ResourceDetail", {
      resourceId: "r7",
    });
  });

  it("hides the row while searching", async () => {
    mockedGetRecentResources.mockResolvedValue([
      { id: "r7", title: "Seen earlier", price: "2.00" },
    ]);

    const screen = renderCatalog();
    await waitFor(() => expect(screen.getByText("Recently viewed")).toBeTruthy());

    fireEvent.changeText(screen.getByLabelText("Search resources"), "vault");

    expect(screen.queryByText("Recently viewed")).toBeNull();
  });

  it("hides the row when nothing has been viewed", async () => {
    const screen = renderCatalog();

    await waitFor(() => expect(mockedFetchCatalog).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("Recently viewed")).toBeNull();
  });

  it("clears the row", async () => {
    mockedGetRecentResources.mockResolvedValue([
      { id: "r7", title: "Seen earlier", price: "2.00" },
    ]);

    const screen = renderCatalog();
    await waitFor(() => expect(screen.getByText("Recently viewed")).toBeTruthy());

    fireEvent.press(screen.getByLabelText("Clear recently viewed"));

    expect(mockedClearRecentResources).toHaveBeenCalled();
    expect(screen.queryByText("Recently viewed")).toBeNull();
  });
});

describe("CatalogScreen HomeSections", () => {
  it("renders HomeSections when no filters are active", async () => {
    const screen = renderCatalog();
    await waitFor(() => expect(screen.getByText("Home section: Newest")).toBeTruthy());
    expect(screen.getByText("Home section: Cheapest")).toBeTruthy();
    expect(screen.getByText("Home section: Verified")).toBeTruthy();
  });

  it("hides HomeSections when searching", async () => {
    const resources = [makeResource("r1", "Test Resource")];
    mockedFetchCatalog.mockResolvedValue({ items: resources, total: 1, nextOffset: null });

    const screen = renderCatalog();
    await waitFor(() => expect(screen.getByText("Test Resource")).toBeTruthy());
    expect(screen.getByText("Home section: Newest")).toBeTruthy();

    fireEvent.changeText(screen.getByLabelText("Search resources"), "search");

    expect(screen.queryByText("Home section: Newest")).toBeNull();
    expect(screen.queryByText("Home section: Cheapest")).toBeNull();
    expect(screen.queryByText("Home section: Verified")).toBeNull();
  });

  it("hides HomeSections when filter is active", async () => {
    const resources = [makeResource("r1", "Test Resource")];
    mockedFetchCatalog.mockResolvedValue({ items: resources, total: 1, nextOffset: null });

    const screen = renderCatalog();
    await waitFor(() => expect(screen.getByText("Test Resource")).toBeTruthy());
    expect(screen.getByText("Home section: Newest")).toBeTruthy();

    fireEvent.press(screen.getByLabelText("Verified"));

    expect(screen.queryByText("Home section: Newest")).toBeNull();
    expect(screen.queryByText("Home section: Cheapest")).toBeNull();
    expect(screen.queryByText("Home section: Verified")).toBeNull();
  });

  it("applies sort when 'See all' is pressed for a section", async () => {
    const resources = [makeResource("new-1", "Newest Resource")];
    mockedFetchCatalog.mockResolvedValue({ items: resources, total: 10, nextOffset: null });

    const screen = renderCatalog();
    await waitFor(() => expect(screen.getByText("Newest Resource")).toBeTruthy());

    fireEvent.press(screen.getByLabelText("See all cheapest resources"));

    await waitFor(() => {
      expect(mockedFetchCatalog).toHaveBeenCalledWith(
        expect.objectContaining({ sort: "price_asc" })
      );
    });
  });
});

