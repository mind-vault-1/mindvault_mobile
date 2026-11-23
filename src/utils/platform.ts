import { Platform } from "react-native";

import { logError } from "./errorLogger";

export const WEB_STORAGE_WARNING =
  "MindVault web storage is not encrypted. Avoid using publisher or wallet secrets on shared devices.";

let warnedAboutWebStorage = false;

export function isWeb(): boolean {
  return Platform.OS === "web";
}

/** Browser storage used only when native SecureStore is unavailable. */
export function getWebStorage(): Storage | null {
  if (!isWeb()) return null;
  if (!warnedAboutWebStorage) {
    warnedAboutWebStorage = true;
    logError(WEB_STORAGE_WARNING, new Error("Browser storage fallback in use."));
  }
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function resetPlatformWarningsForTests(): void {
  warnedAboutWebStorage = false;
}
