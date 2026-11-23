import React from "react";
import { Linking } from "react-native";
import { act, fireEvent, waitFor } from "@testing-library/react-native";

import { checkUsdcForPayment } from "../api/horizon";
import { appNetworkId, prepareResourceAccess, signPaymentTransaction, submitSignedPayment, type PaymentChallenge } from "../api/payment";
import { renderWithProviders } from "../test-utils";
import { PaywallModal } from "./PaywallModal";

jest.mock("../api/payment", () => ({
  appNetworkId: jest.fn(() => "stellar:testnet"),
  sorobanRpcUrl: jest.fn(() => "https://soroban-testnet.stellar.org"),
  prepareResourceAccess: jest.fn(), signPaymentTransaction: jest.fn(), submitSignedPayment: jest.fn(),
  priceToAtomicUnits: jest.fn((value: string) => {
    const [whole, fraction = ""] = value.trim().split(".");
    return BigInt(`${whole}${fraction.padEnd(7, "0").slice(0, 7)}`);
  }),
}));
jest.mock("../utils/validateStellarSecret", () => ({
  validateStellarSecret: (secret: string) => ({ isValid: secret === "S-test-secret", errorMessage: "Enter a key" }),
}));
jest.mock("../api/horizon", () => ({
  checkUsdcForPayment: jest.fn(),
}));
jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn().mockResolvedValue(undefined) }));
jest.mock("./ToastProvider", () => ({
  useToast: () => ({ show: jest.fn(), success: jest.fn(), error: jest.fn(), info: jest.fn() }),
}));
jest.mock("../services/wallet", () => ({
  getPublicKey: jest.fn().mockResolvedValue("GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7"),
}));
jest.mock("@react-navigation/native", () => ({
  ...jest.requireActual("@react-navigation/native"),
  useNavigation: () => ({
    navigate: (...args: unknown[]) => mockNavigate(...args),
    goBack: jest.fn(),
  }),
}));

const mockPrepare = prepareResourceAccess as jest.MockedFunction<typeof prepareResourceAccess>;
const mockSign = signPaymentTransaction as jest.MockedFunction<typeof signPaymentTransaction>;
const mockSubmit = submitSignedPayment as jest.MockedFunction<typeof submitSignedPayment>;
const mockNetwork = appNetworkId as jest.MockedFunction<typeof appNetworkId>;
const mockCheckUsdc = checkUsdcForPayment as jest.MockedFunction<typeof checkUsdcForPayment>;
const mockNavigate = jest.fn();
const challenge: PaymentChallenge = {
  x402Version: 2, resource: { url: "https://api.example.com/resources/book", description: "Handbook" },
  accepted: { scheme: "exact", network: "stellar:testnet", amount: "12500000", asset: "C-USDC", payTo: "G-payee", maxTimeoutSeconds: 60, extra: { areFeesSponsored: true } },
};
const props = { visible: true, accessUrl: "https://api.example.com/resources/book", resourceTitle: "Handbook", price: "1.25", resourceId: "res-1", onClose: jest.fn() };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockNetwork.mockReturnValue("stellar:testnet");
  mockCheckUsdc.mockResolvedValue({ status: "ok" });
  mockPrepare.mockResolvedValue({ type: "payment", challenge });
  mockSign.mockResolvedValue("signed-payment-xdr");
  mockSubmit.mockResolvedValue({ type: "text", content: "Unlocked content" });
});

afterEach(() => { jest.restoreAllMocks(); });

async function startSigning(screen: ReturnType<typeof renderWithProviders>) {
  fireEvent.press(await screen.findByText("Pay & Access"));
  const input = await screen.findByLabelText("Stellar secret key");
  fireEvent.changeText(input, "S-test-secret");
  await act(async () => { fireEvent.press(screen.getByRole("button", { name: "Sign" })); });
}

it.each([ ["stellar:testnet", "Stellar testnet"], ["stellar:pubnet", "Stellar mainnet"] ])("confirms the price and %s network before requesting payment", async (network, label) => {
  mockNetwork.mockReturnValue(network);
  const screen = renderWithProviders(<PaywallModal {...props} />);
  expect(await screen.findByText(new RegExp(`1.25 USDC.*${label}`))).toBeTruthy();
  expect(mockPrepare).not.toHaveBeenCalled();
});

