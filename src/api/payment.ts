import { Keypair, StrKey, contract, nativeToScVal, rpc } from "@stellar/stellar-sdk";
import { Buffer } from "buffer";

import type { AccessResult } from "../types";
import { extractApiErrorMessage } from "../utils/errorLogger";
import { DEFAULT_NETWORK_PASSPHRASE, DEFAULT_STELLAR_NETWORK } from "./resources";

/**
 * Client for the server's x402 v2 paywall (`@x402/express` with the
 * `@x402/stellar` "exact" scheme). It mirrors `ExactStellarScheme` from
 * `@x402/stellar/exact/client`; see docs/PAYMENTS.md for the flow.
 */
export const X402_VERSION = 2;
export const PAYMENT_REQUIRED_HEADER = "PAYMENT-REQUIRED";
export const PAYMENT_SIGNATURE_HEADER = "PAYMENT-SIGNATURE";

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
  const firstRes = await fetch(url);

  if (firstRes.status === 402) {
    return {
      type: "payment",
      challenge: parsePaymentRequired(firstRes.headers.get(PAYMENT_REQUIRED_HEADER), displayedPrice),
    };
  }

  if (!firstRes.ok) {
    throw new Error(
      await extractApiErrorMessage(firstRes, `Failed to access resource (${firstRes.status}).`)
    );
  }

  return { type: "ready", result: await resolveResponse(firstRes, url) };
}

/** Retries the request with the signed payment. */
export async function submitSignedPayment(
  url: string,
  challenge: PaymentChallenge,
  transaction: string
): Promise<AccessResult> {
  const res = await fetch(url, {
    headers: { [PAYMENT_SIGNATURE_HEADER]: encodePaymentSignature(challenge, transaction) },
  });

  if (!res.ok) {
    throw new Error(
      await extractApiErrorMessage(
        res,
        res.status === 402
          ? "The payment was not accepted. Check your USDC balance and try again."
          : `Failed to access resource (${res.status}).`
      )
    );
  }

  return resolveResponse(res, url);
}

async function resolveResponse(res: Response, fallbackUrl: string): Promise<AccessResult> {
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("text") || contentType.includes("json")) {
    return { type: "text", content: await res.text() };
  }
  // Binary and unknown content types open in the external browser.
  return { type: "external", url: fallbackUrl };
}
