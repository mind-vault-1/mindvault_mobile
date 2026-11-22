import React from "react";
import { Linking } from "react-native";
import { act, fireEvent } from "@testing-library/react-native";

import { checkUsdcForPayment } from "../api/horizon";
import { appNetworkId, prepareResourceAccess, signPaymentTransaction, submitSignedPayment, type PaymentChallenge } from "../api/payment";
import { renderWithProviders } from "../test-utils";
import { PaywallModal } from "./PaywallModal";

jest.mock("../api/payment", () => ({
  appNetworkId: jest.fn(() => "stellar:testnet"),
  sorobanRpcUrl: jest.fn(() => "https://soroban-testnet.stellar.org"),
  prepareResourceAccess: jest.fn(), signPaymentTransaction: jest.fn(), submitSignedPayment: jest.fn(),
}));
jest.mock("../utils/validateStellarSecret", () => ({
  validateStellarSecret: (secret: string) => ({ isValid: secret === "S-test-secret", errorMessage: "Enter a key" }),
}));
jest.mock("../api/horizon", () => ({
  checkUsdcForPayment: jest.fn(),
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
  expect(mockPrepare).toHaveBeenCalledWith(props.accessUrl, props.price);
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