it("does not check USDC or request a challenge when the sheet is closed before paying", () => {
  const screen = renderWithProviders(<PaywallModal {...props} />);
  fireEvent.press(screen.getByLabelText("Close payment"));

  expect(mockCheckUsdc).not.toHaveBeenCalled();
  expect(mockPrepare).not.toHaveBeenCalled();
});

it("blocks payment with an actionable message and a Wallet link when USDC is missing", async () => {
  mockCheckUsdc.mockResolvedValueOnce({
    status: "missing-trustline",
    message: "Your wallet needs a USDC trustline before you can pay.",
  });
  const screen = renderWithProviders(<PaywallModal {...props} />);

  fireEvent.press(await screen.findByText("Pay & Access"));

  expect(await screen.findByText("Your wallet needs a USDC trustline before you can pay.")).toBeTruthy();
  const walletLink = await screen.findByLabelText("Open Wallet");
  fireEvent.press(walletLink);
  expect(mockNavigate).toHaveBeenCalledWith("Wallet");
  expect(mockPrepare).not.toHaveBeenCalled();
  expect(mockCheckUsdc).toHaveBeenCalledWith("1.25", expect.objectContaining({ signal: expect.any(Object) }));
});

it("warns but continues when the USDC check is unavailable", async () => {
  mockCheckUsdc.mockResolvedValueOnce({
    status: "unavailable",
    warning: "Couldn't check your USDC balance right now.",
  });
  const prepare = deferred<Awaited<ReturnType<typeof prepareResourceAccess>>>();
  mockPrepare.mockReturnValue(prepare.promise);
  const screen = renderWithProviders(<PaywallModal {...props} />);

  fireEvent.press(await screen.findByText("Pay & Access"));

  expect(await screen.findByText("Couldn't check your USDC balance right now.")).toBeTruthy();
  expect(mockPrepare).toHaveBeenCalledTimes(1);
  await act(async () => { prepare.resolve({ type: "payment", challenge }); });
  expect(await screen.findByLabelText("Stellar secret key")).toBeTruthy();
});

it("requires typed confirmation before paying above the per-payment limit", async () => {
  const screen = renderWithProviders(<PaywallModal {...props} price="10.00" />);
  fireEvent.press(await screen.findByText("Pay & Access"));

  expect(await screen.findByLabelText("Confirm high payment")).toBeTruthy();
  expect(mockPrepare).not.toHaveBeenCalled();

  fireEvent.changeText(screen.getByLabelText("Confirm high payment"), "CONFIRM");
  await act(async () => {
    fireEvent.press(screen.getByLabelText("Confirm high payment button"));
  });

  await waitFor(() => expect(mockPrepare).toHaveBeenCalledWith(props.accessUrl, "10.00"));
});

it("shows challenge, signing and settlement progress and then text content", async () => {
  const prepare = deferred<Awaited<ReturnType<typeof prepareResourceAccess>>>();
  const sign = deferred<string>();
  const settle = deferred<Awaited<ReturnType<typeof submitSignedPayment>>>();
  mockPrepare.mockReturnValue(prepare.promise);
  mockSign.mockReturnValue(sign.promise);
  mockSubmit.mockReturnValue(settle.promise);
  const screen = renderWithProviders(<PaywallModal {...props} />);
  fireEvent.press(await screen.findByText("Pay & Access"));
  expect(screen.getByText("Getting payment challenge…")).toBeTruthy();
  await waitFor(() => expect(mockPrepare).toHaveBeenCalledWith(props.accessUrl, props.price));
  await act(async () => { prepare.resolve({ type: "payment", challenge }); });
  fireEvent.changeText(screen.getByLabelText("Stellar secret key"), "S-test-secret");
  await act(async () => { fireEvent.press(screen.getByRole("button", { name: "Sign" })); });
  expect(screen.getByText("Signing payment…")).toBeTruthy();
  await act(async () => { sign.resolve("signed-payment-xdr"); });
  expect(screen.getByText("Settling payment…")).toBeTruthy();
  expect(mockSubmit).toHaveBeenCalledWith(props.accessUrl, challenge, "signed-payment-xdr");
  await act(async () => { settle.resolve({ type: "text", content: "Unlocked content" }); });
  expect(screen.getByText("Unlocked content")).toBeTruthy();
  expect(screen.queryByLabelText("Stellar secret key")).toBeNull();
});

