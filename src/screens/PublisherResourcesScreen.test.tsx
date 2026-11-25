import AsyncStorage from "@react-native-async-storage/async-storage";
import React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

import { PublisherResourcesScreen } from "./PublisherResourcesScreen";
import { ToastProvider } from "../components/ToastProvider";
import {
  delistResource,
  deleteStoredApiKey,
  fetchPublisherResources,
  getStoredApiKey,
  storeApiKey,
} from "../api/resources";
import type { Resource } from "../types";

function renderScreen() {
  return render(
    <ToastProvider>
      <PublisherResourcesScreen />
    </ToastProvider>
  );
}

jest.mock("../api/resources", () => ({
  fetchPublisherResources: jest.fn(),
  delistResource: jest.fn(),
  getStoredApiKey: jest.fn(),
  storeApiKey: jest.fn(),
  deleteStoredApiKey: jest.fn(),
  getApiBaseUrl: jest.fn(() => "https://api.mindvault.test"),
}));

jest.mock("../components/SkeletonCard", () => ({
  SkeletonCard: () => null,
}));

jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockNavigation = {
  navigate: jest.fn(),
  popToTop: jest.fn(),
  goBack: jest.fn(),
};

jest.mock("@react-navigation/native", () => ({
  useNavigation: () => mockNavigation,
}));

jest.mock("../components/RegisterModal", () => {
  const { Text, Pressable, View } = require("react-native");
  return {
    RegisterModal: ({ visible, resource, onClose, onSuccess, onError }: any) => {
      if (!visible || !resource) return null;
      return (
        <View testID="register-modal">
          <Text testID="register-modal-title">Register Modal: {resource.title}</Text>
          <Pressable
            testID="mock-register-success-btn"
            accessibilityLabel="Trigger success"
            onPress={() => onSuccess("Registration successful!", "tx-mock-123456")}
          />
          <Pressable
            testID="mock-register-error-btn"
            accessibilityLabel="Trigger error"
            onPress={() => onError("Registration failed: server error")}
          />
          <Pressable
            testID="mock-register-close-btn"
            accessibilityLabel="Close register modal"
            onPress={onClose}
          />
        </View>
      );
    },
  };
});

jest.mock("../components/PublisherSignupSheet", () => {
  const { Text, Pressable, View } = require("react-native");
  return {
    PublisherSignupSheet: ({ visible, onClose, onSuccess }: any) => {
      if (!visible) return null;
      return (
        <View testID="signup-modal">
          <Text testID="signup-modal-title">Create Publisher Account</Text>
          <Pressable
            testID="mock-signup-success-btn"
            accessibilityLabel="Trigger signup success"
            onPress={() => onSuccess("sk_live_testkey123")}
          />
          <Pressable
            testID="mock-signup-close-btn"
            accessibilityLabel="Close signup modal"
            onPress={onClose}
          />
        </View>
      );
    },
  };
});

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

const mockedGetStoredApiKey = getStoredApiKey as jest.MockedFunction<typeof getStoredApiKey>;
const mockedFetchPublisherResources = fetchPublisherResources as jest.MockedFunction<
  typeof fetchPublisherResources
>;
const mockedDelistResource = delistResource as jest.MockedFunction<typeof delistResource>;
const mockedStoreApiKey = storeApiKey as jest.MockedFunction<typeof storeApiKey>;
const mockedDeleteStoredApiKey = deleteStoredApiKey as jest.MockedFunction<
  typeof deleteStoredApiKey
>;

function createResource(overrides: Partial<Resource>): Resource {
  return {
    id: overrides.id ?? "res-1",
    title: overrides.title ?? "Test Resource",
    price: overrides.price ?? "2.50",
    resourceType: overrides.resourceType ?? "file",
    publisherName: overrides.publisherName ?? "Alice",
    walletAddress: overrides.walletAddress ?? "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7",
    verificationStatus: overrides.verificationStatus ?? "verified",
    onchainStatus: overrides.onchainStatus ?? "none",
    listed: true,
    accessUrl: "https://example.com/file",
    ...overrides,
  };
}

