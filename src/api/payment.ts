import { Keypair, StrKey, contract, nativeToScVal, rpc } from "@stellar/stellar-sdk";
import { Buffer } from "buffer";

import type { AccessResult } from "../types";
import { ApiError, request } from "./client";
import { parseResourceId } from "../utils/resourceLinks";
import { saveReceipt } from "../services/receipts";
import { DEFAULT_NETWORK_PASSPHRASE, DEFAULT_STELLAR_NETWORK, getApiBaseUrl } from "./resources";

/**
 * Client for the server's x402 v2 paywall (`@x402/express` with the
 * `@x402/stellar` "exact" scheme). It mirrors `ExactStellarScheme` from
 * `@x402/stellar/exact/client`; see docs/PAYMENTS.md for the flow.
 */
export const X402_VERSION = 2;
export const PAYMENT_REQUIRED_HEADER = "PAYMENT-REQUIRED";
export const PAYMENT_SIGNATURE_HEADER = "PAYMENT-SIGNATURE";
export const PAYMENT_RESPONSE_HEADER = "PAYMENT-RESPONSE";

const STELLAR_NETWORK_IDS: Record<string, string> = {
  mainnet: "stellar:pubnet",
  testnet: "stellar:testnet",
};
const DEFAULT_TESTNET_RPC_URL = "https://soroban-testnet.stellar.org";
const DEFAULT_LEDGER_SECONDS = 5;
const STELLAR_USDC_DECIMALS = 7;

/** One payment option offered by the server (`accepts[]`). */
export interface PaymentRequirements {
  scheme: string;
  network: string;
  asset: string;
  amount: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra: Record<string, unknown>;
}

/** The decoded `PAYMENT-REQUIRED` header. */
interface PaymentRequired {
  x402Version: number;
  error?: string;
  resource: unknown;
  accepts: PaymentRequirements[];
  extensions?: Record<string, unknown>;
}

/** The option the app will pay, plus what must be echoed back to the server. */
export interface PaymentChallenge {
  x402Version: number;
  /** Sent back unchanged: the server matches it by deep equality. */
  accepted: PaymentRequirements;
  resource: unknown;
  extensions?: Record<string, unknown>;
}

export type ResourceAccess =
  | { type: "ready"; result: AccessResult }
  | { type: "payment"; challenge: PaymentChallenge };

/** The app's network as a CAIP-2 id, e.g. `stellar:testnet`. */
export function appNetworkId(): string {
  const id = STELLAR_NETWORK_IDS[DEFAULT_STELLAR_NETWORK];
  if (!id) {
    throw new Error("This app network does not support x402 payments.");
  }
  return id;
}