it("renders markdown and JSON unlocked content through ContentViewer", async () => {
  mockSubmit.mockResolvedValueOnce({ type: "text", content: "# Guide\nSome **bold** text" });
  const screen = renderWithProviders(<PaywallModal {...props} />);
  await startSigning(screen);
  expect(await screen.findByText("Guide")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Copy content" })).toBeTruthy();

  mockSubmit.mockResolvedValueOnce({ type: "text", content: '{"title":"Book"}' });
  const jsonScreen = renderWithProviders(<PaywallModal {...props} />);
  await startSigning(jsonScreen);
  expect(await jsonScreen.findByText(/"title": "Book"/)).toBeTruthy();
});

it("opens external content after settlement and closes", async () => {
  mockSubmit.mockResolvedValue({ type: "external", url: "https://example.com/book.pdf" });
  const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
  const screen = renderWithProviders(<PaywallModal {...props} />);
  await startSigning(screen);
  await act(async () => {});
  expect(open).toHaveBeenCalledWith("https://example.com/book.pdf");
  expect(props.onClose).toHaveBeenCalled();
});

it("retries opening settled external content without paying again", async () => {
  mockSubmit.mockResolvedValue({ type: "external", url: "https://example.com/book.pdf" });
  const open = jest.spyOn(Linking, "openURL")
    .mockRejectedValueOnce(new Error("Browser unavailable"))
    .mockResolvedValueOnce(true);
  const screen = renderWithProviders(<PaywallModal {...props} />);
  await startSigning(screen);
  expect(await screen.findByText("Browser unavailable")).toBeTruthy();
  fireEvent.press(screen.getByText("Retry"));
  await act(async () => {});
  expect(open).toHaveBeenCalledTimes(2);
  expect(mockSubmit).toHaveBeenCalledTimes(1);
  expect(mockPrepare).toHaveBeenCalledTimes(1);
  expect(props.onClose).toHaveBeenCalled();
});

it("shows a retryable server error", async () => {
  mockPrepare.mockRejectedValueOnce(new Error("Storage offline"));
  const screen = renderWithProviders(<PaywallModal {...props} />);
  fireEvent.press(await screen.findByText("Pay & Access"));
  expect(await screen.findByText("Storage offline")).toBeTruthy();
  fireEvent.press(screen.getByText("Retry"));
  expect(await screen.findByLabelText("Stellar secret key")).toBeTruthy();
  expect(mockPrepare).toHaveBeenCalledTimes(2);
});

it("surfaces the simulation message and allows a fresh retry", async () => {
  mockSign.mockRejectedValueOnce(new Error("The payment simulation failed: insufficient balance"));
  const screen = renderWithProviders(<PaywallModal {...props} />);
  await startSigning(screen);
  expect(await screen.findByText("The payment simulation failed: insufficient balance")).toBeTruthy();
  expect(mockSubmit).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText("Retry"));
  expect(await screen.findByLabelText("Stellar secret key")).toBeTruthy();
});

it("shows the settlement error and allows retry", async () => {
  mockSubmit.mockRejectedValueOnce(new Error("Facilitator unavailable"));
  const screen = renderWithProviders(<PaywallModal {...props} />);
  await startSigning(screen);
  expect(await screen.findByText("Facilitator unavailable")).toBeTruthy();
  fireEvent.press(screen.getByText("Retry"));
  expect(await screen.findByLabelText("Stellar secret key")).toBeTruthy();
});

