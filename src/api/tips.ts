import { Buffer } from "buffer";

import {
  PAYMENT_REQUIRED_HEADER,
  encodePaymentSignature,
  parsePaymentRequired,
  priceToAtomicUnits,
  type PaymentChallenge,
} from "./payment";
import { getApiBaseUrl } from "./resources";

export const TIP_PRESETS = ["1.00", "5.00", "10.00", "25.00"] as const;

export interface TipRequest {
  publisherId: string;
  resourceId?: string;
  amount: string;
  note?: string;
}

export interface TipReceipt {
  tipId: string;
  publisherId: string;
  resourceId?: string;
  amount: string;
  txHash: string;
  createdAt: string;
}

/** Initiates a tip payment for a publisher. Returns the x402 challenge. */
export async function initiateTip(request: TipRequest): Promise<PaymentChallenge> {
  const { publisherId, resourceId, amount } = request;

  if (!publisherId.trim()) {
    throw new Error("Publisher ID is required for tipping.");
  }

  const atomicAmount = priceToAtomicUnits(amount);
  if (atomicAmount <= BigInt(0)) {
    throw new Error("Tip amount must be greater than zero.");
  }

  const url = `${getApiBaseUrl()}/publishers/${encodeURIComponent(publisherId)}/tip`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: atomicAmount.toString(),
      resourceId: resourceId || undefined,
      note: request.note || undefined,
    }),
  });

  if (response.status === 402) {
    const paymentRequired = response.headers.get(PAYMENT_REQUIRED_HEADER);
    return parsePaymentRequired(paymentRequired, amount);
  }

  if (!response.ok) {
    throw new Error("Failed to initiate tip payment.");
  }

  throw new Error("Tip initiated but no payment challenge received.");
}

/** Submits a signed tip payment (transaction XDR) to the server. */
export async function submitTip(
  challenge: PaymentChallenge,
  transaction: string,
  options?: { note?: string }
): Promise<TipReceipt> {
  const response = await fetch(`${getApiBaseUrl()}/tips/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "PAYMENT-SIGNATURE": encodePaymentSignature(challenge, transaction),
    },
    body: JSON.stringify({
      challenge,
      note: options?.note,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to submit tip payment.");
  }

  const receipt: unknown = await response.json();
  return parseTipReceipt(receipt);
}

function parseTipReceipt(value: unknown): TipReceipt {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid tip receipt response.");
  }

  const row = value as Record<string, unknown>;
  const tipId = typeof row.tipId === "string" ? row.tipId : typeof row.id === "string" ? row.id : "";
  const publisherId = typeof row.publisherId === "string" ? row.publisherId : "";
  const resourceId = typeof row.resourceId === "string" ? row.resourceId : undefined;
  const amount = typeof row.amount === "string" || typeof row.amount === "number" ? String(row.amount) : "";
  const txHash = typeof row.txHash === "string" ? row.txHash : "";
  const createdAt = typeof row.createdAt === "string" ? row.createdAt : "";

  if (!tipId || !publisherId || !amount || !txHash || !createdAt) {
    throw new Error("Tip receipt is missing required fields.");
  }

  if (Number.isNaN(Date.parse(createdAt))) {
    throw new Error("Tip receipt has an invalid timestamp.");
  }

  return { tipId, publisherId, resourceId, amount, txHash, createdAt };
}
