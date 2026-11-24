import React from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render } from "@testing-library/react-native";

import { fetchResource, ResourceFetchError } from "../api/resources";
import { createTestQueryClient } from "../hooks/queries";
import { getFavoriteIds, loadFavorites, toggleFavorite } from "../services/favorites";
import { ThemeProvider } from "../theme/ThemeProvider";
import type { Resource } from "../types";
import { FavoritesScreen } from "./FavoritesScreen";

// Keep the real ResourceFetchError so the screen can tell a deletion (404)
// apart from a temporary failure, but stub the request itself.
jest.mock("../api/resources", () => ({
  ...jest.requireActual("../api/resources"),
  fetchResource: jest.fn(),
}));
jest.mock("../services/favorites", () => ({
  loadFavorites: jest.fn(),
  getFavoriteIds: jest.fn(),
  toggleFavorite: jest.fn(),
  useFavorite: () => ({ isFavorite: false, toggle: jest.fn() }),
}));
jest.mock("../components/ToastProvider", () => ({ useToast: () => ({ info: jest.fn() }) }));
// The skeleton's looping animation keeps scheduling frames, which slows the
// tests down without adding anything here.
jest.mock("../components/SkeletonCard", () => ({ SkeletonCard: () => null }));
jest.mock("react-native-safe-area-context", () => require("../test-utils").safeAreaMock());
jest.mock("@react-navigation/native", () => ({
  ...jest.requireActual("@react-navigation/native"),
  // The screen reloads on focus; run the effect once on mount instead.
  useFocusEffect: (effect: () => void) => require("react").useEffect(effect, [effect]),
}));

const mockedFetchResource = fetchResource as jest.MockedFunction<typeof fetchResource>;
const mockedGetFavoriteIds = getFavoriteIds as jest.MockedFunction<typeof getFavoriteIds>;
const mockedToggleFavorite = toggleFavorite as jest.MockedFunction<typeof toggleFavorite>;

const navigate = jest.fn();
const navigation = { navigate } as any;

function makeResource(id: string, title: string): Resource {
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

function renderScreen(client = createTestQueryClient()) {
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <FavoritesScreen navigation={navigation} />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  (loadFavorites as jest.Mock).mockResolvedValue(undefined);
  mockedToggleFavorite.mockResolvedValue(true);
});

it("shows the latest metadata for every saved resource", async () => {
  mockedGetFavoriteIds.mockReturnValue(["r1", "r2"]);
  mockedFetchResource.mockImplementation(async (id) => makeResource(id, `Title ${id}`));

  const screen = renderScreen();

  expect(await screen.findByText("Title r1")).toBeTruthy();
  expect(screen.getByText("Title r2")).toBeTruthy();
  expect(mockedFetchResource).toHaveBeenCalledWith("r1");
  expect(mockedFetchResource).toHaveBeenCalledWith("r2");
});

it("drops and forgets a resource the server reports as deleted", async () => {
  mockedGetFavoriteIds.mockReturnValue(["kept", "gone"]);
  mockedFetchResource.mockImplementation(async (id) => {
    if (id === "gone") throw new ResourceFetchError("Resource not found.", false);
    return makeResource(id, "Kept title");
  });

  const screen = renderScreen();

  expect(await screen.findByText("Kept title")).toBeTruthy();
  expect(mockedToggleFavorite).toHaveBeenCalledWith("gone");
  expect(mockedToggleFavorite).not.toHaveBeenCalledWith("kept");
});

it("keeps a favourite when the metadata request fails temporarily", async () => {
  mockedGetFavoriteIds.mockReturnValue(["r1"]);
  mockedFetchResource.mockRejectedValue(new ResourceFetchError("Network error.", true));

  const screen = renderScreen();

  expect(
    await screen.findByText("Couldn't refresh this favourite. Pull down to try again.")
  ).toBeTruthy();
  expect(mockedToggleFavorite).not.toHaveBeenCalled();
});

it("offers a way into the catalog when nothing has been saved", async () => {
  mockedGetFavoriteIds.mockReturnValue([]);

  const screen = renderScreen();

  expect(await screen.findByText("No saved favourites")).toBeTruthy();
  fireEvent.press(screen.getByText("Browse catalog"));
  expect(navigate).toHaveBeenCalledWith("Catalog");
});

it("serves cached metadata on a later visit without refetching fresh data", async () => {
  mockedGetFavoriteIds.mockReturnValue(["r1"]);
  mockedFetchResource.mockImplementation(async (id) => makeResource(id, `Title ${id}`));
  const client = createTestQueryClient();
  client.setDefaultOptions({ queries: { retry: false, staleTime: 60_000 } });

  const first = renderScreen(client);
  expect(await first.findByText("Title r1")).toBeTruthy();
  first.unmount();

  const second = renderScreen(client);
  expect(await second.findByText("Title r1")).toBeTruthy();
  expect(mockedFetchResource).toHaveBeenCalledTimes(1);
});

it("refetches every favourite on pull-to-refresh", async () => {
  mockedGetFavoriteIds.mockReturnValue(["r1"]);
  mockedFetchResource.mockResolvedValueOnce(makeResource("r1", "Old title"));
  mockedFetchResource.mockResolvedValue(makeResource("r1", "New title"));

  const screen = renderScreen();
  expect(await screen.findByText("Old title")).toBeTruthy();

  const list = screen.UNSAFE_getByType(require("react-native").FlatList);
  await act(async () => {
    await list.props.refreshControl.props.onRefresh();
  });

  expect(await screen.findByText("New title")).toBeTruthy();
});
