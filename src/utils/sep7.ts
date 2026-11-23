export const SEP7_CALLBACK_HOST = "sep7-callback";
export const SEP7_CALLBACK_URL = `mindvault://${SEP7_CALLBACK_HOST}`;

export interface Sep7TransactionUriOptions {
  callbackUrl?: string | null;
  message?: string;
}

export interface Sep7Callback {
  status: "signed" | "rejected" | "unknown";
  signedXdr?: string;
  error?: string;
}

export function buildSep7TransactionUri(
  xdr: string,
  options: Sep7TransactionUriOptions = {}
): string {
  const trimmed = xdr.trim();
  if (!trimmed) throw new Error("A transaction XDR is required.");

  const params = new URLSearchParams();
  params.set("xdr", trimmed);
  const callbackUrl = options.callbackUrl === null ? null : options.callbackUrl ?? SEP7_CALLBACK_URL;
  if (callbackUrl) params.set("callback", callbackUrl);
  if (options.message?.trim()) params.set("message", options.message.trim());
  return `web+stellar:tx?${params.toString()}`;
}

export function isSep7CallbackUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "mindvault:" &&
      (parsed.host === SEP7_CALLBACK_HOST ||
        parsed.pathname.replace(/^\/+/, "") === SEP7_CALLBACK_HOST)
    );
  } catch {
    return false;
  }
}

export function parseSep7Callback(url: string): Sep7Callback | null {
  if (!isSep7CallbackUrl(url)) return null;

  const parsed = new URL(url);
  const rawStatus = (parsed.searchParams.get("result") ?? parsed.searchParams.get("status") ?? "")
    .trim()
    .toLowerCase();
  const signedXdr = parsed.searchParams.get("xdr") ?? undefined;
  const error = parsed.searchParams.get("error") ?? undefined;

  if (["signed", "success", "ok", "approved"].includes(rawStatus) && signedXdr) {
    return { status: "signed", signedXdr };
  }
  if (["rejected", "cancelled", "canceled", "declined"].includes(rawStatus)) {
    return { status: "rejected", error };
  }
  return { status: "unknown", error };
}
