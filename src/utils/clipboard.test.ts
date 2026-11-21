import * as Clipboard from "expo-clipboard";

import { copySensitive, SENSITIVE_CLIPBOARD_TTL_MS } from "./clipboard";

jest.mock("expo-clipboard", () => ({
  getStringAsync: jest.fn(),
  setStringAsync: jest.fn().mockResolvedValue(undefined),
}));

const mockedClipboard = Clipboard as jest.Mocked<typeof Clipboard>;

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
});

afterEach(() => {
  jest.useRealTimers();
});

it("clears an unchanged sensitive value after one minute", async () => {
  mockedClipboard.getStringAsync.mockResolvedValue("signed-xdr");

  await copySensitive("signed-xdr");
  expect(mockedClipboard.setStringAsync).toHaveBeenCalledWith("signed-xdr");

  jest.advanceTimersByTime(SENSITIVE_CLIPBOARD_TTL_MS);
  await Promise.resolve();

  expect(mockedClipboard.setStringAsync).toHaveBeenLastCalledWith("");
});

it("does not clear a value replaced by the user", async () => {
  mockedClipboard.getStringAsync.mockResolvedValue("user-copied-value");

  await copySensitive("signed-xdr");
  jest.advanceTimersByTime(SENSITIVE_CLIPBOARD_TTL_MS);
  await Promise.resolve();

  expect(mockedClipboard.setStringAsync).not.toHaveBeenLastCalledWith("");
});