describe("PublisherResourcesScreen - Register on-chain", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetStoredApiKey.mockResolvedValue("stored-test-key");
  });

  it("shows 'Register on-chain' only for verified resources whose onchainStatus is 'none' or 'failed'", async () => {
    const resVerifiedNone = createResource({
      id: "r1",
      title: "Verified None",
      verificationStatus: "verified",
      onchainStatus: "none",
    });
    const resVerifiedFailed = createResource({
      id: "r2",
      title: "Verified Failed",
      verificationStatus: "verified",
      onchainStatus: "failed",
    });
    const resVerifiedRegistered = createResource({
      id: "r3",
      title: "Verified Registered",
      verificationStatus: "verified",
      onchainStatus: "registered",
    });
    const resVerifiedPending = createResource({
      id: "r4",
      title: "Verified Pending",
      verificationStatus: "verified",
      onchainStatus: "pending",
    });
    const resPendingNone = createResource({
      id: "r5",
      title: "Pending None",
      verificationStatus: "pending",
      onchainStatus: "none",
    });
    const resRejectedNone = createResource({
      id: "r6",
      title: "Rejected None",
      verificationStatus: "rejected",
      onchainStatus: "none",
    });

    mockedFetchPublisherResources.mockResolvedValue([
      resVerifiedNone,
      resVerifiedFailed,
      resVerifiedRegistered,
      resVerifiedPending,
      resPendingNone,
      resRejectedNone,
    ]);

    const screen = renderScreen();

    // r1 and r2 must have register button
    const btnR1 = await screen.findByLabelText(`Register ${resVerifiedNone.title} on-chain`);
    expect(btnR1).toBeTruthy();
    expect(btnR1.props.accessibilityRole).toBe("button");

    const btnR2 = screen.getByLabelText(`Register ${resVerifiedFailed.title} on-chain`);
    expect(btnR2).toBeTruthy();
    expect(btnR2.props.accessibilityRole).toBe("button");

    // r3, r4, r5, r6 must NOT have register button
    expect(screen.queryByLabelText(`Register ${resVerifiedRegistered.title} on-chain`)).toBeNull();
    expect(screen.queryByLabelText(`Register ${resVerifiedPending.title} on-chain`)).toBeNull();
    expect(screen.queryByLabelText(`Register ${resPendingNone.title} on-chain`)).toBeNull();
    expect(screen.queryByLabelText(`Register ${resRejectedNone.title} on-chain`)).toBeNull();
  });

  it("opens RegisterModal on tap and updates the card to 'registered' with tx hash and toast on success", async () => {
    const res = createResource({
      id: "res-to-register",
      title: "My Exclusive Book",
      verificationStatus: "verified",
      onchainStatus: "none",
    });

    mockedFetchPublisherResources.mockResolvedValue([res]);

    const screen = renderScreen();

    const registerBtn = await screen.findByLabelText(`Register ${res.title} on-chain`);
    expect(screen.getByLabelText("On-chain: not on-chain")).toBeTruthy();

    // Tap the register button
    fireEvent.press(registerBtn);

    // Modal is now opened
    expect(screen.getByTestId("register-modal")).toBeTruthy();
    expect(screen.getByText(`Register Modal: ${res.title}`)).toBeTruthy();

    // Trigger success callback
    fireEvent.press(screen.getByTestId("mock-register-success-btn"));

    // Toast message is displayed; the modal stays on its success step until closed
    expect(await screen.findByText("Registration successful!")).toBeTruthy();
    expect(screen.getByTestId("register-modal")).toBeTruthy();

    // Card status is updated to registered
    expect(screen.getByLabelText("On-chain: registered")).toBeTruthy();

    // Card displays tx hash
    expect(screen.getByLabelText("Transaction: tx-mock-123456")).toBeTruthy();
    expect(screen.getByText(/Tx:\s+tx-moc…3456/)).toBeTruthy();

    // The register button is now gone for this card
    expect(screen.queryByLabelText(`Register ${res.title} on-chain`)).toBeNull();
  });

  it("surfaces server error message via toast when registration fails", async () => {
    const res = createResource({
      id: "res-error",
      title: "Error Resource",
      verificationStatus: "verified",
      onchainStatus: "failed",
    });

    mockedFetchPublisherResources.mockResolvedValue([res]);

    const screen = renderScreen();

    const registerBtn = await screen.findByLabelText(`Register ${res.title} on-chain`);
    fireEvent.press(registerBtn);

    expect(screen.getByTestId("register-modal")).toBeTruthy();

    // Trigger error callback
    fireEvent.press(screen.getByTestId("mock-register-error-btn"));

    // Toast with the extracted error message is shown
    expect(await screen.findByText("Registration failed: server error")).toBeTruthy();
  });

  it("closes RegisterModal without changes when cancel/close is pressed", async () => {
    const res = createResource({
      id: "res-cancel",
      title: "Cancel Resource",
      verificationStatus: "verified",
      onchainStatus: "none",
    });

    mockedFetchPublisherResources.mockResolvedValue([res]);

    const screen = renderScreen();

    const registerBtn = await screen.findByLabelText(`Register ${res.title} on-chain`);
    fireEvent.press(registerBtn);

    expect(screen.getByTestId("register-modal")).toBeTruthy();

    fireEvent.press(screen.getByTestId("mock-register-close-btn"));

    await waitFor(() => expect(screen.queryByTestId("register-modal")).toBeNull());
    expect(screen.getByLabelText("On-chain: not on-chain")).toBeTruthy();
  });
});

