import React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";

import { PublisherPublicScreen } from "./PublisherPublicScreen";
import { fetchPublicPublisher } from "../api/publishers";
import { ToastProvider } from "../components/ToastProvider";
import { ThemeProvider } from "../theme/ThemeProvider";
import { openExternalUrl } from "../utils/stellarExpert";

jest.mock("../api/publishers", () => ({ fetchPublicPublisher: jest.fn() }));
jest.mock("../utils/stellarExpert", () => ({
  stellarExpertAccountUrl: jest.fn(() => "https://stellar.expert/account/owner"),
  openExternalUrl: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn().mockResolvedValue(undefined) }));
jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockFetchPublicPublisher = fetchPublicPublisher as jest.MockedFunction<
  typeof fetchPublicPublisher
>;
const mockOpenExternalUrl = openExternalUrl as jest.MockedFunction<typeof openExternalUrl>;

const address = "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7";
const publisher = {
  id: "pub-1",
  name: "Ada Publishing",
  email: "ada@example.com",
  walletAddress: address,
  createdAt: "2024-01-01T00:00:00Z",
};
const resource = {
  id: "resource-1",
  title: "Stellar handbook",
  price: "4.50",
  resourceType: "file",
  walletAddress: address,
  verificationStatus: "verified" as const,
  onchainStatus: "registered" as const,
  listed: true,
  accessUrl: "https://example.com/resource-1",
};

const navigation = { navigate: jest.fn(), setOptions: jest.fn() } as any;

async function renderScreen() {
  const screen = render(
    <ThemeProvider>
      <ToastProvider>
        <PublisherPublicScreen
          route={{ key: "PublisherPublic", name: "PublisherPublic", params: { address } }}
          navigation={navigation}
        />
      </ToastProvider>
    </ThemeProvider>
  );
  await act(async () => {});
  return screen;
}

beforeEach(() => {
  jest.clearAllMocks();
});

it("shows the publisher, their resources, and opens a resource", async () => {
  mockFetchPublicPublisher.mockResolvedValue({ publisher, resources: [resource] });
  const screen = await renderScreen();

  expect(mockFetchPublicPublisher).toHaveBeenCalledWith(address, expect.anything());
  expect(screen.getByText("Ada Publishing")).toBeTruthy();
  expect(screen.getByText(address)).toBeTruthy();
  expect(screen.getByText("Resources (1)")).toBeTruthy();
  expect(screen.queryByText("ada@example.com")).toBeNull();
  expect(navigation.setOptions).toHaveBeenCalledWith({ title: "Ada Publishing" });

  fireEvent.press(screen.getByLabelText("Open Stellar handbook"));
  expect(navigation.navigate).toHaveBeenCalledWith("ResourceDetail", { resourceId: "resource-1" });
});

it("says so when the publisher has no listed resources", async () => {
  mockFetchPublicPublisher.mockResolvedValue({ publisher, resources: [] });
  const screen = await renderScreen();

  expect(screen.getByText("This publisher has no listed resources yet.")).toBeTruthy();
});

it("handles a wallet with no publisher (404)", async () => {
  mockFetchPublicPublisher.mockResolvedValue(null);
  const screen = await renderScreen();

  expect(screen.getByText("No publisher profile")).toBeTruthy();
  expect(screen.getByText(address)).toBeTruthy();
  expect(navigation.setOptions).not.toHaveBeenCalled();
});

it("shows the error and retries", async () => {
  mockFetchPublicPublisher.mockRejectedValueOnce(new Error("Network error. Please check your connection."));
  const screen = await renderScreen();

  expect(screen.getByText("Network error. Please check your connection.")).toBeTruthy();

  mockFetchPublicPublisher.mockResolvedValueOnce({ publisher, resources: [] });
  fireEvent.press(screen.getByLabelText("Retry loading publisher"));
  await act(async () => {});

  expect(mockFetchPublicPublisher).toHaveBeenCalledTimes(2);
  expect(screen.getByText("Ada Publishing")).toBeTruthy();
});

it("opens the wallet on Stellar Expert and reports failures", async () => {
  mockFetchPublicPublisher.mockResolvedValue(null);
  mockOpenExternalUrl.mockRejectedValueOnce(new Error("cannot open"));
  const screen = await renderScreen();

  fireEvent.press(screen.getByLabelText("View wallet on Stellar Expert"));

  expect(mockOpenExternalUrl).toHaveBeenCalledWith("https://stellar.expert/account/owner");
  expect(await screen.findByText("Unable to open explorer")).toBeTruthy();
});