function encodeBase64Json(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

function decodeBase64Json(value: string): unknown {
  return JSON.parse(Buffer.from(value, "base64").toString("utf8"));
}

/** Converts a displayed USDC price ("1.5") to 7-decimal base units (15000000n). */
export function priceToAtomicUnits(price: string): bigint {
  const trimmed = price.trim();
  if (!/^\d+(?:\.\d+)?$/.test(trimmed)) {
    throw new Error("The displayed price is invalid.");
  }

  const [whole, fraction = ""] = trimmed.split(".");
  const normalizedFraction = fraction
    .padEnd(STELLAR_USDC_DECIMALS, "0")
    .slice(0, STELLAR_USDC_DECIMALS);
  return BigInt(`${whole}${normalizedFraction}`);
}

/**
 * Picks the option the app can pay from a `PAYMENT-REQUIRED` header, refusing
 * other schemes and networks, unsponsored fees, and anything above the price
 * the user was shown.
 */
export function parsePaymentRequired(
  header: string | null,
  displayedPrice: string
): PaymentChallenge {
  if (!header) {
    throw new Error("402 received without a PAYMENT-REQUIRED header.");
  }

  let parsed: PaymentRequired;
  try {
    parsed = decodeBase64Json(header) as PaymentRequired;
  } catch {
    throw new Error("402 received but the payment challenge couldn't be read.");
  }

  if (parsed.x402Version !== X402_VERSION) {
    throw new Error(`Unsupported x402 version ${String(parsed.x402Version)}.`);
  }
  if (!Array.isArray(parsed.accepts) || parsed.accepts.length === 0) {
    throw new Error("402 received but the challenge offered no payment options.");
  }

  const exactOptions = parsed.accepts.filter((option) => option?.scheme === "exact");
  if (exactOptions.length === 0) {
    throw new Error("This resource uses an unsupported payment scheme.");
  }

  const network = appNetworkId();
  const accepted = exactOptions.find((option) => option.network === network);
  if (!accepted) {
    throw new Error(
      `This resource requires ${exactOptions[0].network}, but the app is on ${network}.`
    );
  }

  if (
    !/^\d+$/.test(accepted.amount ?? "") ||
    BigInt(accepted.amount) <= BigInt(0) ||
    !StrKey.isValidEd25519PublicKey(accepted.payTo ?? "") ||
    !StrKey.isValidContract(accepted.asset ?? "")
  ) {
    throw new Error("402 received but the payment requirements were incomplete.");
  }
  if (accepted.extra?.areFeesSponsored !== true) {
    throw new Error("This payment requires fee sponsorship, which the server didn't offer.");
  }
  if (BigInt(accepted.amount) > priceToAtomicUnits(displayedPrice)) {
    throw new Error("The requested payment is higher than the displayed price.");
  }

  return {
    x402Version: parsed.x402Version,
    accepted,
    resource: parsed.resource,
    ...(parsed.extensions ? { extensions: parsed.extensions } : {}),
  };
}

/** Soroban RPC for the app's network; mainnet needs `extra.sorobanRpcUrl`. */
export function sorobanRpcUrl(customUrl?: string): string {
  if (customUrl?.trim()) return customUrl.trim();
  if (appNetworkId() === STELLAR_NETWORK_IDS.testnet) return DEFAULT_TESTNET_RPC_URL;
  throw new Error("Stellar mainnet payments need a Soroban RPC URL (app.json extra.sorobanRpcUrl).");
}

function assertSimulationOk(simulation: rpc.Api.SimulateTransactionResponse | undefined) {
  if (!simulation) {
    throw new Error("The payment couldn't be simulated.");
  }
  if (rpc.Api.isSimulationRestore(simulation)) {
    throw new Error("The payment needs a ledger restore first; try again later.");
  }
  if (rpc.Api.isSimulationError(simulation)) {
    throw new Error(`The payment simulation failed: ${simulation.error}`);
  }
}

/**
 * Builds the USDC `transfer` the "exact" scheme expects and signs only its
 * authorization entry, so the facilitator can pay the fees. Returns the
 * transaction XDR for the `PAYMENT-SIGNATURE` payload.
 */
export async function signPaymentTransaction(
  challenge: PaymentChallenge,
  secret: string,
  rpcUrl: string = sorobanRpcUrl()
): Promise<string> {
  const keypair = Keypair.fromSecret(secret.trim());
  const payer = keypair.publicKey();
  const { asset, payTo, amount, maxTimeoutSeconds } = challenge.accepted;
  const networkPassphrase = DEFAULT_NETWORK_PASSPHRASE;

  const latestLedger = await new rpc.Server(rpcUrl).getLatestLedger();
  const expiration =
    latestLedger.sequence + Math.ceil(maxTimeoutSeconds / DEFAULT_LEDGER_SECONDS);

  const tx = await contract.AssembledTransaction.build({
    contractId: asset,
    method: "transfer",
    args: [
      nativeToScVal(payer, { type: "address" }),
      nativeToScVal(payTo, { type: "address" }),
      nativeToScVal(BigInt(amount), { type: "i128" }),
    ],
    networkPassphrase,
    rpcUrl,
    parseResultXdr: (result) => result,
  });
  assertSimulationOk(tx.simulation);

  const missing = tx.needsNonInvokerSigningBy();
  if (!missing.includes(payer) || missing.length > 1) {
    throw new Error("This payment needs a signature from a different account.");
  }

  const { signAuthEntry } = contract.basicNodeSigner(keypair, networkPassphrase);
  await tx.signAuthEntries({ publicKey: payer, signAuthEntry, expiration });
  await tx.simulate();
  assertSimulationOk(tx.simulation);
  if (tx.needsNonInvokerSigningBy().length > 0) {
    throw new Error("The payment still needs another signature.");
  }

  if (!tx.built) {
    throw new Error("The payment transaction couldn't be built.");
  }
  return tx.built.toXDR();
}

/** Encodes the `PAYMENT-SIGNATURE` header exactly as `@x402/core` does. */
export function encodePaymentSignature(challenge: PaymentChallenge, transaction: string): string {
  return encodeBase64Json({
    x402Version: challenge.x402Version,
    payload: { transaction },
    extensions: challenge.extensions,
    resource: challenge.resource,
    accepted: challenge.accepted,
  });
}

/** Requests the resource; returns it directly, or the challenge to pay. */
export async function prepareResourceAccess(
  url: string,
  displayedPrice: string
): Promise<ResourceAccess> {
  try {
    const { data, headers } = await request<string | undefined>(url, {
      responseType: "text",
      skipBodyForBinary: true,
      retry: false,
      fallbackMessage: (status) => `Failed to access resource (${status}).`,
    });
    return {
      type: "ready",
      result: await resolveResponse(headers.get("content-type"), data, url),
    };
  } catch (error) {
    if (error instanceof ApiError && error.status === 402) {
      return {
        type: "payment",
        challenge: parsePaymentRequired(
          error.headers?.get(PAYMENT_REQUIRED_HEADER) ?? null,
          displayedPrice
        ),
      };
    }
    throw error;
  }
}

/** Retries the request with the signed payment. */
export async function submitSignedPayment(
  url: string,
  challenge: PaymentChallenge,
  transaction: string
): Promise<AccessResult> {
  const { data, headers: resHeaders } = await request<string | undefined>(url, {
    headers: { [PAYMENT_SIGNATURE_HEADER]: encodePaymentSignature(challenge, transaction) },
    responseType: "text",
    skipBodyForBinary: true,
    retry: false,
    fallbackMessage: (status) => status === 402
      ? "The payment was not accepted. Check your USDC balance and try again."
      : `Failed to access resource (${status}).`,
  });

  // A receipt is best effort. Missing/malformed settlement metadata or a full
  // device must never turn an accepted payment into a retry (and double charge).
  try {
    const header = resHeaders.get(PAYMENT_RESPONSE_HEADER);
    if (header) {
      const settlement = decodeBase64Json(header) as Record<string, unknown> | null;
      if (settlement?.success === true &&
        typeof settlement.transaction === "string" && settlement.transaction &&
        typeof settlement.network === "string") {
        const resource = challenge.resource as { url?: unknown; description?: unknown } | null;
        await saveReceipt({
          resourceId: typeof resource?.url === "string" ? parseResourceId(resource.url) : null,
          title: typeof resource?.description === "string" ? resource.description : "",
          amount: challenge.accepted.amount,
          asset: challenge.accepted.asset,
          network: settlement.network,
          txHash: settlement.transaction,
          // SettleResponse.payer is optional in @x402/core; keep the receipt without it.
          payer: typeof settlement.payer === "string" ? settlement.payer : "",
          paidAt: new Date().toISOString(),
        });
      }
    }
  } catch { /* The content remains accessible even if a receipt cannot be saved. */ }

  return resolveResponse(resHeaders.get("content-type"), data, url);
}

async function resolveResponse(
  contentType: string | null,
  text: string | undefined,
  fallbackUrl: string
): Promise<AccessResult> {
  const type = contentType ?? "";
  if (type.includes("text") || type.includes("json")) {
    return { type: "text", content: text ?? "" };
  }
  // Binary and unknown content types open in the external browser.
  return { type: "external", url: fallbackUrl };
}

/** Shape of a server receipt from `GET /payments/:id/receipt`. */
export interface ServerReceipt {
  id: string;
  resourceId: string | null;
  resourceTitle: string;
  amount: string;
  asset: string;
  network: string;
  txHash: string;
  payer: string;
  paidAt: string;
  verified: boolean;
  verificationDetails?: {
    localTxHashMatch: boolean;
    localAmountMatch: boolean;
    localNetworkMatch: boolean;
  };
}

const UNEXPECTED = "The server returned an unexpected response.";

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") throw new Error(UNEXPECTED);
  return value as Record<string, unknown>;
}