it("ignores a challenge that finishes after closing and reopening", async () => {
  const pending = deferred<Awaited<ReturnType<typeof prepareResourceAccess>>>();
  mockPrepare.mockReturnValue(pending.promise);
  const screen = renderWithProviders(<PaywallModal {...props} />);
  fireEvent.press(await screen.findByText("Pay & Access"));
  fireEvent.press(screen.getByLabelText("Close payment"));
  screen.rerender(<PaywallModal {...props} visible={false} />);
  screen.rerender(<PaywallModal {...props} />);
  await act(async () => { pending.resolve({ type: "payment", challenge }); });
  expect(screen.getByText("Pay & Access")).toBeTruthy();
  expect(screen.queryByLabelText("Stellar secret key")).toBeNull();
  expect(mockSubmit).not.toHaveBeenCalled();
});

it("closes the key sheet on cancel and never settles a signature completed after close", async () => {
  const pending = deferred<string>();
  mockSign.mockReturnValue(pending.promise);
  const screen = renderWithProviders(<PaywallModal {...props} />);
  fireEvent.press(await screen.findByText("Pay & Access"));
  fireEvent.press(await screen.findByText("Cancel"));
  expect(props.onClose).toHaveBeenCalled();
  expect(screen.queryByLabelText("Stellar secret key")).toBeNull();
  fireEvent.press(screen.getByText("Pay & Access"));
  fireEvent.changeText(await screen.findByLabelText("Stellar secret key"), "S-test-secret");
  await act(async () => { fireEvent.press(screen.getByRole("button", { name: "Sign" })); });
  fireEvent.press(screen.getByLabelText("Close payment"));
  screen.rerender(<PaywallModal {...props} visible={false} />);
  await act(async () => { pending.resolve("late-signature"); });
  expect(mockSubmit).not.toHaveBeenCalled();
});

it("ignores a settlement finishing after close and starts clean on reopening", async () => {
  const pending = deferred<Awaited<ReturnType<typeof submitSignedPayment>>>();
  mockSubmit.mockReturnValue(pending.promise);
  const screen = renderWithProviders(<PaywallModal {...props} />);
  await startSigning(screen);
  await screen.findByText("Settling payment…");
  fireEvent.press(screen.getByLabelText("Close payment"));
  screen.rerender(<PaywallModal {...props} visible={false} />);
  await act(async () => { pending.resolve({ type: "text", content: "Late content" }); });
  screen.rerender(<PaywallModal {...props} />);
  expect(screen.queryByText("Late content")).toBeNull();
  expect(screen.getByText("Pay & Access")).toBeTruthy();
});

it("does not apply pending work after unmount", async () => {
  const pending = deferred<Awaited<ReturnType<typeof prepareResourceAccess>>>();
  mockPrepare.mockReturnValue(pending.promise);
  const screen = renderWithProviders(<PaywallModal {...props} />);
  fireEvent.press(await screen.findByText("Pay & Access"));
  screen.unmount();
  await act(async () => { pending.resolve({ type: "payment", challenge }); });
  expect(mockSign).not.toHaveBeenCalled();
  expect(mockSubmit).not.toHaveBeenCalled();
});

