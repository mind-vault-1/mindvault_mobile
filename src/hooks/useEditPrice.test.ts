import { act, renderHook } from "@testing-library/react-native";

import { prepareEditPrice, submitPriceEdit } from "../api/resources";
import { useEditPrice, validatePrice } from "./useEditPrice";

jest.mock("../api/resources", () => ({
  prepareEditPrice: jest.fn(),
  submitPriceEdit: jest.fn(),
}));

const mockedPrepareEditPrice = prepareEditPrice as jest.MockedFunction<typeof prepareEditPrice>;
const mockedSubmitPriceEdit = submitPriceEdit as jest.MockedFunction<typeof submitPriceEdit>;

describe("validatePrice", () => {
  it("accepts valid numeric strings greater than zero", () => {
    expect(validatePrice("1")).toBeNull();
    expect(validatePrice("12.50")).toBeNull();
    expect(validatePrice("  5.00  ")).toBeNull();
  });

  it("rejects empty or whitespace-only strings", () => {
    expect(validatePrice("")).toBe("Price cannot be empty.");
    expect(validatePrice("   ")).toBe("Price cannot be empty.");
  });

  it("rejects non-numeric strings", () => {
    expect(validatePrice("abc")).toBe("Price must be a valid number.");
    expect(validatePrice("12.5.0")).toBe("Price must be a valid number.");
  });

  it("rejects numbers less than or equal to zero", () => {
    expect(validatePrice("0")).toBe("Price must be greater than zero.");
    expect(validatePrice("-5")).toBe("Price must be greater than zero.");
  });
});

describe("useEditPrice state machine", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("happy path: walks idle -> preparing -> signing -> submitting -> idle and resolves true", async () => {
    mockedPrepareEditPrice.mockResolvedValue({
      unsignedXdr: "unsigned-xdr-price",
      networkPassphrase: "Test SDF Network ; September 2015",
    });
    mockedSubmitPriceEdit.mockResolvedValue({
      id: "res-1",
      price: "15.00",
      status: "confirmed",
    });

    const { result } = renderHook(() => useEditPrice());

    expect(result.current.status).toBe("idle");
    expect(result.current.pendingTransaction).toBeNull();
    expect(result.current.error).toBeNull();

    // Start preparing price edit
    let preparePromise: Promise<boolean>;
    act(() => {
      preparePromise = result.current.preparePriceEdit("res-1", "  15.00  ");
    });

    // While awaiting, status transitioned to preparing
    expect(result.current.status).toBe("preparing");

    const prepareOk = await act(async () => await preparePromise);
    expect(prepareOk).toBe(true);

    // After prepare resolves, status is signing and pendingTransaction is set with trimmed price
    expect(result.current.status).toBe("signing");
    expect(result.current.pendingTransaction).toEqual({
      resourceId: "res-1",
      price: "15.00",
      unsignedXdr: "unsigned-xdr-price",
      networkPassphrase: "Test SDF Network ; September 2015",
    });
    expect(mockedPrepareEditPrice).toHaveBeenCalledWith("res-1", "15.00");

    // Submit signed transaction
    let submitPromise: Promise<boolean>;
    act(() => {
      submitPromise = result.current.submitSigned("signed-xdr-price");
    });

    expect(result.current.status).toBe("submitting");

    const submitOk = await act(async () => await submitPromise);
    expect(submitOk).toBe(true);

    // After submit resolves, returns to idle with pendingTransaction cleared and submit received trimmed price
    expect(result.current.status).toBe("idle");
    expect(result.current.pendingTransaction).toBeNull();
    expect(result.current.error).toBeNull();
    expect(mockedSubmitPriceEdit).toHaveBeenCalledWith(
      "res-1",
      "signed-xdr-price",
      "15.00"
    );
  });

  it("failure in prepare ends with server message, leaves pendingTransaction null, and returns to idle", async () => {
    mockedPrepareEditPrice.mockRejectedValue(new Error("Server prepare error"));

    const { result } = renderHook(() => useEditPrice());

    let preparePromise: Promise<boolean>;
    act(() => {
      preparePromise = result.current.preparePriceEdit("res-1", "10.00");
    });

    const ok = await act(async () => await preparePromise);
    expect(ok).toBe(false);

    expect(result.current.status).toBe("idle");
    expect(result.current.pendingTransaction).toBeNull();
    expect(result.current.error).toBe("Server prepare error");
    expect(mockedSubmitPriceEdit).not.toHaveBeenCalled();
  });

  it("failure in submit ends with server message, clears pendingTransaction, and returns to idle", async () => {
    mockedPrepareEditPrice.mockResolvedValue({
      unsignedXdr: "unsigned-xdr",
    });
    mockedSubmitPriceEdit.mockRejectedValue(new Error("Submission failed: bad auth"));

    const { result } = renderHook(() => useEditPrice());

    await act(async () => {
      await result.current.preparePriceEdit("res-1", "10.00");
    });
    expect(result.current.status).toBe("signing");
    expect(result.current.pendingTransaction).not.toBeNull();

    let submitPromise: Promise<boolean>;
    act(() => {
      submitPromise = result.current.submitSigned("signed-xdr");
    });

    const ok = await act(async () => await submitPromise);
    expect(ok).toBe(false);

    expect(result.current.status).toBe("idle");
    expect(result.current.pendingTransaction).toBeNull();
    expect(result.current.error).toBe("Submission failed: bad auth");
  });

  it("submitting unsigned XDR rejects without calling submitPriceEdit", async () => {
    mockedPrepareEditPrice.mockResolvedValue({
      unsignedXdr: "exact-same-unsigned-xdr",
    });

    const { result } = renderHook(() => useEditPrice());

    await act(async () => {
      await result.current.preparePriceEdit("res-1", "10.00");
    });

    let submitPromise: Promise<boolean>;
    act(() => {
      submitPromise = result.current.submitSigned("exact-same-unsigned-xdr");
    });

    const ok = await act(async () => await submitPromise);
    expect(ok).toBe(false);

    expect(mockedSubmitPriceEdit).not.toHaveBeenCalled();
    expect(result.current.pendingTransaction).toBeNull();
    expect(result.current.error).toBe("The transaction must be signed before submission.");
  });

  it("cancelSigning returns to idle with no error and clears pendingTransaction", async () => {
    mockedPrepareEditPrice.mockResolvedValue({
      unsignedXdr: "unsigned-xdr",
    });

    const { result } = renderHook(() => useEditPrice());

    await act(async () => {
      await result.current.preparePriceEdit("res-1", "10.00");
    });
    expect(result.current.status).toBe("signing");
    expect(result.current.pendingTransaction).not.toBeNull();

    act(() => {
      result.current.cancelSigning();
    });

    expect(result.current.status).toBe("idle");
    expect(result.current.pendingTransaction).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("invalid price makes no API calls, sets error, and resetError clears error", async () => {
    const { result } = renderHook(() => useEditPrice());

    let ok: boolean;
    await act(async () => {
      ok = await result.current.preparePriceEdit("res-1", "invalid-price");
    });

    expect(ok!).toBe(false);
    expect(mockedPrepareEditPrice).not.toHaveBeenCalled();
    expect(result.current.status).toBe("idle");
    expect(result.current.error).toBe("Price must be a valid number.");

    act(() => {
      result.current.resetError();
    });
    expect(result.current.error).toBeNull();
  });
});
