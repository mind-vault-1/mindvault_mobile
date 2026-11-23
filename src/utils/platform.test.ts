import { Platform } from "react-native";

import { logError } from "./errorLogger";
import {
  getWebStorage,
  isWeb,
  resetPlatformWarningsForTests,
  WEB_STORAGE_WARNING,
} from "./platform";

jest.mock("./errorLogger", () => ({ logError: jest.fn() }));

const mockLogError = logError as jest.MockedFunction<typeof logError>;
const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");

function setLocalStorage(storage: Storage | null): void {
  if (storage === null) {
    delete (globalThis as { localStorage?: Storage }).localStorage;
  } else {
    Object.defineProperty(globalThis, "localStorage", {
      value: storage,
      configurable: true,
      writable: true,
    });
  }
}

beforeEach(() => {
  jest.replaceProperty(Platform, "OS", "ios");
  resetPlatformWarningsForTests();
  mockLogError.mockClear();
  setLocalStorage(null);
});

afterEach(() => {
  jest.restoreAllMocks();
  if (originalLocalStorage) {
    Object.defineProperty(globalThis, "localStorage", originalLocalStorage);
  } else {
    setLocalStorage(null);
  }
});

it("uses native storage and never warns outside web", () => {
  expect(isWeb()).toBe(false);
  expect(getWebStorage()).toBeNull();
  expect(mockLogError).not.toHaveBeenCalled();
});

it("uses browser storage on web and warns once", () => {
  jest.replaceProperty(Platform, "OS", "web");
  const storage = {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  } as unknown as Storage;
  setLocalStorage(storage);

  expect(isWeb()).toBe(true);
  expect(getWebStorage()).toBe(storage);
  expect(getWebStorage()).toBe(storage);
  expect(mockLogError).toHaveBeenCalledTimes(1);
  expect(mockLogError).toHaveBeenCalledWith(WEB_STORAGE_WARNING, expect.any(Error));
});

it("can re-arm the one-time warning", () => {
  jest.replaceProperty(Platform, "OS", "web");
  setLocalStorage({} as Storage);

  getWebStorage();
  resetPlatformWarningsForTests();
  getWebStorage();

  expect(mockLogError).toHaveBeenCalledTimes(2);
});

it("returns null when browser storage is blocked", () => {
  jest.replaceProperty(Platform, "OS", "web");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get: () => {
      throw new Error("blocked by browser");
    },
  });

  expect(getWebStorage()).toBeNull();
});
