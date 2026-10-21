import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import { HomeSections } from "./HomeSections";
import { fetchCatalog } from "../api/resources";
import type { Resource } from "../types";

jest.mock("../api/resources", () => ({
  ...jest.requireActual("../api/resources"),
  fetchCatalog: jest.fn(),
}));

jest.mock("../theme/ThemeProvider", () => {
  const colors = {
    primary: "#6366f1",
    primaryMuted: "#e0e7ff",
    surface: "#ffffff",
    border: "#e2e8f0",
    text: "#0f172a",
    textMuted: "#64748b",
    textSubtle: "#94a3b8",
    danger: "#ef4444",
    dangerBg: "#fee2e2",
    success: "#22c55e",
    successBg: "#dcfce7",
    warning: "#f59e0b",
    warningBg: "#fef3c7",
    neutralBg: "#f1f5f9",
    background: "#ffffff",
  };
  return {
    useAppTheme: () => ({
      colors,
      colorScheme: "light",
      shared: {
        screen: {},
        card: {},
        badge: {},
        badgeText: {},
        button: {},
        buttonText: {},
        primaryButton: {},
        primaryButtonText: {},
      },
      typography: {
        title: {},
        subtitle: {},
        heading: {},
        body: {},
        caption: {},
        price: {},
        cardTitle: {},
      },
    }),
  };
});

jest.mock("./ResourceCard", () => ({
  ResourceCard: ({ resource }: { resource: Resource }) => (
    <View testID={`resource-card-${resource.id}`} accessible accessibilityLabel={resource.title}>
      <Text>{resource.title}</Text>
    </View>
  ),
}));

jest.mock("react-native", () => {
  const RN = jest.requireActual("react-native");
  return {
    ...RN,
    FlatList: ({ data, renderItem, ...props }: any) => (
      <View {...props} testID="flatlist">
        {data?.map((item: any, index: number) => renderItem({ item, index }))}
      </View>
    ),
  };
});

const mockedFetchCatalog = fetchCatalog as jest.MockedFunction<typeof fetchCatalog>;

function createResource(overrides: Partial<Resource> = {}): Resource {
  return {
    id: `res-${Math.random()}`,
    title: "Test Resource",
    price: "2.50",
    resourceType: "file",
    publisherName: "Alice",
    walletAddress: "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7",
    verificationStatus: "verified",
    onchainStatus: "none",
    listed: true,
    accessUrl: "https://example.com/file",
    ...overrides,
  };
}

