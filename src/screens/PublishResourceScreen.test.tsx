import * as Clipboard from "expo-clipboard";
import { getDocumentAsync } from "expo-document-picker";
import React from "react";
import { ActivityIndicator } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

import { pollPublishStatus, publishFile, publishLink, type PublishResult } from "../api/publish";
import { signPaymentTransaction } from "../api/payment";
import { ToastProvider } from "../components/ToastProvider";
import { useNetworkStatus } from "../hooks/useNetworkStatus";
import { enqueueMutation, retryMutation } from "../services/mutationQueue";
import { ThemeProvider } from "../theme/ThemeProvider";
import { PublishResourceScreen } from "./PublishResourceScreen";

const mockNavigate = jest.fn();
jest.mock("@react-navigation/native", () =>
  require("../test-utils").navigationMock({
    navigate: (...args: unknown[]) => mockNavigate(...args),
  })
);
jest.mock("react-native-safe-area-context", () =>
  require("../test-utils").safeAreaMock()
);
jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn().mockResolvedValue(true) }));
jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));

jest.mock("../api/publish", () => ({
  ...jest.requireActual("../api/publish"),
  publishLink: jest.fn(),
  publishFile: jest.fn(),
  pollPublishStatus: jest.fn(),
}));
jest.mock("../api/payment", () => ({
  signPaymentTransaction: jest.fn(),
  sorobanRpcUrl: jest.fn(() => "https://rpc.example.com"),
}));
jest.mock("../hooks/useNetworkStatus", () => ({ useNetworkStatus: jest.fn() }));
jest.mock("../services/mutationQueue", () => ({
  enqueueMutation: jest.fn(),
  retryMutation: jest.fn(),
  subscribeMutations: jest.fn(() => () => {}),
}));

// The real sheet is covered by its own tests; this stub signs with a fixed secret.
jest.mock("../components/SignTransactionSheet", () => {
  const { Pressable, Text } = require("react-native");
  return {
    SignTransactionSheet: ({
      sign,
      onSigned,
    }: {
      sign: (secret: string) => Promise<string>;
      onSigned: (xdr: string) => Promise<void>;
    }) => (
      <Pressable accessibilityRole="button" onPress={async () => onSigned(await sign("SECRET"))}>
        <Text>Sign</Text>
      </Pressable>
    ),
  };
});

const mockedPublishLink = publishLink as jest.MockedFunction<typeof publishLink>;
const mockedPublishFile = publishFile as jest.MockedFunction<typeof publishFile>;
const mockedGetDocumentAsync = getDocumentAsync as jest.MockedFunction<typeof getDocumentAsync>;
const mockedPollPublishStatus = pollPublishStatus as jest.MockedFunction<typeof pollPublishStatus>;
const mockedSign = signPaymentTransaction as jest.MockedFunction<typeof signPaymentTransaction>;
const mockedUseNetworkStatus = useNetworkStatus as jest.MockedFunction<typeof useNetworkStatus>;
const mockedEnqueueMutation = enqueueMutation as jest.MockedFunction<typeof enqueueMutation>;
const mockedRetryMutation = retryMutation as jest.MockedFunction<typeof retryMutation>;

const resource = {
  id: "res-1",
  title: "Stellar handbook",
  price: "1.5",
  resourceType: "link",
  walletAddress: "GABC",
  verificationStatus: "pending" as const,
  onchainStatus: "none" as const,
  listed: true,
  accessUrl: "https://api.example.com/resources/res-1",
};

const challenge = {
  x402Version: 2,
  accepted: {
    scheme: "exact",
    network: "stellar:testnet",
    asset: "CASSET",
    amount: "5000000",
    payTo: "GPAY",
    maxTimeoutSeconds: 60,
    extra: { areFeesSponsored: true },
  },
  resource: {},
};

const pickedAsset = {
  uri: "file:///cache/handbook.pdf",
  name: "handbook.pdf",
  size: 2048,
  mimeType: "application/pdf",
};

async function renderScreen() {
  const screen = render(
    <ThemeProvider>
      <ToastProvider>
        <PublishResourceScreen />
      </ToastProvider>
    </ThemeProvider>
  );
  await act(async () => {});
  return screen;
}