describe("spending guard", () => {
  it("does not ask for confirmation when the price is exactly the limit", async () => {
    const screen = renderWithProviders(<PaywallModal {...props} price="5.00" />);
    fireEvent.press(await screen.findByText("Pay & Access"));

    await waitFor(() => expect(mockPrepare).toHaveBeenCalledWith(props.accessUrl, "5.00"));
    expect(screen.queryByLabelText("Confirm high payment")).toBeNull();
    expect(screen.queryByText(/above your spending limit/)).toBeNull();
  });

  it("warns up front when the price is above the limit", async () => {
    const screen = renderWithProviders(<PaywallModal {...props} price="5.01" />);

    expect(await screen.findByText(/above your spending limit/)).toBeTruthy();
    expect(screen.getByLabelText("Spending limit 5.00 USDC per payment")).toBeTruthy();
    expect(mockPrepare).not.toHaveBeenCalled();
  });

  it("keeps the payment blocked until CONFIRM is typed, in any letter case", async () => {
    const screen = renderWithProviders(<PaywallModal {...props} price="10.00" />);
    fireEvent.press(await screen.findByText("Pay & Access"));
    const input = await screen.findByLabelText("Confirm high payment");

    fireEvent.changeText(input, "yes");
    await act(async () => { fireEvent.press(screen.getByLabelText("Confirm high payment button")); });
    expect(mockPrepare).not.toHaveBeenCalled();
    expect(mockCheckUsdc).not.toHaveBeenCalled();

    fireEvent.changeText(input, " confirm ");
    await act(async () => { fireEvent.press(screen.getByLabelText("Confirm high payment button")); });
    await waitFor(() => expect(mockPrepare).toHaveBeenCalledTimes(1));
    expect(screen.queryByLabelText("Confirm high payment")).toBeNull();
  });

  it("asks again after the sheet is closed and reopened", async () => {
    const screen = renderWithProviders(<PaywallModal {...props} price="10.00" />);
    fireEvent.press(await screen.findByText("Pay & Access"));
    fireEvent.changeText(await screen.findByLabelText("Confirm high payment"), "CONFIRM");
    await act(async () => { fireEvent.press(screen.getByLabelText("Confirm high payment button")); });
    await waitFor(() => expect(mockPrepare).toHaveBeenCalledTimes(1));

    screen.rerender(<PaywallModal {...props} price="10.00" visible={false} />);
    screen.rerender(<PaywallModal {...props} price="10.00" />);
    fireEvent.press(await screen.findByText("Pay & Access"));

    expect(await screen.findByLabelText("Confirm high payment")).toBeTruthy();
    expect(mockPrepare).toHaveBeenCalledTimes(1);
  });
});

describe("payment errors", () => {
  it("blocks payment and links to the wallet when the balance is insufficient", async () => {
    mockCheckUsdc.mockResolvedValueOnce({
      status: "insufficient-balance",
      message: "You need at least 1.25 USDC to pay for this resource.",
    });
    const screen = renderWithProviders(<PaywallModal {...props} />);
    fireEvent.press(await screen.findByText("Pay & Access"));

    expect(await screen.findByText("You need at least 1.25 USDC to pay for this resource.")).toBeTruthy();
    expect(screen.getByLabelText("Open Wallet")).toBeTruthy();
    expect(mockPrepare).not.toHaveBeenCalled();
  });

  it("uses a generic message when the failure is not an Error", async () => {
    mockPrepare.mockRejectedValueOnce("boom");
    const screen = renderWithProviders(<PaywallModal {...props} />);
    fireEvent.press(await screen.findByText("Pay & Access"));

    expect(await screen.findByText("Unable to access this resource. Please try again.")).toBeTruthy();
  });

  it("hides the wallet link on a later, unrelated error", async () => {
    mockCheckUsdc.mockResolvedValueOnce({ status: "missing-trustline", message: "Add a USDC trustline." });
    const screen = renderWithProviders(<PaywallModal {...props} />);
    fireEvent.press(await screen.findByText("Pay & Access"));
    expect(await screen.findByLabelText("Open Wallet")).toBeTruthy();

    mockPrepare.mockRejectedValueOnce(new Error("Storage offline"));
    fireEvent.press(screen.getByText("Retry"));

    expect(await screen.findByText("Storage offline")).toBeTruthy();
    expect(screen.queryByLabelText("Open Wallet")).toBeNull();
  });

  it("settles only once when Pay is pressed repeatedly", async () => {
    const pending = deferred<Awaited<ReturnType<typeof prepareResourceAccess>>>();
    mockPrepare.mockReturnValue(pending.promise);
    const screen = renderWithProviders(<PaywallModal {...props} />);
    const pay = await screen.findByText("Pay & Access");

    fireEvent.press(pay);
    fireEvent.press(pay);
    await act(async () => { pending.resolve({ type: "payment", challenge }); });

    expect(mockPrepare).toHaveBeenCalledTimes(1);
    expect(mockCheckUsdc).toHaveBeenCalledTimes(1);
  });
});

it("hands unlocked text to ContentViewer with its copy action", async () => {
  mockSubmit.mockResolvedValueOnce({ type: "text", content: "Plain unlocked text" });
  const screen = renderWithProviders(<PaywallModal {...props} />);
  await startSigning(screen);

  expect(await screen.findByLabelText("Unlocked content")).toBeTruthy();
  expect(screen.getByText("Plain unlocked text")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Copy content" })).toBeTruthy();
});