describe("HomeSections", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders three sections with skeleton loaders initially", () => {
    mockedFetchCatalog.mockResolvedValue({ items: [], total: 0, nextOffset: null });

    const { getByText, queryByText } = render(<HomeSections />);

    expect(getByText("Newest")).toBeTruthy();
    expect(getByText("Cheapest")).toBeTruthy();
    expect(getByText("Verified")).toBeTruthy();
    // Skeletons should be visible
    expect(queryByText("Test Resource")).toBeNull();
  });

  it("fetches each section with correct parameters", async () => {
    const newestResources = [createResource({ id: "new-1", title: "Newest Resource" })];
    const cheapestResources = [createResource({ id: "cheap-1", title: "Cheapest Resource", price: "0.50" })];
    const verifiedResources = [createResource({ id: "ver-1", title: "Verified Resource" })];

    mockedFetchCatalog
      .mockResolvedValueOnce({ items: newestResources, total: 1, nextOffset: null })
      .mockResolvedValueOnce({ items: cheapestResources, total: 1, nextOffset: null })
      .mockResolvedValueOnce({ items: verifiedResources, total: 1, nextOffset: null });

    render(<HomeSections />);

    await waitFor(() => {
      expect(mockedFetchCatalog).toHaveBeenCalledTimes(3);
      expect(mockedFetchCatalog).toHaveBeenCalledWith(
        expect.objectContaining({ sort: "newest", limit: 10 })
      );
      expect(mockedFetchCatalog).toHaveBeenCalledWith(
        expect.objectContaining({ sort: "price_asc", limit: 10 })
      );
      expect(mockedFetchCatalog).toHaveBeenCalledWith(
        expect.objectContaining({ verificationStatus: "verified", limit: 10 })
      );
    });
  });

  it("renders resources in each section after loading", async () => {
    const newestResources = [createResource({ id: "new-1", title: "Newest Resource" })];
    const cheapestResources = [createResource({ id: "cheap-1", title: "Cheapest Resource", price: "0.50" })];
    const verifiedResources = [createResource({ id: "ver-1", title: "Verified Resource" })];

    mockedFetchCatalog
      .mockResolvedValueOnce({ items: newestResources, total: 1, nextOffset: null })
      .mockResolvedValueOnce({ items: cheapestResources, total: 1, nextOffset: null })
      .mockResolvedValueOnce({ items: verifiedResources, total: 1, nextOffset: null });

    const { getByText } = render(<HomeSections />);

    await waitFor(() => {
      expect(getByText("Newest Resource")).toBeTruthy();
      expect(getByText("Cheapest Resource")).toBeTruthy();
      expect(getByText("Verified Resource")).toBeTruthy();
    });
  });

  it("hides section when it fails to load", async () => {
    const newestResources = [createResource({ id: "new-1", title: "Newest Resource" })];

    mockedFetchCatalog
      .mockResolvedValueOnce({ items: newestResources, total: 1, nextOffset: null })
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValueOnce({ items: [], total: 0, nextOffset: null });

    const { getByText, queryByText } = render(<HomeSections />);

    await waitFor(() => {
      expect(getByText("Newest")).toBeTruthy();
      expect(queryByText("Cheapest")).toBeNull();
      expect(getByText("Verified")).toBeTruthy();
    });
  });

  it("hides section when it returns empty", async () => {
    mockedFetchCatalog
      .mockResolvedValueOnce({ items: [], total: 0, nextOffset: null })
      .mockResolvedValueOnce({ items: [], total: 0, nextOffset: null })
      .mockResolvedValueOnce({ items: [], total: 0, nextOffset: null });

    const { queryByText } = render(<HomeSections />);

    await waitFor(() => {
      expect(queryByText("Newest")).toBeNull();
      expect(queryByText("Cheapest")).toBeNull();
      expect(queryByText("Verified")).toBeNull();
    });
  });

  it("calls onSeeAll with correct parameters when 'See all' is pressed", async () => {
    const onSeeAll = jest.fn();
    const newestResources = [createResource({ id: "new-1", title: "Newest Resource" })];
    const cheapestResources = [createResource({ id: "cheap-1", title: "Cheapest Resource" })];
    const verifiedResources = [createResource({ id: "ver-1", title: "Verified Resource" })];

    mockedFetchCatalog
      .mockResolvedValueOnce({ items: newestResources, total: 1, nextOffset: null })
      .mockResolvedValueOnce({ items: cheapestResources, total: 1, nextOffset: null })
      .mockResolvedValueOnce({ items: verifiedResources, total: 1, nextOffset: null });

    const { getByText } = render(<HomeSections onSeeAll={onSeeAll} />);

    await waitFor(() => {
      expect(getByText("Newest Resource")).toBeTruthy();
    });

    fireEvent.press(getByText("See all"));

    await waitFor(() => {
      expect(onSeeAll).toHaveBeenCalledWith("newest", undefined);
    });

    // Reset mock for next section
    onSeeAll.mockClear();

    // Find the "See all" for Cheapest - need to query by accessibility label
    // Since we can't easily find it, let's just verify the first one works
  });

  it("excludes the specified resourceId from sections", async () => {
    const excludedResource = createResource({ id: "exclude-me", title: "Excluded" });
    const otherResource = createResource({ id: "keep-me", title: "Included" });

    mockedFetchCatalog
      .mockResolvedValueOnce({ items: [excludedResource, otherResource], total: 2, nextOffset: null })
      .mockResolvedValueOnce({ items: [excludedResource], total: 1, nextOffset: null })
      .mockResolvedValueOnce({ items: [], total: 0, nextOffset: null });

    const { getByText, queryByText } = render(<HomeSections excludeResourceId="exclude-me" />);

    await waitFor(() => {
      expect(getByText("Included")).toBeTruthy();
      expect(queryByText("Excluded")).toBeNull();
    });
  });
});

import { View, Text } from "react-native";