function fillForm(screen: Awaited<ReturnType<typeof renderScreen>>) {
  fireEvent.changeText(screen.getByLabelText("Title"), "Stellar handbook");
  fireEvent.changeText(screen.getByLabelText("URL"), "https://example.com/handbook");
  fireEvent.changeText(screen.getByLabelText("Price (USDC)"), "1.5");
  fireEvent.changeText(screen.getByLabelText("Description (optional)"), "A guide");
}

function fillFileForm(screen: Awaited<ReturnType<typeof renderScreen>>) {
  fireEvent.changeText(screen.getByLabelText("Title"), "Stellar handbook");
  fireEvent.changeText(screen.getByLabelText("Price (USDC)"), "1.5");
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedUseNetworkStatus.mockReturnValue({ isOffline: false });
  mockedPollPublishStatus.mockResolvedValue(undefined);
  mockedGetDocumentAsync.mockResolvedValue({ canceled: false, assets: [pickedAsset] });
});

it("shows validation errors and does not submit an invalid form", async () => {
  const screen = await renderScreen();

  fireEvent.press(screen.getByRole("button", { name: "Publish resource" }));

  expect(screen.getByText("Title is required.")).toBeTruthy();
  expect(screen.getByText("URL is required.")).toBeTruthy();
  expect(screen.getByText("Price is required.")).toBeTruthy();
  expect(mockedPublishLink).not.toHaveBeenCalled();

  fireEvent.changeText(screen.getByLabelText("Title"), "Fixed");
  expect(screen.queryByText("Title is required.")).toBeNull();
});

it("publishes and shows the new resource with its access URL", async () => {
  mockedPublishLink.mockResolvedValue({ type: "published", resource });
  const screen = await renderScreen();

  fillForm(screen);
  fireEvent.press(screen.getByRole("button", { name: "Publish resource" }));

  expect(await screen.findByText("Stellar handbook")).toBeTruthy();
  expect(screen.getByText(resource.accessUrl)).toBeTruthy();
  expect(mockedPublishLink).toHaveBeenCalledWith(
    {
      title: "Stellar handbook",
      url: "https://example.com/handbook",
      price: "1.5",
      description: "A guide",
    },
    undefined
  );

  fireEvent.press(screen.getByRole("button", { name: "Copy access URL" }));
  await waitFor(() =>
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith(resource.accessUrl)
  );

  fireEvent.press(screen.getByRole("button", { name: "View resource" }));
  expect(mockNavigate).toHaveBeenCalledWith("ResourceDetail", { resourceId: "res-1" });
});

it("shows the rejection reason reported by publish status polling", async () => {
  mockedPublishLink.mockResolvedValue({ type: "published", resource });
  mockedPollPublishStatus.mockImplementation(async (_id, onStatus) => {
    onStatus({ status: "rejected", verified: false, error: "Metadata mismatch" });
  });
  const screen = await renderScreen();

  fillForm(screen);
  fireEvent.press(screen.getByRole("button", { name: "Publish resource" }));

  expect(await screen.findByText("Verification failed: Metadata mismatch")).toBeTruthy();
  expect(screen.getByText("3. Verification Rejected")).toBeTruthy();
  expect(mockedPollPublishStatus).toHaveBeenCalledWith(
    "res-1",
    expect.any(Function),
    expect.any(Function)
  );
});

it("shows the on-chain transaction hash when sync finishes", async () => {
  mockedPublishLink.mockResolvedValue({ type: "published", resource });
  mockedPollPublishStatus.mockImplementation(async (_id, onStatus) => {
    onStatus({ status: "on-chain", verified: true, txHash: "abcdef1234567890abcdef" });
  });
  const screen = await renderScreen();

  fillForm(screen);
  fireEvent.press(screen.getByRole("button", { name: "Publish resource" }));

  expect(
    await screen.findByLabelText("On-chain transaction abcdef1234567890abcdef")
  ).toBeTruthy();
  expect(screen.getByText("Tx: abcdef12…abcdef")).toBeTruthy();
});

