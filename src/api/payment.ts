import type { AccessResult, PaymentChallenge } from "../types";

/**
 * Parse HTTP 402 challenge headers into a PaymentChallenge.
 * Expected headers (case-insensitive):
 *   X-Payment-Price, X-Payment-Destination, X-Payment-Network
 *   X-Payment-Asset (optional), X-Payment-Memo (optional)
 */
export function parsePaymentChallenge(headers: Headers): PaymentChallenge | null {
  const price = headers.get("x-payment-price");
  const destination = headers.get("x-payment-destination");
  const network = headers.get("x-payment-network");

  if (!price || !destination || !network) return null;

  return {
    price,
    destination,
    network,
    assetCode: headers.get("x-payment-asset") ?? undefined,
    memo: headers.get("x-payment-memo") ?? undefined,
  };
}

/**
 * Build a mock payment proof token.
 * In a real implementation this would sign a transaction on Stellar
 * and return the transaction hash or envelope XDR.
 */
export function buildPaymentProof(challenge: PaymentChallenge): string {
  // Placeholder: encode challenge as base64 JSON to simulate a signed proof
  const payload = JSON.stringify({
    destination: challenge.destination,
    price: challenge.price,
    network: challenge.network,
    asset: challenge.assetCode ?? "USDC",
    memo: challenge.memo,
    ts: Date.now(),
  });
  return btoa(payload);
}

/**
 * Attempt to access a paywalled resource URL.
 *
 * Flow:
 *  1. GET url — if 200, return content directly.
 *  2. If 402, parse challenge headers, sign payment, retry with
 *     `X-Payment-Proof` header.
 *  3. Return text content or an external URL for non-text responses.
 */
export async function accessResource(url: string): Promise<AccessResult> {
  const firstRes = await fetch(url);

  if (firstRes.status === 402) {
    const challenge = parsePaymentChallenge(firstRes.headers);
    if (!challenge) {
      throw new Error("402 received but payment challenge headers are missing.");
    }

    const proof = buildPaymentProof(challenge);
    const secondRes = await fetch(url, {
      headers: { "X-Payment-Proof": proof },
    });

    if (!secondRes.ok) {
      throw new Error(`Payment rejected: server responded ${secondRes.status}.`);
    }

    return resolveResponse(secondRes, url);
  }

  if (!firstRes.ok) {
    throw new Error(`Failed to access resource (${firstRes.status}).`);
  }

  return resolveResponse(firstRes, url);
}

async function resolveResponse(res: Response, fallbackUrl: string): Promise<AccessResult> {
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("text") || contentType.includes("json")) {
    const text = await res.text();
    return { type: "text", content: text };
  }
  // For binary/unknown content types, hand off to the external browser
  return { type: "external", url: fallbackUrl };
}
