import { Keypair } from "@stellar/stellar-sdk";
import React from "react";
import { AccessibilityInfo } from "react-native";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";

import { prepareOwnershipTransfer, submitOwnershipTransfer } from "../api/resources";
import { getNetworkConfig } from "../config/network";
import { renderWithProviders } from "../test-utils";
import type { Resource } from "../types";
import { openExternalUrl, stellarExpertTxUrl } from "../utils/stellarExpert";
import { TransferOwnershipModal } from "./TransferOwnershipModal";

type ScanHandler = (event: { data: string }) => void;
let mockOnBarcodeScanned: ScanHandler | undefined;
let mockPermission: { granted: boolean } | null = { granted: true };
const mockRequestPermission = jest.fn();

jest.mock("expo-camera", () => ({
  CameraView: (props: { onBarcodeScanned: ScanHandler }) => {
    mockOnBarcodeScanned = props.onBarcodeScanned;
    return null;
  },
  useCameraPermissions: () => [mockPermission, mockRequestPermission],
}));

jest.mock("../api/resources", () => ({
  prepareOwnershipTransfer: jest.fn(),
  submitOwnershipTransfer: jest.fn(),
}));

jest.mock("../utils/stellarExpert", () => ({
  openExternalUrl: jest.fn(() => Promise.resolve()),
  stellarExpertTxUrl: jest.fn(({ txHash }: { txHash: string }) => `https://explorer.test/tx/${txHash}`),
}));

jest.mock("../utils/haptics", () => ({ hapticImpact: jest.fn(() => Promise.resolve()) }));

// The signer is mocked: "Sign" returns `mockSignedXdr`, "Cancel signing" backs out.
const mockSheetProps = jest.fn();
let mockSignedXdr = "signed-xdr";
jest.mock("./SignTransactionSheet", () => {
  const { Pressable, Text, View } = require("react-native");
  return {
    SignTransactionSheet: (props: {
      visible: boolean;
      onSigned: (xdr: string) => void;
      onCancel: () => void;
    }) => {
      mockSheetProps(props);
      if (!props.visible) return null;
      return (
        <View>
          <Pressable accessibilityRole="button" onPress={() => props.onSigned(mockSignedXdr)}>
            <Text>Sign</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={props.onCancel}>
            <Text>Cancel signing</Text>
          </Pressable>
        </View>
      );
    },
  };
});

const mockedPrepare = prepareOwnershipTransfer as jest.Mock;
const mockedSubmit = submitOwnershipTransfer as jest.Mock;
const mockedOpenExternalUrl = openExternalUrl as jest.Mock;
const destination = Keypair.random().publicKey();

const resource: Resource = {
  id: "res-1",
  title: "Handbook",
  price: "1.25",
  resourceType: "file",
  walletAddress: "GSELLER",
  verificationStatus: "verified",
  onchainStatus: "registered",
  listed: true,
  accessUrl: "https://api.example.com/resources/res-1",
};

function renderModal(overrides: Partial<React.ComponentProps<typeof TransferOwnershipModal>> = {}) {
  const props = { resource, visible: true, onClose: jest.fn(), onSuccess: jest.fn(), ...overrides };
  const utils = renderWithProviders(<TransferOwnershipModal {...props} />);
  return { ...utils, props };
}

const button = (name: string) => screen.getByRole("button", { name });
const isDisabled = (name: string) => button(name).props.accessibilityState?.disabled === true;

function scan(data: string) {
  act(() => mockOnBarcodeScanned?.({ data }));
}

async function press(name: string) {
  await act(async () => {
    fireEvent.press(button(name));
  });
}

function enterDestination(value = destination) {
  fireEvent.changeText(screen.getByLabelText("Destination Stellar address"), value);
}

/** Destination entry → confirmation → typed TRANSFER → confirm. */
async function confirmTransfer() {
  enterDestination();
  await press("Continue to transfer confirmation");
  fireEvent.changeText(
    screen.getByLabelText("Type TRANSFER to confirm ownership transfer"),
    "TRANSFER"
  );
  await press("Confirm ownership transfer");
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPermission = { granted: true };
  mockOnBarcodeScanned = undefined;
  mockSignedXdr = "signed-xdr";
  mockedPrepare.mockResolvedValue({
    unsignedXdr: "unsigned-xdr",
    networkPassphrase: "Test SDF Network ; September 2015",
  });
  mockedSubmit.mockResolvedValue({ txHash: "tx-hash-1" });
});

