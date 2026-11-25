export function assertNoPendingTimersAfterUnmount(
  unmount: () => void,
  getPendingTimerCount: () => number
): void {
  unmount();

  const pendingTimers = getPendingTimerCount();
  if (pendingTimers > 0) {
    throw new Error(
      `Expected no pending timers after unmount, found ${pendingTimers}.`
    );
  }
}