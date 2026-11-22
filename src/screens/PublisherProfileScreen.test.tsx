import React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";

import { PublisherProfileScreen } from "./PublisherProfileScreen";
import { fetchMe } from "../api/publishers";
import { clearApiKey, storeApiKey } from "../services/secureStorage";
import { ThemeProvider } from "../theme/ThemeProvider";

const mockGoBack = jest.fn();

jest.mock("../api/publishers", () => ({ fetchMe: jest.fn() }));
jest.mock("../services/secureStorage", () => ({
  storeApiKey: jest.fn(),
  clearApiKey: jest.fn(),
}));
jest.mock("@react-navigation/native", () => ({
  ...jest.requireActual("@react-navigation/native"),
  useNavigation: () => ({ goBack: mockGoBack }),
}));
jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

const mockFetchMe = fetchMe as jest.MockedFunction<typeof fetchMe>;
const mockStoreApiKey = storeApiKey as jest.MockedFunction<typeof storeApiKey>;
const mockClearApiKey = clearApiKey as jest.MockedFunction<typeof clearApiKey>;

const profile = {
  id: "pub-123",
  name: "Test Publisher",
  email: "test@example.com",
  walletAddress: "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7",
  createdAt: "2024-01-01T00:00:00Z",
};

async function renderScreen() {
  const screen = render(
    <ThemeProvider>
      <PublisherProfileScreen />
    </ThemeProvider>
  );
  await act(async () => {});
  return screen;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockStoreApiKey.mockResolvedValue(undefined);
  mockClearApiKey.mockResolvedValue(undefined);
});

it("shows the publisher's name, wallet, email and created date", async () => {
  mockFetchMe.mockResolvedValue(profile);
  const screen = await renderScreen();

  expect(screen.getByText("Test Publisher")).toBeTruthy();
  expect(screen.getByText(profile.walletAddress)).toBeTruthy();
  expect(screen.getByText("test@example.com")).toBeTruthy();
  expect(screen.getByText("Created")).toBeTruthy();
});

it("shows the error and retries", async () => {
  mockFetchMe.mockRejectedValueOnce(new Error("Unauthorized: Invalid API key"));
  mockFetchMe.mockResolvedValueOnce(profile);
  const screen = await renderScreen();

  expect(screen.getByText("Unauthorized: Invalid API key")).toBeTruthy();
  await act(async () => {
    fireEvent.press(screen.getByLabelText("Retry loading profile"));
  });
  expect(screen.getByText("Test Publisher")).toBeTruthy();
});

it("validates a new key against the server before storing it", async () => {
  mockFetchMe.mockResolvedValueOnce(profile);
  const screen = await renderScreen();
  mockFetchMe.mockResolvedValueOnce({ ...profile, name: "Other Publisher" });

  fireEvent.changeText(screen.getByLabelText("New API key"), "  new-key  ");
  await act(async () => {
    fireEvent.press(screen.getByLabelText("Replace API key"));
  });

  expect(mockFetchMe).toHaveBeenLastCalledWith("new-key");
  expect(mockStoreApiKey).toHaveBeenCalledWith("new-key");
  expect(screen.getByText("Other Publisher")).toBeTruthy();
  expect(screen.getByText("API key replaced.")).toBeTruthy();
});

it("keeps the current key when the new one is rejected", async () => {
  mockFetchMe.mockResolvedValueOnce(profile);
  const screen = await renderScreen();
  mockFetchMe.mockRejectedValueOnce(new Error("Unauthorized: Invalid API key"));

  fireEvent.changeText(screen.getByLabelText("New API key"), "typo-key");
  await act(async () => {
    fireEvent.press(screen.getByLabelText("Replace API key"));
  });

  expect(mockStoreApiKey).not.toHaveBeenCalled();
  expect(screen.getByText("Unauthorized: Invalid API key")).toBeTruthy();
  expect(screen.getByText("Test Publisher")).toBeTruthy();
});

it("logs out by wiping the stored key and leaving the screen", async () => {
  mockFetchMe.mockResolvedValue(profile);
  const screen = await renderScreen();

  await act(async () => {
    fireEvent.press(screen.getByLabelText("Log out"));
  });

  expect(mockClearApiKey).toHaveBeenCalledTimes(1);
  expect(mockGoBack).toHaveBeenCalledTimes(1);
});