describe("destination step", () => {
  it("renders the title, resource and a disabled Continue until the address is valid", () => {
    renderModal();
    expect(screen.getByRole("header", { name: "Transfer Ownership" })).toBeTruthy();
    expect(screen.getByText("Resource: Handbook")).toBeTruthy();
    expect(isDisabled("Continue to transfer confirmation")).toBe(true);

    enterDestination("GNOTVALID");
    expect(screen.getByRole("alert", { name: "Enter a valid Stellar public key (starts with G)." })).toBeTruthy();
    expect(isDisabled("Continue to transfer confirmation")).toBe(true);

    enterDestination();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(isDisabled("Continue to transfer confirmation")).toBe(false);
  });

  it("scans a destination QR, validates it and fills the address", async () => {
    renderModal();
    await press("Scan destination QR");
    expect(mockOnBarcodeScanned).toBeDefined();
    scan(destination.toLowerCase());
    await waitFor(() => expect(screen.getByDisplayValue(destination.toUpperCase())).toBeTruthy());
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(
      "Destination address scanned and validated."
    );
    expect(isDisabled("Continue to transfer confirmation")).toBe(false);
  });

  it("shows an accessible error for an invalid scanned code", async () => {
    renderModal();
    await press("Scan destination QR");
    scan("not-a-stellar-key");
    expect(
      screen.getByRole("alert", { name: "Scanned code is not a valid Stellar public address." })
    ).toBeTruthy();
    expect(screen.queryByDisplayValue(destination)).toBeNull();
    expect(mockedPrepare).not.toHaveBeenCalled();

    await press("Cancel scan");
    expect(
      screen.queryByRole("alert", { name: "Scanned code is not a valid Stellar public address." })
    ).toBeNull();
    // The main sheet keeps explaining why the address wasn't filled.
    expect(
      screen.getByRole("alert", { name: "Scanned code is not a valid Stellar public key." })
    ).toBeTruthy();
  });

  it("shows the permission request when camera access is missing", async () => {
    mockPermission = { granted: false };
    renderModal();
    await press("Scan destination QR");
    expect(screen.getByRole("header", { name: "Camera access is required" })).toBeTruthy();
    await press("Grant Permission");
    expect(mockRequestPermission).toHaveBeenCalled();
  });

  it("shows a waiting message while the permission is unknown", async () => {
    mockPermission = null;
    renderModal();
    await press("Scan destination QR");
    expect(screen.getByText("Requesting camera permission…")).toBeTruthy();
  });
});

describe("confirmation step", () => {
  it("requires typed confirmation after showing address, resource and network", async () => {
    renderModal();
    enterDestination();
    await press("Continue to transfer confirmation");

    const network = getNetworkConfig();
    expect(screen.getByRole("header", { name: "Confirm ownership transfer" })).toBeTruthy();
    expect(
      screen.getByRole("alert", {
        name: "This transfer is irreversible on-chain. Check every detail before continuing.",
      })
    ).toBeTruthy();
    expect(screen.getByLabelText(`Destination address ${destination}`)).toBeTruthy();
    expect(screen.getByLabelText("Resource Handbook, id res-1")).toBeTruthy();
    expect(screen.getByLabelText(`Network ${network.label}, passphrase ${network.passphrase}`)).toBeTruthy();

    expect(isDisabled("Confirm ownership transfer")).toBe(true);
    fireEvent.changeText(screen.getByLabelText("Type TRANSFER to confirm ownership transfer"), "transfer");
    expect(isDisabled("Confirm ownership transfer")).toBe(false);
    expect(mockedPrepare).not.toHaveBeenCalled();

    await press("Confirm ownership transfer");
    expect(mockedPrepare).toHaveBeenCalledWith("res-1", destination.toUpperCase());
  });

  it("goes back to destination entry and clears the typed confirmation", async () => {
    renderModal();
    enterDestination();
    await press("Continue to transfer confirmation");
    fireEvent.changeText(screen.getByLabelText("Type TRANSFER to confirm ownership transfer"), "TRANSFER");

    await press("Back to destination entry");
    expect(screen.getByDisplayValue(destination)).toBeTruthy();

    await press("Continue to transfer confirmation");
    expect(screen.getByLabelText("Type TRANSFER to confirm ownership transfer").props.value).toBe("");
  });
});

