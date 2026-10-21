import React from "react";
import { Linking } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { render, waitFor } from "@testing-library/react-native";

import { createLinkingOptions } from "./linking";
import { RootNavigator } from "./navigation";

// Screens are stubbed so the test exercises routing, not network or storage.
// The navigator and linking config are the real ones.
jest.mock("./screens/CatalogScreen", () => {
  const { Text } = require("react-native");
  return { CatalogScreen: () => <Text>catalog-screen</Text> };
});
jest.mock("./screens/ResourceDetailScreen", () => {
  const { Text } = require("react-native");
  return {
    ResourceDetailScreen: ({ route }: any) => (
      <Text>detail-screen:{route.params.resourceId}</Text>
    ),
  };
});
for (const name of [
  "ScannerScreen",
  "SettingsScreen",
  "DevSignerScreen",
  "PublisherResourcesScreen",
  "PublisherProfileScreen",
  "PublisherAnalyticsScreen",
  "PurchaseHistoryScreen",
]) {
  jest.doMock(`./screens/${name}`, () => ({ [name]: () => null }));
}

const API_HOST = "https://api.mindvault.app";

function renderAppAt(initialUrl: string | null) {
  jest.spyOn(Linking, "getInitialURL").mockResolvedValue(initialUrl);
  return render(
    <NavigationContainer linking={createLinkingOptions(API_HOST)}>
      <RootNavigator />
    </NavigationContainer>
  );
}

afterEach(() => jest.restoreAllMocks());

describe("navigation with deep links", () => {
  it("opens the catalog when there is no link", async () => {
    const screen = renderAppAt(null);
    await waitFor(() => expect(screen.getByText("catalog-screen")).toBeTruthy());
    expect(screen.queryByText(/detail-screen/)).toBeNull();
  });

  it("opens the detail screen for a custom-scheme link", async () => {
    const screen = renderAppAt("mindvault://resources/abc123");
    await waitFor(() => expect(screen.getByText("detail-screen:abc123")).toBeTruthy());
  });

  it("opens the detail screen for an HTTPS link on the API host", async () => {
    const screen = renderAppAt(`${API_HOST}/resources/xyz789`);
    await waitFor(() => expect(screen.getByText("detail-screen:xyz789")).toBeTruthy());
  });

  it.each([
    ["an unknown custom-scheme path", "mindvault://nothing/here"],
    ["a resources link with no id", "mindvault://resources/"],
    ["an unknown path on the API host", `${API_HOST}/pricing`],
  ])("falls back to the catalog for %s", async (_label, url) => {
    const screen = renderAppAt(url);
    await waitFor(() => expect(screen.getByText("catalog-screen")).toBeTruthy());
    expect(screen.queryByText(/detail-screen/)).toBeNull();
  });
});