describe("PublisherResourcesScreen - Delist", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetStoredApiKey.mockResolvedValue("stored-test-key");
  });

  it("asks for confirmation first and keeps the resource when cancelled", async () => {
    const res = createResource({ id: "res-delist", title: "Old Whitepaper" });
    mockedFetchPublisherResources.mockResolvedValue([res]);

    const screen = renderScreen();

    fireEvent.press(await screen.findByLabelText(`Delist ${res.title}`));

    expect(screen.getByTestId("delist-modal")).toBeTruthy();
    expect(mockedDelistResource).not.toHaveBeenCalled();

    fireEvent.press(screen.getByLabelText("Cancel delist"));

    await waitFor(() => expect(screen.queryByTestId("delist-modal")).toBeNull());
    expect(mockedDelistResource).not.toHaveBeenCalled();
    expect(screen.getByLabelText(`Delist ${res.title}`)).toBeTruthy();
  });

  it("delists the resource and removes it from the list", async () => {
    const res = createResource({ id: "res-delist", title: "Old Whitepaper" });
    mockedFetchPublisherResources.mockResolvedValue([res]);
    mockedDelistResource.mockResolvedValue(undefined);

    const screen = renderScreen();

    fireEvent.press(await screen.findByLabelText(`Delist ${res.title}`));
    fireEvent.press(screen.getByLabelText("Confirm delist"));

    expect(await screen.findByText("Resource delisted")).toBeTruthy();
    expect(mockedDelistResource).toHaveBeenCalledWith("res-delist");

    await waitFor(() => expect(screen.queryByTestId("delist-modal")).toBeNull());
    expect(screen.queryByText(res.title)).toBeNull();
  });

  it("keeps the resource and shows the server message when delisting fails", async () => {
    const res = createResource({ id: "res-delist", title: "Old Whitepaper" });
    mockedFetchPublisherResources.mockResolvedValue([res]);
    mockedDelistResource.mockRejectedValue(
      new Error("Forbidden: you do not own this resource")
    );

    const screen = renderScreen();

    fireEvent.press(await screen.findByLabelText(`Delist ${res.title}`));
    fireEvent.press(screen.getByLabelText("Confirm delist"));

    expect(await screen.findByText("Forbidden: you do not own this resource")).toBeTruthy();
    expect(screen.getByTestId("delist-modal")).toBeTruthy();
    expect(screen.getByLabelText(`Delist ${res.title}`)).toBeTruthy();
  });
});