describe("transaction steps", () => {
  it("shows the preparing step, then hands the transaction to the signer", async () => {
    const prepare = deferred<{ unsignedXdr: string; networkPassphrase: string }>();
    mockedPrepare.mockReturnValue(prepare.promise);
    renderModal();
    await confirmTransfer();

    expect(screen.getByRole("progressbar", { name: "Preparing transaction…" })).toBeTruthy();
    // Nothing can be changed or cancelled while the transaction is built.
    expect(isDisabled("Continue to transfer confirmation")).toBe(true);
    expect(isDisabled("Cancel transfer")).toBe(true);
    expect(isDisabled("Scan destination QR")).toBe(true);

    await act(async () => prepare.resolve({ unsignedXdr: "unsigned-xdr", networkPassphrase: "Test" }));
    expect(button("Sign")).toBeTruthy();
    expect(mockSheetProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        visible: true,
        unsignedXdr: "unsigned-xdr",
        networkPassphrase: "Test",
        action: "transfer ownership of this resource",
      })
    );
  });

  it("keeps the signer up while the signed transaction is submitted", async () => {
    const submit = deferred<{ txHash: string }>();
    mockedSubmit.mockReturnValue(submit.promise);
    renderModal();
    await confirmTransfer();
    await press("Sign");

    expect(mockedSubmit).toHaveBeenCalledWith("res-1", "signed-xdr", destination.toUpperCase());
    expect(button("Sign")).toBeTruthy();
    expect(screen.queryByRole("header", { name: "Transfer Ownership" })).toBeNull();

    await act(async () => submit.resolve({ txHash: "tx-hash-1" }));
    expect(screen.queryByRole("button", { name: "Sign" })).toBeNull();
    expect(screen.getByText("✓ Ownership transferred!")).toBeTruthy();
  });

  it("returns to destination entry when signing is cancelled", async () => {
    renderModal();
    await confirmTransfer();
    await press("Cancel signing");

    expect(button("Continue to transfer confirmation")).toBeTruthy();
    expect(mockedSubmit).not.toHaveBeenCalled();
  });
});

