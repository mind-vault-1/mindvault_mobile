import * as Clipboard from "expo-clipboard";
import React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { ActivityIndicator, AppState, ScrollView, type AppStateStatus } from "react-native";

import { fetchResource, ResourceFetchError } from "../api/resources";
import { prepareResourceAccess } from "../api/payment";
import { fetchVerification, type VerificationDetails } from "../api/verification";
import { shareResource } from "../utils/shareResource";
import { openExternalUrl } from "../utils/stellarExpert";
import { ResourceDetailScreen } from "./ResourceDetailScreen";

jest.mock("../api/resources", () => {
  const actual = jest.requireActual("../api/resources");
  return { ...actual, fetchResource: jest.fn() };
});
jest.mock("../api/payment", () => ({
  ...jest.requireActual("../api/payment"),
  prepareResourceAccess: jest.fn(),
}));
jest.mock("../api/verification", () => ({
  ...jest.requireActual("../api/verification"),
  fetchVerification: jest.fn(),
}));
jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../utils/shareResource", () => ({ shareResource: jest.fn().mockResolvedValue("shared") }));
jest.mock("../utils/stellarExpert", () => ({
  stellarExpertAccountUrl: jest.fn(() => "https://stellar.expert/account/owner"),
  stellarExpertTxUrl: jest.fn(() => "https://stellar.expert/tx/hash"),
  openExternalUrl: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock("../theme/ThemeProvider", () => {
  const colors = new Proxy({}, { get: () => "#000000" });
  return {
    ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
    useAppTheme: () => ({
      colors,
      shared: {
        screen: {}, button: {}, buttonText: {}, primaryButton: {}, primaryButtonText: {},
        badge: {}, badgeText: {},
      },
      typography: { subtitle: {}, title: {}, body: {}, price: {} },
    }),
  };
});

const mockedFetchResource = fetchResource as jest.MockedFunction<typeof fetchResource>;
const mockedFetchVerification = fetchVerification as jest.MockedFunction<typeof fetchVerification>;
const mockedShareResource = shareResource as jest.MockedFunction<typeof shareResource>;
const mockedOpenExternalUrl = openExternalUrl as jest.MockedFunction<typeof openExternalUrl>;

const resource = {
  id: "resource-1",
  title: "Stellar handbook",
  price: "4.50",
  resourceType: "file",
  publisherName: "MindVault",
  walletAddress: "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7",
  verificationStatus: "verified" as const,
  onchainStatus: "registered" as const,
  onchainTxHash: "abc123",
  listed: true,
  accessUrl: "https://example.com/resource-1",
  updatedAt: "2025-06-15T12:30:00.000Z",
};

const navigation = { setOptions: jest.fn(), goBack: jest.fn() } as any;
const route = { params: { resourceId: resource.id } } as any;

function renderScreen() {
  return render(<ResourceDetailScreen route={route} navigation={navigation} />);
}

/** A `GET /resources/:id/verification` response, as the server returns it. */
function makeVerification(
  overrides: Partial<VerificationDetails> = {}
): VerificationDetails {
  return {
    resourceId: "resource-1",
    title: "Doc",
    status: "verified",
    listed: true,
    publishedAt: "2025-06-01T09:00:00.000Z",
    verification: {
      isOriginal: true,
      confidence: 0.92,
      flags: [],
      checkedAt: "2025-06-15T12:30:00.000Z",
    },
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedShareResource.mockResolvedValue("shared");
  mockedOpenExternalUrl.mockResolvedValue(undefined);
  mockedFetchVerification.mockResolvedValue(makeVerification());
});

it("shows a spinner while the resource is loading", () => {
  mockedFetchResource.mockReturnValue(new Promise(() => {}));
  const screen = renderScreen();
  expect(screen.UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
});

it("shows only Go Back for a permanent 404", async () => {
  mockedFetchResource.mockRejectedValue(new ResourceFetchError("Resource not found.", false));
  const screen = renderScreen();

  expect(await screen.findByText("Resource not found.")).toBeTruthy();
  expect(screen.getByText("Go Back")).toBeTruthy();
  expect(screen.queryByText("Try Again")).toBeNull();
  fireEvent.press(screen.getByText("Go Back"));
  expect(navigation.goBack).toHaveBeenCalled();
});

it("retries a transient network error and then renders the resource", async () => {
  mockedFetchResource
    .mockRejectedValueOnce(new ResourceFetchError("Network error.", true))
    .mockResolvedValueOnce(resource);
  const screen = renderScreen();

  fireEvent.press(await screen.findByText("Try Again"));
  expect(await screen.findByText(resource.title)).toBeTruthy();
  expect(mockedFetchResource).toHaveBeenCalledTimes(2);
});

it("renders title, price, status badges, and timestamp", async () => {
  mockedFetchResource.mockResolvedValue(resource);
  const screen = renderScreen();

  expect(await screen.findByText(resource.title)).toBeTruthy();
  expect(screen.getByText("4.50 USDC")).toBeTruthy();
  expect(screen.getByLabelText("Verification: verified")).toBeTruthy();
  expect(screen.getByLabelText("On-chain: registered")).toBeTruthy();
  expect(screen.getByText(/Last updated.*2025/)).toBeTruthy();
});

it("copies the access URL and shows a toast", async () => {
  mockedFetchResource.mockResolvedValue(resource);
  const screen = renderScreen();
  fireEvent.press(await screen.findByText("Copy Access URL"));

  await waitFor(() => expect(Clipboard.setStringAsync).toHaveBeenCalledWith(resource.accessUrl));
  expect(await screen.findByText("Resource URL copied")).toBeTruthy();
});

it("opens the paywall with the resource title, price and access URL", async () => {
  mockedFetchResource.mockResolvedValue(resource);
  const prepare = prepareResourceAccess as jest.MockedFunction<typeof prepareResourceAccess>;
  prepare.mockResolvedValue({ type: "ready", result: { type: "text", content: "Paid handbook content" } });
  const screen = renderScreen();
  fireEvent.press(await screen.findByRole("button", { name: "Unlock for 4.50 USDC" }));
  expect(screen.getAllByText(resource.title)).toHaveLength(2);
  expect(screen.getByText(/4.50 USDC.*Stellar testnet/)).toBeTruthy();
  fireEvent.press(screen.getByText("Pay & Access"));
  expect(await screen.findByText("Paid handbook content")).toBeTruthy();
  expect(prepare).toHaveBeenCalledWith(resource.accessUrl, resource.price);
  fireEvent.press(screen.getByLabelText("Close payment"));
  expect(screen.queryByText("Paid handbook content")).toBeNull();
});

it("shares through the resource helper", async () => {
  mockedFetchResource.mockResolvedValue(resource);
  const screen = renderScreen();
  fireEvent.press(await screen.findByText("Share Access URL"));

  await waitFor(() =>
    expect(mockedShareResource).toHaveBeenCalledWith(resource.title, resource.accessUrl)
  );
});

it("shows a toast when opening Stellar Expert fails", async () => {
  mockedFetchResource.mockResolvedValue(resource);
  mockedOpenExternalUrl.mockRejectedValue(new Error("cannot open"));
  const screen = renderScreen();
  fireEvent.press(await screen.findByLabelText(`Owner: ${resource.walletAddress}`));

  expect(await screen.findByText("Unable to open explorer")).toBeTruthy();
});

describe("collapsible verification section", () => {
  it("can be expanded and collapsed with accessibility attributes", async () => {
    mockedFetchResource.mockResolvedValue(resource);
    const screen = renderScreen();

    await screen.findByText(resource.title);
    const header = screen.getByLabelText("Verification");
    expect(header.props.accessibilityState).toEqual({ expanded: false });
    expect(screen.queryByLabelText("Verification details")).toBeNull();

    fireEvent.press(header);
    expect(header.props.accessibilityState).toEqual({ expanded: true });
    expect(screen.getByLabelText("Verification details")).toBeTruthy();
    // Let the first-expand fetch settle inside the test.
    await screen.findByLabelText("Verification Status: verified");

    fireEvent.press(header);
    expect(header.props.accessibilityState).toEqual({ expanded: false });
    expect(screen.queryByLabelText("Verification details")).toBeNull();
  });

  it("shows loading state when verification details are fetching", async () => {
    mockedFetchResource.mockResolvedValue(resource);
    mockedFetchVerification.mockReturnValue(new Promise(() => {}));
    const screen = renderScreen();

    await screen.findByText(resource.title);
    fireEvent.press(screen.getByLabelText("Verification"));

    expect(screen.getByLabelText("Loading verification details")).toBeTruthy();
    expect(screen.getByText("Loading verification details…")).toBeTruthy();
  });

  it("renders status, originality, confidence, flags and the check time", async () => {
    mockedFetchResource.mockResolvedValue(resource);
    mockedFetchVerification.mockResolvedValue(
      makeVerification({
        verification: {
          isOriginal: false,
          confidence: 0.874,
          flags: ["Similar to an existing resource"],
          checkedAt: "2025-07-20T10:00:00.000Z",
        },
      })
    );
    const screen = renderScreen();

    await screen.findByText(resource.title);
    fireEvent.press(screen.getByLabelText("Verification"));

    expect(await screen.findByLabelText("Verification Status: verified")).toBeTruthy();
    expect(screen.getByText("Possible copy")).toBeTruthy();
    expect(screen.getByText("87%")).toBeTruthy();
    expect(screen.getByText("• Similar to an existing resource")).toBeTruthy();
    expect(screen.getByText("Checked")).toBeTruthy();
    expect(screen.getByText(/Jul.*2025/)).toBeTruthy();
  });

  it("says so when no AI check has run yet", async () => {
    mockedFetchResource.mockResolvedValue(resource);
    mockedFetchVerification.mockResolvedValue(
      makeVerification({ status: "pending", verification: null })
    );
    const screen = renderScreen();

    await screen.findByText(resource.title);
    fireEvent.press(screen.getByLabelText("Verification"));

    expect(await screen.findByLabelText("Verification Status: pending")).toBeTruthy();
    expect(screen.getByText("No AI check has run for this resource yet.")).toBeTruthy();
  });

  it("only fetches verification once the section is first expanded", async () => {
    mockedFetchResource.mockResolvedValue(resource);
    const screen = renderScreen();

    await screen.findByText(resource.title);
    expect(mockedFetchVerification).not.toHaveBeenCalled();

    fireEvent.press(screen.getByLabelText("Verification"));
    await screen.findByLabelText("Verification Status: verified");
    fireEvent.press(screen.getByLabelText("Verification"));
    fireEvent.press(screen.getByLabelText("Verification"));

    expect(mockedFetchVerification).toHaveBeenCalledTimes(1);
  });

  it("shows error state with retry button and retries successfully", async () => {
    mockedFetchResource.mockResolvedValue(resource);
    mockedFetchVerification
      .mockRejectedValueOnce(new Error("Unable to reach verification service"))
      .mockResolvedValueOnce(makeVerification());
    const screen = renderScreen();

    await screen.findByText(resource.title);
    fireEvent.press(screen.getByLabelText("Verification"));

    expect(await screen.findByText("Unable to reach verification service")).toBeTruthy();
    const retryBtn = screen.getByLabelText("Retry loading verification");
    fireEvent.press(retryBtn);

    expect(await screen.findByLabelText("Verification Status: verified")).toBeTruthy();
    expect(mockedFetchVerification).toHaveBeenCalledTimes(2);
  });
});

describe("thumbnail", () => {
  it("shows the thumbnail when the resource has one", async () => {
    mockedFetchResource.mockResolvedValue({ ...resource, thumbnailUrl: "https://cdn.example.test/t.png" });
    const screen = renderScreen();

    const image = await screen.findByLabelText("Thumbnail of Stellar handbook");
    expect(image.props.source).toEqual({ uri: "https://cdn.example.test/t.png" });
  });

  it("leaves the thumbnail out when the resource has none", async () => {
    mockedFetchResource.mockResolvedValue(resource);
    const screen = renderScreen();

    await screen.findByText(resource.title);
    expect(screen.queryByLabelText("Thumbnail of Stellar handbook")).toBeNull();
  });

  it("falls back to the type icon when the thumbnail fails to load", async () => {
    mockedFetchResource.mockResolvedValue({ ...resource, thumbnailUrl: "https://cdn.example.test/t.png" });
    const screen = renderScreen();

    fireEvent(await screen.findByLabelText("Thumbnail of Stellar handbook"), "error");

    expect(screen.getByLabelText("File icon for Stellar handbook")).toBeTruthy();
    expect(screen.queryByLabelText("Thumbnail of Stellar handbook")).toBeNull();
  });
});


describe("refreshing", () => {
  beforeEach(() => {
    mockedFetchResource.mockReset();
    mockedFetchResource.mockResolvedValue(resource);
  });

  it("refetches on pull to refresh and shows the updated price", async () => {
    const screen = renderScreen();
    await waitFor(() => expect(screen.getByText("4.50 USDC")).toBeTruthy());

    mockedFetchResource.mockResolvedValue({ ...resource, price: "9.00" });
    const scroll = screen.UNSAFE_getByType(ScrollView);
    await act(async () => {
      await scroll.props.refreshControl.props.onRefresh();
    });

    await waitFor(() => expect(screen.getByText("9.00 USDC")).toBeTruthy());
    expect(mockedFetchResource).toHaveBeenCalledTimes(2);
  });

  it("keeps showing the resource when a refresh fails", async () => {
    const screen = renderScreen();
    await waitFor(() => expect(screen.getByText("4.50 USDC")).toBeTruthy());

    mockedFetchResource.mockRejectedValue(new ResourceFetchError("offline", true));
    await act(async () => {
      await screen.UNSAFE_getByType(ScrollView).props.refreshControl.props.onRefresh();
    });

    expect(screen.getByText("4.50 USDC")).toBeTruthy();
  });

  it("refetches when the app returns to the foreground", async () => {
    let emit: (s: AppStateStatus) => void = () => {};
    jest.spyOn(AppState, "addEventListener").mockImplementation(((_: string, h: (s: AppStateStatus) => void) => {
      emit = h;
      return { remove: jest.fn() };
    }) as unknown as typeof AppState.addEventListener);

    const screen = renderScreen();
    await waitFor(() => expect(screen.getByText("4.50 USDC")).toBeTruthy());

    await act(async () => {
      emit("background");
      emit("active");
    });
    await waitFor(() => expect(mockedFetchResource).toHaveBeenCalledTimes(2));
  });

  it("does not start a second request while one is in flight", async () => {
    const screen = renderScreen();
    await waitFor(() => expect(screen.getByText("4.50 USDC")).toBeTruthy());

    let resolve: (r: typeof resource) => void = () => {};
    mockedFetchResource.mockReturnValue(new Promise((r) => { resolve = r; }));
    const onRefresh = screen.UNSAFE_getByType(ScrollView).props.refreshControl.props.onRefresh;

    let first: Promise<void>;
    act(() => {
      first = onRefresh();
      void onRefresh();
    });
    expect(mockedFetchResource).toHaveBeenCalledTimes(2); // initial + one refresh
    await act(async () => {
      resolve(resource);
      await first;
    });
  });
});
