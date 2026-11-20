import { useEffect } from "react";

import { requestReceiptSync } from "../services/receiptSync";
import { subscribeReceiptSaved } from "../services/receipts";
import { useAppForeground } from "./useAppForeground";

/**
 * Keeps the local receipt store reconciled with the server in the background:
 * syncs on app foreground and after every successful payment (a receipt is
 * saved), at most once per `MIN_SYNC_INTERVAL_MS`, never blocking the UI.
 *
 * `enabled` gates the first runs (e.g. until the API base URL is loaded).
 */
export function useReceiptSync(enabled = true): void {
  useAppForeground(() => {
    if (enabled) requestReceiptSync();
  });

  useEffect(() => {
    if (!enabled) return;
    const unsubscribe = subscribeReceiptSaved(() => requestReceiptSync());
    // Also sync once when the app starts, not only on later foregrounds.
    requestReceiptSync();
    return unsubscribe;
  }, [enabled]);
}
