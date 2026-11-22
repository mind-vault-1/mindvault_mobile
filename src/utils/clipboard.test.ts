import * as ExpoClipboard from "expo-clipboard";

import { CLIPBOARD_CLEAR_DELAY_MS, copySensitive } from "./clipboard";

jest.mock("expo-clipboard", () => ({
  setStringAsync: jest.fn().mockResolvedValue(undefined),
  getStringAsync: jest.fn().mockResolvedValue(""),
}));

const setString = ExpoClipboard.setStringAsync as jest.MockedFunction<
  typeof ExpoClipboard.setStringAsync
>;
const getString = ExpoClipboard.getStringAsync as jest.MockedFunction<
  typeof ExpoClipboard.getStringAsync
>;

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  setString.mockResolvedValue(true);
  getString.mockResolvedValue("");
});

afterEach(() => {
  jest.useRealTimers();
});

describe("copySensitive", () => {
  it("copies the value and announces the automatic clear", async () => {
    const onToast = jest.fn();
    await copySensitive("secret-value", onToast);

    expect(setString).toHaveBeenCalledWith("secret-value");
    expect(onToast).toHaveBeenCalledWith("Copied — clipboard will be cleared in 60 seconds");
  });

  it("clears the clipboard after 60 seconds when the value is unchanged", async () => {
    await copySensitive("secret-value");
    getString.mockResolvedValue("secret-value");

    await jest.advanceTimersByTimeAsync(CLIPBOARD_CLEAR_DELAY_MS - 1);
    expect(setString).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(1);
    expect(getString).toHaveBeenCalled();
    expect(setString).toHaveBeenLastCalledWith("");
  });

  it("leaves a newer clipboard value alone", async () => {
    await copySensitive("secret-value");
    getString.mockResolvedValue("something-else");

    await jest.advanceTimersByTimeAsync(CLIPBOARD_CLEAR_DELAY_MS);

    expect(setString).toHaveBeenCalledTimes(1);
  });

  it("can be cancelled by the caller", async () => {
    const cancel = await copySensitive("secret-value");
    getString.mockResolvedValue("secret-value");
    cancel();

    await jest.advanceTimersByTimeAsync(CLIPBOARD_CLEAR_DELAY_MS);

    expect(getString).not.toHaveBeenCalled();
    expect(setString).toHaveBeenCalledTimes(1);
  });

  it("still attempts to clear when reading the clipboard fails", async () => {
    await copySensitive("secret-value");
    getString.mockRejectedValue(new Error("permission revoked"));

    await jest.advanceTimersByTimeAsync(CLIPBOARD_CLEAR_DELAY_MS);

    expect(setString).toHaveBeenLastCalledWith("");
  });
});