it("cancels publish status polling when the screen unmounts", async () => {
  mockedPublishLink.mockResolvedValue({ type: "published", resource });
  let isCancelled: (() => boolean) | undefined;
  mockedPollPublishStatus.mockImplementation(async (_id, _onStatus, cancelled) => {
    isCancelled = cancelled;
  });
  const screen = await renderScreen();

  fillForm(screen);
  fireEvent.press(screen.getByRole("button", { name: "Publish resource" }));
  await screen.findByText(resource.accessUrl);

  expect(isCancelled?.()).toBe(false);
  screen.unmount();
  expect(isCancelled?.()).toBe(true);
});

it("pays the verification fee and then publishes", async () => {
  mockedPublishLink
    .mockResolvedValueOnce({ type: "payment", challenge, fee: "0.5" })
    .mockResolvedValueOnce({ type: "published", resource });
  mockedSign.mockResolvedValue("signed-xdr");
  const screen = await renderScreen();

  fillForm(screen);
  fireEvent.press(screen.getByRole("button", { name: "Publish resource" }));

  expect(await screen.findByText(/one-time fee of 0.5 USDC/)).toBeTruthy();
  fireEvent.press(screen.getByRole("button", { name: "Pay 0.5 USDC and publish" }));
  fireEvent.press(await screen.findByText("Sign"));

  expect(await screen.findByText(resource.accessUrl)).toBeTruthy();
  expect(mockedSign).toHaveBeenCalledWith(challenge, "SECRET", "https://rpc.example.com");
  expect(mockedPublishLink).toHaveBeenLastCalledWith(expect.any(Object), {
    challenge,
    transaction: "signed-xdr",
  });
});

it("shows a server error and keeps the form", async () => {
  mockedPublishLink.mockRejectedValue(new Error("Unauthorized: Invalid API key"));
  const screen = await renderScreen();

  fillForm(screen);
  fireEvent.press(screen.getByRole("button", { name: "Publish resource" }));

  expect(await screen.findByText("Unauthorized: Invalid API key")).toBeTruthy();
  expect(screen.getByDisplayValue("Stellar handbook")).toBeTruthy();
});

it("queues the publish when offline and shows Queued without a spinner", async () => {
  mockedUseNetworkStatus.mockReturnValue({ isOffline: true });
  mockedEnqueueMutation.mockResolvedValue({
    id: "mut_1",
    kind: "publish",
    payload: { input: { title: "Stellar handbook", url: "https://example.com/handbook", price: "1.5", description: "A guide" }, title: "Stellar handbook" },
    idempotencyKey: "publish|Stellar handbook|https://example.com/handbook|1.5|A guide",
    enqueuedAt: 1,
    attempts: 0,
    status: "pending",
  });
  const screen = await renderScreen();
  fillForm(screen);

  fireEvent.press(screen.getByRole("button", { name: "Publish resource" }));

  expect(
    await screen.findByText("Saved on this device. It will be published automatically when you're back online.")
  ).toBeTruthy();
  expect(screen.getByText("Queued")).toBeTruthy();
  expect(mockedPublishLink).not.toHaveBeenCalled();
  expect(mockedEnqueueMutation).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: "publish",
      idempotencyKey: "publish|Stellar handbook|https://example.com/handbook|1.5|A guide",
    })
  );
  // No spinner anywhere in the Queued state.
  expect(screen.UNSAFE_queryAllByType(ActivityIndicator)).toHaveLength(0);
});

it("keeps a permanently failed queued publish visible with a retry action", async () => {
  mockedUseNetworkStatus.mockReturnValue({ isOffline: true });
  mockedEnqueueMutation.mockResolvedValue({
    id: "mut_2",
    kind: "publish",
    payload: { input: { title: "Stellar handbook", url: "https://example.com/handbook", price: "1.5", description: "A guide" }, title: "Stellar handbook" },
    idempotencyKey: "publish|Stellar handbook|https://example.com/handbook|1.5|A guide",
    enqueuedAt: 1,
    attempts: 1,
    status: "failed",
    lastError: "Server rejected the title.",
  });
  const screen = await renderScreen();
  fillForm(screen);
  fireEvent.press(screen.getByRole("button", { name: "Publish resource" }));

  expect(await screen.findByText("Server rejected the title.")).toBeTruthy();
  fireEvent.press(screen.getByRole("button", { name: "Retry queued publish" }));
  expect(mockedRetryMutation).toHaveBeenCalledWith("mut_2");
});