/** Validates `GET /payments/:id/receipt` before it reaches verification UI. */
export const serverReceiptSchema = (value: unknown): ServerReceipt => {
  const row = asRecord(value);
  if (
    typeof row.id !== "string" ||
    (typeof row.resourceId !== "string" && row.resourceId !== null) ||
    (typeof row.resourceTitle !== "string" && row.resourceTitle !== null) ||
    typeof row.amount !== "string" ||
    typeof row.asset !== "string" ||
    typeof row.network !== "string" ||
    typeof row.txHash !== "string" ||
    typeof row.payer !== "string" ||
    typeof row.paidAt !== "string" ||
    typeof row.verified !== "boolean"
  ) {
    throw new Error(UNEXPECTED);
  }
  if (row.verificationDetails !== undefined && row.verificationDetails !== null) {
    const details = asRecord(row.verificationDetails);
    if (
      typeof details.localTxHashMatch !== "boolean" ||
      typeof details.localAmountMatch !== "boolean" ||
      typeof details.localNetworkMatch !== "boolean"
    ) {
      throw new Error(UNEXPECTED);
    }
  }
  // Older servers can return a null title; the verification UI already treats
  // it as empty, so normalize here instead of failing the whole receipt.
  return { ...row, resourceTitle: row.resourceTitle ?? "" } as ServerReceipt;
};

/** Fetches a receipt from the server for verification. */
export async function fetchReceipt(paymentId: string): Promise<ServerReceipt> {
  const { data } = await request<ServerReceipt>(
    `${getApiBaseUrl()}/payments/${encodeURIComponent(paymentId)}/receipt`,
    {
      fallbackMessage: "Failed to fetch receipt",
      // The plain-fetch original made a single attempt.
      retry: false,
      schema: serverReceiptSchema,
    }
  );
  return data;
}