describe("PublisherResourcesScreen - Publisher Signup", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetStoredApiKey.mockResolvedValue(null);
  });

  it("shows 'Create a publisher account' button when no API key is stored", async () => {
    const screen = renderScreen();

    expect(await screen.findByText("Create a publisher account")).toBeTruthy();
  });

  it("opens PublisherSignupSheet when 'Create a publisher account' is pressed", async () => {
    const screen = renderScreen();

    fireEvent.press(await screen.findByText("Create a publisher account"));

    expect(await screen.findByTestId("signup-modal")).toBeTruthy();
  });

  it("stores API key and loads resources on signup success", async () => {
    const { storeApiKey } = require("../api/resources");
    const mockResources = [createResource({ id: "res-1", title: "My Resource" })];
    mockedFetchPublisherResources.mockResolvedValue(mockResources);
    storeApiKey.mockResolvedValue(undefined);

    const screen = renderScreen();

    fireEvent.press(await screen.findByText("Create a publisher account"));
    fireEvent.press(await screen.findByTestId("mock-signup-success-btn"));

    await waitFor(() => {
      expect(storeApiKey).toHaveBeenCalledWith("sk_live_testkey123");
    });

    await waitFor(() => {
      expect(screen.getByText("My Resource")).toBeTruthy();
    });
  });
});

describe("PublisherResourcesScreen - resource detail", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetStoredApiKey.mockResolvedValue("stored-test-key");
  });

  it("opens the detail screen for the chosen resource", async () => {
    mockedFetchPublisherResources.mockResolvedValue([
      createResource({ id: "r1", title: "First" }),
      createResource({ id: "r2", title: "Second" }),
    ]);
    const screen = renderScreen();

    fireEvent.press(await screen.findByLabelText("Manage Second"));
    expect(mockNavigation.navigate).toHaveBeenCalledWith("PublisherResourceDetail", { resourceId: "r2" });
  });
});

describe("PublisherResourcesScreen - bulk actions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetStoredApiKey.mockResolvedValue("stored-test-key");
    mockedFetchPublisherResources.mockResolvedValue([
      createResource({ id: "bulk-1", title: "Bulk One" }),
      createResource({ id: "bulk-2", title: "Bulk Two" }),
    ]);
  });

  it("enters selection mode on long-press", async () => {
    const screen = renderScreen();

    fireEvent(await screen.findByTestId("bulk-row-bulk-1"), "longPress");

    expect(await screen.findByText("1 selected")).toBeTruthy();
    expect(screen.getByLabelText("Select Bulk One")).toBeTruthy();
  });

  it("asks for confirmation before bulk delist and cancels without calling the API", async () => {
    const screen = renderScreen();

    fireEvent(await screen.findByTestId("bulk-row-bulk-1"), "longPress");
    fireEvent.press(await screen.findByLabelText("Delist selected resources"));

    expect(await screen.findByText("Delist selected resources?")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Cancel bulk delist"));

    await waitFor(() => expect(screen.queryByText("Delist selected resources?")).toBeNull());
    expect(mockedDelistResource).not.toHaveBeenCalled();
  });

  it("reports partial failures and keeps successful delists applied", async () => {
    mockedDelistResource
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("Second resource is locked"));

    const screen = renderScreen();

    fireEvent(await screen.findByTestId("bulk-row-bulk-1"), "longPress");
    fireEvent(await screen.findByTestId("bulk-row-bulk-2"), "longPress");
    fireEvent.press(await screen.findByLabelText("Delist selected resources"));
    fireEvent.press(await screen.findByLabelText("Confirm bulk delist"));

    expect(
      await screen.findByText(/1 of 2 delisted; 1 failed.*Second resource is locked/)
    ).toBeTruthy();
    expect(mockedDelistResource).toHaveBeenCalledWith("bulk-1");
    expect(mockedDelistResource).toHaveBeenCalledWith("bulk-2");
    await waitFor(() => expect(screen.queryByText("Bulk One")).toBeNull());
    expect(screen.getByText("Bulk Two")).toBeTruthy();
  });
});