it("publishes a picked file as multipart", async () => {
  mockedPublishFile.mockResolvedValue({ type: "published", resource });
  const screen = await renderScreen();

  fireEvent.press(screen.getByRole("button", { name: "Publish a file" }));
  expect(screen.queryByLabelText("URL")).toBeNull();

  fireEvent.press(screen.getByRole("button", { name: "Choose a file" }));
  expect(await screen.findByLabelText("Selected file handbook.pdf")).toBeTruthy();

  fillFileForm(screen);
  fireEvent.press(screen.getByRole("button", { name: "Publish resource" }));

  expect(await screen.findByText(resource.accessUrl)).toBeTruthy();
  expect(mockedPublishFile).toHaveBeenCalledWith(
    expect.objectContaining({ title: "Stellar handbook", price: "1.5", file: pickedAsset }),
    expect.objectContaining({
      idempotencyKey: expect.any(String),
      onProgress: expect.any(Function),
      signal: expect.anything(),
    })
  );
  expect(mockedPublishLink).not.toHaveBeenCalled();
});

it("requires a file before publishing in file mode", async () => {
  const screen = await renderScreen();

  fireEvent.press(screen.getByRole("button", { name: "Publish a file" }));
  fillFileForm(screen);
  fireEvent.press(screen.getByRole("button", { name: "Publish resource" }));

  expect(await screen.findByText("Choose a file to publish.")).toBeTruthy();
  expect(mockedPublishFile).not.toHaveBeenCalled();
});

it("rejects an unsupported file type before uploading", async () => {
  mockedGetDocumentAsync.mockResolvedValue({
    canceled: false,
    assets: [{ ...pickedAsset, mimeType: "application/x-msdownload" }],
  });
  const screen = await renderScreen();

  fireEvent.press(screen.getByRole("button", { name: "Publish a file" }));
  fireEvent.press(screen.getByRole("button", { name: "Choose a file" }));
  await screen.findByLabelText("Selected file handbook.pdf");
  fillFileForm(screen);
  fireEvent.press(screen.getByRole("button", { name: "Publish resource" }));

  expect(
    await screen.findByText("Unsupported file type. Choose a PDF, an image or a text file.")
  ).toBeTruthy();
  expect(mockedPublishFile).not.toHaveBeenCalled();
});

it("blocks a file upload while offline", async () => {
  mockedUseNetworkStatus.mockReturnValue({ isOffline: true });
  const screen = await renderScreen();

  fireEvent.press(screen.getByRole("button", { name: "Publish a file" }));
  fireEvent.press(screen.getByRole("button", { name: "Choose a file" }));
  await screen.findByLabelText("Selected file handbook.pdf");
  fillFileForm(screen);
  fireEvent.press(screen.getByRole("button", { name: "Publish resource" }));

  expect(await screen.findByText("Connect to the internet to upload a file.")).toBeTruthy();
  expect(mockedPublishFile).not.toHaveBeenCalled();
  expect(mockedEnqueueMutation).not.toHaveBeenCalled();
});

it("shows upload progress and cancels the upload", async () => {
  mockedPublishFile.mockImplementation((_input, options) => {
    options?.onProgress?.(0.5);
    return new Promise<PublishResult>((_resolve, reject) => {
      options?.signal?.addEventListener("abort", () => reject(new Error("Upload cancelled.")));
    });
  });
  const screen = await renderScreen();

  fireEvent.press(screen.getByRole("button", { name: "Publish a file" }));
  fireEvent.press(screen.getByRole("button", { name: "Choose a file" }));
  await screen.findByLabelText("Selected file handbook.pdf");
  fillFileForm(screen);

  fireEvent.press(screen.getByRole("button", { name: "Publish resource" }));
  expect(await screen.findByLabelText("Upload progress")).toBeTruthy();
  expect(screen.getByLabelText("Upload progress").props.children).toContain(50);
  expect(screen.getByRole("button", { name: "Cancel upload" })).toBeTruthy();

  fireEvent.press(screen.getByRole("button", { name: "Cancel upload" }));
  expect(await screen.findByText("Upload cancelled.")).toBeTruthy();
});
