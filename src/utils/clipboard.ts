/**
 * clipboard.ts — secure clipboard helpers (#351)
 *
 * copySensitive() copies a value and schedules automatic clearing after
 * CLIPBOARD_CLEAR_DELAY_MS (60 s). If the clipboard still holds the copied
 * value when the timer fires it is replaced with an empty string, ensuring
 * wallet secrets and signed XDRs are not left in the clipboard indefinitely.
 */

import * as ExpoClipboard from 'expo-clipboard';

/** How long (ms) a sensitive value is allowed to remain in the clipboard. */
export const CLIPBOARD_CLEAR_DELAY_MS = 60_000;

/**
 * Copy `value` to the clipboard and automatically clear it after
 * {@link CLIPBOARD_CLEAR_DELAY_MS} if it still contains the copied string.
 *
 * @param value   The sensitive string to copy (key, XDR, seed, etc.).
 * @param onToast Optional callback so the caller can display a toast such as
 *                "Copied — will be cleared in 60 s".
 * @returns A cancel function that aborts the scheduled clear (call it if the
 *          user navigates away and you want to clear immediately instead).
 */
export async function copySensitive(
  value: string,
  onToast?: (message: string) => void,
): Promise<() => void> {
  await ExpoClipboard.setStringAsync(value);

  onToast?.('Copied — clipboard will be cleared in 60 seconds');

  const timer = setTimeout(async () => {
    try {
      const current = await ExpoClipboard.getStringAsync();
      if (current === value) {
        await ExpoClipboard.setStringAsync('');
      }
    } catch {
      // Best-effort: if reading the clipboard fails (e.g. permission revoked)
      // we still attempt to clear it.
      await ExpoClipboard.setStringAsync('').catch(() => undefined);
    }
  }, CLIPBOARD_CLEAR_DELAY_MS);

  return () => clearTimeout(timer);
}
