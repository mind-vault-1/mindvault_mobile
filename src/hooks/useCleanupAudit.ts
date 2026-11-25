/**
 * Hook cleanup audit (issue #423).
 *
 * Scan for resources that must be released on unmount:
 * - `setInterval` / `setTimeout` -> `clearInterval` / `clearTimeout`
 * - `addEventListener` / RN `AppState.addEventListener` / `NetInfo.addEventListener` -> remove/unsubscribe in cleanup
 * - `subscribe(...)` / observable subscriptions -> unsubscribe in cleanup
 *
 * New hooks must return a cleanup for every timer, listener, or subscription
 * they create. Tests should mount the hook, unmount it, and assert
 * `jest.getTimerCount() === 0` and that unsubscribe/remove functions were called.
 */

export interface CleanupAuditHandle {
  /** Runs unmount/cleanup. */
  unmount: () => void;
  /** Returns pending Jest fake timers. */
  getPendingTimerCount: () => number;
  /** Optional unsubscribe/remove spies to assert. */
  subscriptions?: Array<jest.Mock | (() => unknown)>;
}

export function assertNoPendingTimersAfterUnmount({
  unmount,
  getPendingTimerCount,
  subscriptions = [],
}: CleanupAuditHandle): void {
  unmount();

  const pendingTimers = getPendingTimerCount();
  if (pendingTimers > 0) {
    throw new Error(`Expected no pending timers after unmount, found ${pendingTimers}.`);
  }

  for (const subscription of subscriptions) {
    if ("mock" in subscription) {
      expect(subscription).toHaveBeenCalled();
    }
  }
}