describe("success", () => {
  it("completes a confirmed transfer and reports the tx hash", async () => {
    const { props } = renderModal();
    await confirmTransfer();
    await press("Sign");

    expect(mockedSubmit).toHaveBeenCalledWith("res-1", "signed-xdr", destination.toUpperCase());
    expect(screen.getByText("Tx: tx-hash-1")).toBeTruthy();
    await press("Done");
    expect(props.onSuccess).toHaveBeenCalledWith("tx-hash-1");
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("opens the transaction in the explorer", async () => {
    renderModal();
    await confirmTransfer();
    await press("Sign");

    await act(async () => {
      fireEvent.press(screen.getByRole("link", { name: "View transaction in explorer" }));
    });
    expect(stellarExpertTxUrl).toHaveBeenCalledWith({ txHash: "tx-hash-1" });
    expect(mockedOpenExternalUrl).toHaveBeenCalledWith("https://explorer.test/tx/tx-hash-1");
  });

  it("finishes without an explorer link when the server returns no hash", async () => {
    mockedSubmit.mockResolvedValue({});
    const { props } = renderModal();
    await confirmTransfer();
    await press("Sign");

    expect(screen.queryByRole("link")).toBeNull();
    await press("Done");
    expect(props.onSuccess).toHaveBeenCalledWith(null);
  });
});

describe("errors", () => {
  it("shows a prepare failure and retries the transfer", async () => {
    mockedPrepare.mockRejectedValueOnce(new Error("Resource is not registered"));
    const { props } = renderModal();
    await confirmTransfer();

    expect(screen.getByRole("alert", { name: "Resource is not registered" })).toBeTruthy();
    // The destination is kept so the user can retry straight away.
    expect(screen.getByDisplayValue(destination)).toBeTruthy();

    await press("Continue to transfer confirmation");
    await press("Confirm ownership transfer");
    expect(mockedPrepare).toHaveBeenCalledTimes(2);
    await press("Sign");
    await press("Done");
    expect(props.onSuccess).toHaveBeenCalledWith("tx-hash-1");
  });

  it("shows a submit failure and lets the user sign again", async () => {
    mockedSubmit.mockRejectedValueOnce(new Error("tx_bad_auth"));
    renderModal();
    await confirmTransfer();
    await press("Sign");

    expect(screen.getByRole("alert", { name: "tx_bad_auth" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Sign" })).toBeNull();

    await press("Continue to transfer confirmation");
    await press("Confirm ownership transfer");
    await press("Sign");
    expect(mockedSubmit).toHaveBeenCalledTimes(2);
    expect(screen.getByText("✓ Ownership transferred!")).toBeTruthy();
  });

  it("uses a generic message for non-Error failures", async () => {
    mockedPrepare.mockRejectedValueOnce("boom");
    renderModal();
    await confirmTransfer();
    expect(screen.getByRole("alert", { name: "Transfer failed." })).toBeTruthy();
  });

  it("refuses a transaction that comes back unsigned", async () => {
    mockSignedXdr = "unsigned-xdr";
    renderModal();
    await confirmTransfer();
    await press("Sign");

    expect(
      screen.getByRole("alert", { name: "The transaction must be signed before submission." })
    ).toBeTruthy();
    expect(mockedSubmit).not.toHaveBeenCalled();
  });
});

describe("closing", () => {
  it("resets the address, confirmation and errors on cancel", async () => {
    const { props } = renderModal();
    enterDestination("GNOTVALID");
    expect(screen.getByRole("alert")).toBeTruthy();

    await press("Cancel transfer");
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onSuccess).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Destination Stellar address").props.value).toBe("");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("resets after an error so the next open starts fresh", async () => {
    mockedPrepare.mockRejectedValueOnce(new Error("Resource is not registered"));
    const { props } = renderModal();
    await confirmTransfer();
    await press("Cancel transfer");

    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByLabelText("Destination Stellar address").props.value).toBe("");
    expect(isDisabled("Continue to transfer confirmation")).toBe(true);
  });

  it("resets after a completed transfer", async () => {
    renderModal();
    await confirmTransfer();
    await press("Sign");
    await press("Done");

    expect(screen.queryByText("✓ Ownership transferred!")).toBeNull();
    expect(screen.getByLabelText("Destination Stellar address").props.value).toBe("");
  });

  it("closes the scanner without leaving it open", async () => {
    renderModal();
    await press("Scan destination QR");
    expect(screen.getByText("Point at a QR code containing a Stellar public address")).toBeTruthy();
    await press("Cancel scan");
    expect(screen.queryByText("Point at a QR code containing a Stellar public address")).toBeNull();
  });
});

describe("in French", () => {
  const { setLocale } = jest.requireActual("../i18n");
  beforeEach(() => setLocale("fr"));
  afterEach(() => setLocale("en"));

  it("renders each step through the translation catalogue", async () => {
    renderModal();
    expect(screen.getByRole("header", { name: "Transférer la propriété" })).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText("Adresse Stellar de destination"), destination);
    await press("Continuer vers la confirmation du transfert");
    expect(screen.getByRole("header", { name: "Confirmer le transfert de propriété" })).toBeTruthy();
    // The typed phrase itself stays TRANSFER in every language.
    fireEvent.changeText(
      screen.getByLabelText("Saisissez TRANSFER pour confirmer le transfert de propriété"),
      "TRANSFER"
    );
    await press("Confirmer le transfert de propriété");
    await press("Sign");
    expect(screen.getByText("✓ Propriété transférée !")).toBeTruthy();
    expect(button("Terminé")).toBeTruthy();
  });
});
