import React from "react";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";

import { prepareRegister, submitRegister } from "../api/resources";
import { renderWithProviders } from "../test-utils";
import type { Resource } from "../types";
import { openExternalUrl, stellarExpertTxUrl } from "../utils/stellarExpert";
import { RegisterModal } from "./RegisterModal";

jest.mock("../api/resources", () => ({
  prepareRegister: jest.fn(),
  submitRegister: jest.fn(),
}));

jest.mock("../utils/stellarExpert", () => ({
  openExternalUrl: jest.fn(() => Promise.resolve()),
  stellarExpertTxUrl: jest.fn(({ txHash }: { txHash: string }) => `https://explorer.test/tx/${txHash}`),
}));

// The signer is mocked: a sheet with "Sign" and "Cancel signing" buttons that
// records the props the modal passed to it.
const mockSheetProps = jest.fn();
let mockSignedXdr = "signed-xdr";
jest.mock("./SignTransactionSheet", () => {
  const { Pressable, Text, View } = require("react-native");
  return {
    SignTransactionSheet: (props: {
      visible: boolean;
      unsignedXdr: string;
      onSigned: (signedXdr: string) => void;
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

const mockedPrepare = prepareRegister as jest.Mock;
const mockedSubmit = submitRegister as jest.Mock;
const mockedOpenExternalUrl = openExternalUrl as jest.Mock;

const resource = {
  id: "res-1",
  title: "My Book",
  verificationStatus: "verified",
  onchainStatus: "none",
} as Resource;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function renderModal(overrides: Partial<React.ComponentProps<typeof RegisterModal>> = {}) {
  const props = {
    visible: true,
    resource,
    onClose: jest.fn(),
    onSuccess: jest.fn(),
    onError: jest.fn(),
    ...overrides,
  };
  const utils = renderWithProviders(<RegisterModal {...props} />);
  return { ...utils, props };
}

const button = (name: string) => screen.getByRole("button", { name });

async function press(name: string) {
  await act(async () => {
    fireEvent.press(button(name));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSignedXdr = "signed-xdr";
  mockedPrepare.mockResolvedValue({ unsignedXdr: "unsigned-xdr", networkPassphrase: "Test SDF Network ; September 2015" });
  mockedSubmit.mockResolvedValue({ txHash: "abc123hash" });
});

describe("steps", () => {
  it("renders the intro with Cancel and Register", () => {
    renderModal();
    expect(screen.getByRole("header", { name: "Register Resource On-Chain" })).toBeTruthy();
    expect(
      screen.getByText(
        'Register "My Book" on the Stellar blockchain to enable on-chain verification and tracking.'
      )
    ).toBeTruthy();
    expect(button("Cancel")).toBeTruthy();
    expect(button("Register")).toBeTruthy();
  });

  it("renders nothing without a resource", () => {
    renderModal({ resource: null });
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows the preparing step while the transaction is built", async () => {
    const prepare = deferred<{ unsignedXdr: string; networkPassphrase: string }>();
    mockedPrepare.mockReturnValue(prepare.promise);
    renderModal();

    await press("Register");

    expect(screen.getByRole("progressbar", { name: "Preparing transaction..." })).toBeTruthy();
    expect(mockedPrepare).toHaveBeenCalledWith("res-1");

    await act(async () => prepare.resolve({ unsignedXdr: "unsigned-xdr", networkPassphrase: "Test" }));
    expect(button("Sign")).toBeTruthy();
  });

  it("hands the unsigned transaction to the signer", async () => {
    renderModal();
    await press("Register");

    expect(button("Sign")).toBeTruthy();
    // The modal hides itself while the sheet is up.
    expect(screen.queryByRole("header", { name: "Register Resource On-Chain" })).toBeNull();
    expect(mockSheetProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        visible: true,
        unsignedXdr: "unsigned-xdr",
        networkPassphrase: "Test SDF Network ; September 2015",
        action: "register this publisher",
      })
    );
  });

  it("shows the submitting step while the signed transaction is sent", async () => {
    const submit = deferred<{ txHash: string }>();
    mockedSubmit.mockReturnValue(submit.promise);
    renderModal();
    await press("Register");
    await press("Sign");

    expect(screen.getByRole("progressbar", { name: "Submitting to blockchain..." })).toBeTruthy();
    expect(mockedSubmit).toHaveBeenCalledWith("res-1", "signed-xdr");

    await act(async () => submit.resolve({ txHash: "abc123hash" }));
    expect(screen.getByText("✓ Registration successful!")).toBeTruthy();
  });

  it("returns to the intro when signing is cancelled", async () => {
    renderModal();
    await press("Register");
    await press("Cancel signing");

    expect(button("Register")).toBeTruthy();
    expect(mockedSubmit).not.toHaveBeenCalled();
  });
});

describe("success", () => {
  it("reports the hash and stays on the success step", async () => {
    const { props } = renderModal();
    await press("Register");
    await press("Sign");

    expect(props.onSuccess).toHaveBeenCalledWith("Resource registered on-chain successfully!", "abc123hash");
    expect(screen.getByText("abc123hash")).toBeTruthy();
    expect(button("View in Explorer")).toBeTruthy();
    expect(button("Close")).toBeTruthy();
  });

  it("opens the transaction in the explorer from the button and the hash", async () => {
    renderModal();
    await press("Register");
    await press("Sign");

    await press("View in Explorer");
    expect(stellarExpertTxUrl).toHaveBeenCalledWith({ txHash: "abc123hash" });
    expect(mockedOpenExternalUrl).toHaveBeenCalledWith("https://explorer.test/tx/abc123hash");

    await act(async () => {
      fireEvent.press(screen.getByRole("link", { name: "View transaction abc123hash in explorer" }));
    });
    expect(mockedOpenExternalUrl).toHaveBeenCalledTimes(2);
  });

  it("reports when the explorer cannot be opened", async () => {
    mockedOpenExternalUrl.mockRejectedValueOnce(new Error("no browser"));
    const { props } = renderModal();
    await press("Register");
    await press("Sign");
    await press("View in Explorer");

    await waitFor(() => expect(props.onError).toHaveBeenCalledWith("Failed to open explorer"));
  });
});

describe("errors", () => {
  it("shows a prepare failure and retries it", async () => {
    mockedPrepare.mockRejectedValueOnce(new Error("Server unavailable"));
    const { props } = renderModal();
    await press("Register");

    expect(screen.getByText("✗ Registration failed")).toBeTruthy();
    expect(screen.getByRole("alert", { name: "Server unavailable" })).toBeTruthy();
    expect(props.onError).toHaveBeenCalledWith("Server unavailable");

    await press("Retry");
    expect(mockedPrepare).toHaveBeenCalledTimes(2);
    expect(button("Sign")).toBeTruthy();
  });

  it("shows a submit failure and lets the user sign again", async () => {
    mockedSubmit.mockRejectedValueOnce(new Error("tx_bad_seq"));
    const { props } = renderModal();
    await press("Register");
    await press("Sign");

    expect(screen.getByRole("alert", { name: "tx_bad_seq" })).toBeTruthy();
    expect(props.onError).toHaveBeenCalledWith("tx_bad_seq");

    await press("Retry");
    await press("Sign");
    expect(mockedSubmit).toHaveBeenCalledTimes(2);
    expect(props.onSuccess).toHaveBeenCalledWith("Resource registered on-chain successfully!", "abc123hash");
  });

  it("uses a generic message for non-Error failures", async () => {
    mockedPrepare.mockRejectedValueOnce("boom");
    renderModal();
    await press("Register");
    expect(screen.getByRole("alert", { name: "Registration failed" })).toBeTruthy();
  });

  it("refuses a transaction that comes back unsigned", async () => {
    mockSignedXdr = "unsigned-xdr";
    renderModal();
    await press("Register");
    await press("Sign");

    expect(screen.getByRole("alert", { name: "The transaction must be signed before submission." })).toBeTruthy();
    expect(mockedSubmit).not.toHaveBeenCalled();
  });
});

describe("closing", () => {
  it("cancels from the intro", async () => {
    const { props } = renderModal();
    await press("Cancel");
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("resets to the intro after closing the success step", async () => {
    const { props, rerender } = renderModal();
    await press("Register");
    await press("Sign");
    await press("Close");
    expect(props.onClose).toHaveBeenCalledTimes(1);

    rerender(<RegisterModal {...props} visible />);
    expect(button("Register")).toBeTruthy();
    expect(screen.queryByText("abc123hash")).toBeNull();
  });

  it("clears the error after closing the error step", async () => {
    mockedPrepare.mockRejectedValueOnce(new Error("Server unavailable"));
    const { props } = renderModal();
    await press("Register");
    await press("Close");

    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(button("Register")).toBeTruthy();
  });
});

describe("in French", () => {
  const { setLocale } = jest.requireActual("../i18n");
  beforeEach(() => setLocale("fr"));
  afterEach(() => setLocale("en"));

  it("renders each step through the translation catalogue", async () => {
    const { props } = renderModal();
    expect(screen.getByRole("header", { name: "Enregistrer la ressource on-chain" })).toBeTruthy();
    await press("Enregistrer");
    expect(mockSheetProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ action: "enregistrer cet éditeur" })
    );
    await press("Sign");
    expect(screen.getByText("✓ Enregistrement réussi !")).toBeTruthy();
    expect(button("Voir dans l'explorateur")).toBeTruthy();
    expect(props.onSuccess).toHaveBeenCalledWith("Ressource enregistrée on-chain !", "abc123hash");
  });
});