describe("PublisherResourcesScreen - Publisher checklist", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    mockedGetStoredApiKey.mockResolvedValue(null);
    mockedFetchPublisherResources.mockResolvedValue([]);
  });

  it("shows signup action and opens the signup sheet", async () => {
    const screen = renderScreen();
    fireEvent.press(await screen.findByLabelText("Checklist step: Create a publisher account"));
    expect(screen.getByTestId("signup-modal")).toBeTruthy();
  });

  it("hides after dismissal and stays hidden across remounts", async () => {
    mockedGetStoredApiKey.mockResolvedValue("stored-key");
    mockedFetchPublisherResources.mockResolvedValue([createResource({ id: "r1", onchainStatus: "none" })]);
    const screen = renderScreen();
    fireEvent.press(await screen.findByLabelText("Dismiss getting started checklist"));
    await waitFor(() => expect(screen.queryByText("Getting started")).toBeNull());
    screen.unmount();
    const remount = renderScreen();
    await waitFor(() => expect(remount.queryByText("Getting started")).toBeNull());
  });
});

describe("PublisherResourcesScreen - API key lifecycle", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedFetchPublisherResources.mockResolvedValue([]);
    mockedStoreApiKey.mockResolvedValue(undefined);
    mockedDeleteStoredApiKey.mockResolvedValue(undefined);
  });

  it("restores a stored API key and loads the publisher's resources", async () => {
    mockedGetStoredApiKey.mockResolvedValue("stored-key");
    mockedFetchPublisherResources.mockResolvedValue([
      createResource({ id: "restored-1", title: "Stored Resource" }),
    ]);

    const screen = renderScreen();

    expect(await screen.findByText("Stored Resource")).toBeTruthy();
    expect(mockedFetchPublisherResources).toHaveBeenCalledWith("stored-key", undefined);
    expect(screen.queryByText("Authenticate")).toBeNull();
  });

  it("shows the auth form when the stored API key is invalid", async () => {
    mockedGetStoredApiKey.mockResolvedValue("expired-key");
    mockedFetchPublisherResources.mockRejectedValue(new Error("Invalid API key"));

    const screen = renderScreen();

    expect(await screen.findByText("Invalid API key")).toBeTruthy();
    expect(screen.getByText("Authenticate")).toBeTruthy();
    expect(screen.getByPlaceholderText("Enter your API key…")).toBeTruthy();
  });

  it("saves a valid API key and authenticates", async () => {
    mockedGetStoredApiKey.mockResolvedValue(null);
    mockedFetchPublisherResources.mockResolvedValue([
      createResource({ id: "new-1", title: "New Resource" }),
    ]);

    const screen = renderScreen();
    const input = await screen.findByPlaceholderText("Enter your API key…");

    await act(async () => {
      fireEvent.changeText(input, "sk_test_123");
    });
    await act(async () => {
      fireEvent.press(screen.getByText("Authenticate"));
    });

    await waitFor(() => expect(mockedStoreApiKey).toHaveBeenCalledWith("sk_test_123"));
    expect(await screen.findByText("New Resource")).toBeTruthy();
    expect(await screen.findByText("API key saved successfully")).toBeTruthy();
  });

  it("shows the authentication error and does not save an invalid API key", async () => {
    mockedGetStoredApiKey.mockResolvedValue(null);
    mockedFetchPublisherResources.mockRejectedValue(new Error("Invalid API key"));

    const screen = renderScreen();
    const input = await screen.findByPlaceholderText("Enter your API key…");

    await act(async () => {
      fireEvent.changeText(input, "bad-key");
    });
    await act(async () => {
      fireEvent.press(screen.getByText("Authenticate"));
    });

    expect(await screen.findByText("Invalid API key")).toBeTruthy();
    expect(mockedStoreApiKey).not.toHaveBeenCalled();
  });

  it("filters resources with the search input", async () => {
    mockedGetStoredApiKey.mockResolvedValue("stored-key");
    mockedFetchPublisherResources.mockResolvedValue([
      createResource({ id: "alpha", title: "Alpha Resource" }),
      createResource({ id: "beta", title: "Beta Resource" }),
    ]);

    const screen = renderScreen();
    expect(await screen.findByText("Alpha Resource")).toBeTruthy();

    await act(async () => {
      fireEvent.changeText(screen.getByPlaceholderText("Search your resources…"), "Beta");
    });

    expect(screen.getByText("Beta Resource")).toBeTruthy();
    expect(screen.queryByText("Alpha Resource")).toBeNull();
  });

  it("shows the empty state when the publisher has no resources", async () => {
    mockedGetStoredApiKey.mockResolvedValue("stored-key");
    mockedFetchPublisherResources.mockResolvedValue([]);

    const screen = renderScreen();

    expect(await screen.findByText("No resources")).toBeTruthy();
    expect(screen.getByText("You haven't published any resources yet.")).toBeTruthy();
  });

  it("deletes the stored API key and returns to the auth form on logout", async () => {
    mockedGetStoredApiKey.mockResolvedValue("stored-key");
    mockedFetchPublisherResources.mockResolvedValue([
      createResource({ id: "logout-1", title: "Logout Resource" }),
    ]);

    const screen = renderScreen();
    expect(await screen.findByText("Logout Resource")).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByText("Logout"));
    });

    await waitFor(() => expect(mockedDeleteStoredApiKey).toHaveBeenCalled());
    expect(await screen.findByText("Authenticate")).toBeTruthy();
    expect(screen.queryByText("Logout Resource")).toBeNull();
  });
});

