import * as Clipboard from "expo-clipboard";

export const SENSITIVE_CLIPBOARD_TTL_MS = 60_000;

/** Copy a secret/XDR and clear it only if the user has not replaced it. */
export async function copySensitive(value: string): Promise<void> {
  await Clipboard.setStringAsync(value);
  setTimeout(() => {
    void Clipboard.getStringAsync().then((current) => {
      if (current === value) return Clipboard.setStringAsync("");
      return undefined;
    });
  }, SENSITIVE_CLIPBOARD_TTL_MS);
}
