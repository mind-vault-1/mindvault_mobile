import { Keypair } from "@stellar/stellar-sdk";
import React from "react";
import { act, fireEvent, waitFor } from "@testing-library/react-native";

import { prepareOwnershipTransfer, submitOwnershipTransfer } from "../api/resources";
import { getNetworkConfig } from "../config/network";
import { renderWithProviders } from "../test-utils";
import type { Resource } from "../types";
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

jest.mock("./SignTransactionSheet", () => {
  const { Pressable, Text } = require("react-native");
  return {
    SignTransactionSheet: ({ visible, onSigned }: { visible: boolean; onSigned: (xdr: string) => void }) =>
      visible ? (
        <Pressable accessibilityLabel="Sign" onPress={() => onSigned("signed-xdr")}>
          <Text>Sign</Text>
        </Pressable>
      ) : null,
  };
});

const mockedPrepare = prepareOwnershipTransfer as jest.Mock;
const mockedSubmit = submitOwnershipTransfer as jest.Mock;
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

function renderModal(onSuccess = jest.fn()) {
  return renderWithProviders(
    <TransferOwnershipModal
      resource={resource}
      visible
      onClose={jest.fn()}
      onSuccess={onSuccess}
    />
  );
}

function scan(data: string) {
  act(() => mockOnBarcodeScanned?.({ data }));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPermission = { granted: true };
  mockOnBarcodeScanned = undefined;
  mockedPrepare.mockResolvedValue({
    unsignedXdr: "unsigned-xdr",
    networkPassphrase: "Test SDF Network ; September 2015",
  });
  mockedSubmit.mockResolvedValue({ txHash: "tx-hash-1" });
});

it("scans a destination QR, validates it and fills the address", async () => {
  const screen = renderModal();
  fireEvent.press(screen.getByLabelText("Scan destination QR"));
  expect(mockOnBarcodeScanned).toBeDefined();
  scan(destination.toLowerCase());
  await waitFor(() => expect(screen.getByDisplayValue(destination.toUpperCase())).toBeTruthy());
  expect(screen.getByLabelText("Continue to transfer confirmation").props.accessibilityState.disabled).toBe(false);
});

it("shows an accessible error for an invalid scanned code", () => {
  const screen = renderModal();
  fireEvent.press(screen.getByLabelText("Scan destination QR"));
  scan("not-a-stellar-key");
  expect(screen.getByText("Scanned code is not a valid Stellar public address.")).toBeTruthy();
  expect(screen.queryByDisplayValue(destination)).toBeNull();
  expect(mockedPrepare).not.toHaveBeenCalled();
});

it("requires typed confirmation after showing address, resource and network", async () => {
  const screen = renderModal();
  fireEvent.changeText(screen.getByLabelText("Destination Stellar address"), destination);
  fireEvent.press(screen.getByLabelText("Continue to transfer confirmation"));

  const network = getNetworkConfig();
  expect(screen.getByLabelText(`Destination address ${destination}`)).toBeTruthy();
  expect(screen.getByLabelText(`Resource Handbook, id res-1`)).toBeTruthy();
  expect(screen.getByLabelText(`Network ${network.label}, passphrase ${network.passphrase}`)).toBeTruthy();

  const confirm = screen.getByLabelText("Confirm ownership transfer");
  expect(confirm.props.accessibilityState.disabled).toBe(true);
  fireEvent.changeText(screen.getByLabelText("Type TRANSFER to confirm ownership transfer"), "transfer");
  expect(screen.getByLabelText("Confirm ownership transfer").props.accessibilityState.disabled).toBe(false);
  expect(mockedPrepare).not.toHaveBeenCalled();

  await act(async () => {
    fireEvent.press(screen.getByLabelText("Confirm ownership transfer"));
  });
  expect(mockedPrepare).toHaveBeenCalledWith("res-1", destination.toUpperCase());
});

it("completes a confirmed transfer and reports the tx hash", async () => {
  const onSuccess = jest.fn();
  const screen = renderModal(onSuccess);
  fireEvent.press(screen.getByLabelText("Scan destination QR"));
  scan(destination);
  await waitFor(() => expect(screen.getByLabelText("Continue to transfer confirmation")).toBeTruthy());
  fireEvent.press(screen.getByLabelText("Continue to transfer confirmation"));
  fireEvent.changeText(screen.getByLabelText("Type TRANSFER to confirm ownership transfer"), "TRANSFER");
  await act(async () => {
    fireEvent.press(screen.getByLabelText("Confirm ownership transfer"));
  });
  await waitFor(() => expect(screen.getByLabelText("Sign")).toBeTruthy());
  await act(async () => {
    fireEvent.press(screen.getByLabelText("Sign"));
  });
  await waitFor(() => expect(mockedSubmit).toHaveBeenCalledWith("res-1", "signed-xdr", destination.toUpperCase()));
  fireEvent.press(screen.getByLabelText("Done"));
  expect(onSuccess).toHaveBeenCalledWith("tx-hash-1");
});

it("shows the permission request when camera access is missing", () => {
  mockPermission = { granted: false };
  const screen = renderModal();
  fireEvent.press(screen.getByLabelText("Scan destination QR"));
  expect(screen.getByLabelText("Grant Permission")).toBeTruthy();
  fireEvent.press(screen.getByLabelText("Grant Permission"));
  expect(mockRequestPermission).toHaveBeenCalled();
});