describe("PublisherResourcesScreen - getting-started checklist", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    mockedGetStoredApiKey.mockResolvedValue("stored-test-key");
  });

  it("ticks steps from existing state and links each open step to its screen", async () => {
    mockedFetchPublisherResources.mockResolvedValue([
      createResource({ id: "r1", title: "Verified", verificationStatus: "verified", onchainStatus: "none" }),
    ]);
    const screen = renderScreen();
    expect(await screen.findByText("Getting started (3/4)")).toBeTruthy();

    fireEvent.press(screen.getByRole("button", { name: "Register a verified resource on-chain" }));
    expect(await screen.findByTestId("register-modal")).toBeTruthy();
  });

  it("disappears when every step is complete", async () => {
    mockedFetchPublisherResources.mockResolvedValue([
      createResource({ id: "r1", verificationStatus: "verified", onchainStatus: "registered" }),
    ]);
    const screen = renderScreen();
    await screen.findByText("Test Resource");
    expect(screen.queryByTestId("publisher-getting-started")).toBeNull();
  });

  it("stays hidden after being dismissed", async () => {
    mockedFetchPublisherResources.mockResolvedValue([]);
    const first = renderScreen();
    fireEvent.press(await first.findByRole("button", { name: "Dismiss checklist" }));
    expect(first.queryByTestId("publisher-getting-started")).toBeNull();
    first.unmount();

    const second = renderScreen();
    await act(async () => {});
    expect(second.queryByTestId("publisher-getting-started")).toBeNull();
  });
});

describe("virtualized list config", () => {
  it("keeps a bounded render window for large publisher catalogs", async () => {
    const big = Array.from({ length: 120 }, (_, i) => createResource({ id: `res-${i}`, title: `Resource ${i}` }));
    mockedGetStoredApiKey.mockResolvedValue("stored-test-key");
    mockedFetchPublisherResources.mockResolvedValue(big);
    const screen = renderScreen();
    await screen.findByText("Resource 0");
    const flatList = screen.UNSAFE_getByType(require("react-native").FlatList);
    expect(flatList.props.initialNumToRender).toBeLessThanOrEqual(10);
    expect(flatList.props.maxToRenderPerBatch).toBeLessThanOrEqual(10);
    expect(flatList.props.windowSize).toBeLessThanOrEqual(7);
    expect(flatList.props.removeClippedSubviews).toBe(true);
    expect(flatList.props.keyExtractor({ id: "x" })).toBe("x");
  });
});
