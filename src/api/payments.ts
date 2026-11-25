import { getRemoteConfig } from "../config/remoteConfig";
import { request } from "./client";
import { getApiBaseUrl } from "./resources";

export interface BuyerPayment {
  id: string;
  resourceId: string | null;
  resourceTitle: string;
  amount: string;
  asset: string;
  network: string;
  txHash: string;
  payer: string;
  paidAt: string;
  verified?: boolean;
}

export interface BuyerPaymentsPage {
  payments: BuyerPayment[];
  nextOffset: number | null;
}

function toPayment(value: unknown): BuyerPayment | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const txHash = typeof row.txHash === "string" ? row.txHash :
    typeof row.transactionHash === "string" ? row.transactionHash : "";
  const amount = typeof row.amount === "string" || typeof row.amount === "number" ? String(row.amount) : "";
  const network = typeof row.network === "string" ? row.network : "";
  const paidAt = typeof row.paidAt === "string" ? row.paidAt :
    typeof row.createdAt === "string" ? row.createdAt : "";
  if (!txHash || !amount || !network || !paidAt || Number.isNaN(Date.parse(paidAt))) return null;
  return {
    id: typeof row.id === "string" ? row.id : txHash,
    resourceId: typeof row.resourceId === "string" ? row.resourceId : null,
    resourceTitle: typeof row.resourceTitle === "string" ? row.resourceTitle :
      typeof row.title === "string" ? row.title : "Untitled resource",
    amount,
    asset: typeof row.asset === "string" ? row.asset : "",
    network,
    txHash,
    payer: typeof row.payer === "string" ? row.payer : "",
    paidAt,
    ...(typeof row.verified === "boolean" ? { verified: row.verified } : {}),
  };
}

/** Validates and normalizes either a bare array or the server's page envelope. */
export function buyerPaymentsSchema(offset: number, limit: number) {
  return (value: unknown): BuyerPaymentsPage => {
    const envelope = value && typeof value === "object" ? value as Record<string, unknown> : null;
    const rawPayments = Array.isArray(value) ? value :
      Array.isArray(envelope?.payments) ? envelope.payments :
      Array.isArray(envelope?.items) ? envelope.items : [];
    const payments = rawPayments.map(toPayment).filter((row): row is BuyerPayment => row !== null);

    let nextOffset: number | null = null;
    if (typeof envelope?.nextOffset === "number" && Number.isInteger(envelope.nextOffset) && envelope.nextOffset > offset) {
      nextOffset = envelope.nextOffset;
    } else if (envelope && Object.prototype.hasOwnProperty.call(envelope, "nextOffset")) {
      nextOffset = null;
    } else if (typeof envelope?.total === "number" && offset + rawPayments.length < envelope.total) {
      nextOffset = offset + rawPayments.length;
    } else if (rawPayments.length === limit) {
      nextOffset = offset + rawPayments.length;
    }
    return { payments, nextOffset };
  };
}

/** Fetches one page of public payment history for a Stellar buyer address. */
export async function fetchBuyerPayments(
  address: string,
  options: { limit?: number; offset?: number } = {}
): Promise<BuyerPaymentsPage> {
  if (!address.trim()) throw new Error("A buyer wallet address is required.");
  const limit = Math.max(
    1,
    Math.min(100, Math.floor(options.limit ?? getRemoteConfig().limits.pageSize))
  );
  const offset = Math.max(0, Math.floor(options.offset ?? 0));

  const { data } = await request<BuyerPaymentsPage>(
    `${getApiBaseUrl()}/buyers/${encodeURIComponent(address)}/payments?limit=${limit}&offset=${offset}`,
    {
      fallbackMessage: (status) => status >= 500
        ? "Unable to load on-chain purchase history."
        : "Unable to load buyer payments.",
      // The plain-fetch original never showed server error bodies.
      ignoreErrorBody: true,
      // Match the original single-attempt GET behavior.
      retry: false,
      schema: buyerPaymentsSchema(offset, limit),
    }
  );
  return data;
}
