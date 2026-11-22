import { Keypair } from "@stellar/stellar-sdk";
import { act, renderHook } from "@testing-library/react-native";

import { prepareOwnershipTransfer, submitOwnershipTransfer } from "../api/resources";
import { useTransferOwnership, validateStellarAddress } from "./useTransferOwnership";

jest.mock("../api/resources", () => ({
  prepareOwnershipTransfer: jest.fn(),
  submitOwnershipTransfer: jest.fn(),
}));

const mockedPrepare = prepareOwnershipTransfer as jest.Mock;
const mockedSubmit = submitOwnershipTransfer as jest.Mock;

describe("validateStellarAddress", () => {
  it("accepts a valid ed25519 public key", () => {
    const publicKey = Keypair.random().publicKey();
    expect(validateStellarAddress(publicKey)).toBe(true);
    expect(validateStellarAddress(`  ${publicKey.toLowerCase()}  `)).toBe(true);
  });

  it("rejects empty and whitespace-only input", () => {
    expect(validateStellarAddress("")).toBe(false);
    expect(validateStellarAddress("   ")).toBe(false);
  });

  it("rejects malformed keys", () => {
    expect(validateStellarAddress("not-a-key")).toBe(false);
    expect(validateStellarAddress("GABC")).toBe(false);
    expect(validateStellarAddress("S" + "A".repeat(55))).toBe(false);
  });

  it("rejects keys with valid length but invalid checksum", () => {
    const publicKey = Keypair.random().publicKey();
    const tampered = publicKey.slice(0, -1) + (publicKey.endsWith("A") ? "B" : "A");
    expect(validateStellarAddress(tampered)).toBe(false);
  });
});

describe("useTransferOwnership signing", () => {
  const destination = Keypair.random().publicKey();

  beforeEach(() => {
    jest.clearAllMocks();
    mockedPrepare.mockResolvedValue({
      unsignedXdr: "unsigned-xdr",
      networkPassphrase: "Test SDF Network ; September 2015",
    });
  });

  async function prepared() {
    const hook = renderHook(() => useTransferOwnership());
    act(() => hook.result.current.setDestinationAddress(destination));
    await act(() => hook.result.current.start("r1"));
    expect(hook.result.current.pendingTransaction).not.toBeNull();
    return hook;
  }

  it("happy path: walks idle -> preparing -> signing -> submitting -> done with tx hash", async () => {
    mockedSubmit.mockResolvedValue({
      id: "r1",
      newCreator: destination,
      status: "confirmed",
      txHash: "transfer-tx-hash-123",
    });

    const hook = renderHook(() => useTransferOwnership());
    expect(hook.result.current.step).toBe("idle");
    expect(hook.result.current.pendingTransaction).toBeNull();

    act(() => {
      hook.result.current.setDestinationAddress(`  ${destination.toLowerCase()}  `);
    });

    let startPromise: Promise<void>;
    act(() => {
      startPromise = hook.result.current.start("r1");
    });

    expect(hook.result.current.step).toBe("preparing");

    await act(async () => {
      await startPromise;
    });

    expect(hook.result.current.step).toBe("signing");
    expect(hook.result.current.pendingTransaction).toEqual({
      resourceId: "r1",
      destination: destination.toUpperCase(),
      unsignedXdr: "unsigned-xdr",
      networkPassphrase: "Test SDF Network ; September 2015",
    });
    expect(mockedPrepare).toHaveBeenCalledWith("r1", destination.toUpperCase());

    let submitPromise: Promise<void>;
    act(() => {
      submitPromise = hook.result.current.submitSigned("signed-xdr-123");
    });

    expect(hook.result.current.step).toBe("submitting");

    await act(async () => {
      await submitPromise;
    });

    expect(hook.result.current.step).toBe("done");
    expect(hook.result.current.pendingTransaction).toBeNull();
    expect(hook.result.current.txHash).toBe("transfer-tx-hash-123");
    expect(hook.result.current.error).toBeNull();
    expect(mockedSubmit).toHaveBeenCalledWith("r1", "signed-xdr-123", destination.toUpperCase());
  });

  it("failure in prepare ends with server message, leaves pendingTransaction null, and submits nothing", async () => {
    mockedPrepare.mockRejectedValue(new Error("Resource not found"));

    const hook = renderHook(() => useTransferOwnership());
    act(() => hook.result.current.setDestinationAddress(destination));

    await act(async () => {
      await hook.result.current.start("r1");
    });

    expect(hook.result.current.step).toBe("error");
    expect(hook.result.current.error).toBe("Resource not found");
    expect(hook.result.current.pendingTransaction).toBeNull();
    expect(mockedSubmit).not.toHaveBeenCalled();
  });

  it("cancelSigning returns to idle with no error and clears pendingTransaction", async () => {
    const { result } = await prepared();
    expect(result.current.step).toBe("signing");
    expect(result.current.pendingTransaction).not.toBeNull();

    act(() => {
      result.current.cancelSigning();
    });

    expect(result.current.step).toBe("idle");
    expect(result.current.pendingTransaction).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("invalid input makes no API calls, sets error, and reset returns to clean state", async () => {
    const hook = renderHook(() => useTransferOwnership());
    act(() => hook.result.current.setDestinationAddress("invalid-destination"));

    expect(hook.result.current.isValidAddress).toBe(false);

    await act(async () => {
      await hook.result.current.start("r1");
    });

    expect(mockedPrepare).not.toHaveBeenCalled();
    expect(hook.result.current.error).toBe("Invalid destination address.");
    expect(hook.result.current.step).toBe("idle");
    expect(hook.result.current.pendingTransaction).toBeNull();

    // reset clears address, error, and step
    act(() => {
      hook.result.current.reset();
    });

    expect(hook.result.current.step).toBe("idle");
    expect(hook.result.current.error).toBeNull();
    expect(hook.result.current.txHash).toBeNull();
    expect(hook.result.current.destinationAddress).toBe("");
    expect(hook.result.current.pendingTransaction).toBeNull();
  });

  it("closes the signing sheet and reports the error when submission fails", async () => {
    mockedSubmit.mockRejectedValue(new Error("tx_bad_seq"));
    const { result } = await prepared();

    await act(() => result.current.submitSigned("signed-xdr"));

    expect(result.current.pendingTransaction).toBeNull();
    expect(result.current.step).toBe("error");
    expect(result.current.error).toBe("tx_bad_seq");
  });

  it("never submits the unsigned XDR", async () => {
    const { result } = await prepared();

    await act(() => result.current.submitSigned("unsigned-xdr"));

    expect(mockedSubmit).not.toHaveBeenCalled();
    expect(result.current.pendingTransaction).toBeNull();
    expect(result.current.step).toBe("error");
  });
});
