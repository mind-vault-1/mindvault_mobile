import {
  Account,
  Address,
  Contract,
  StrKey,
  TransactionBuilder,
  nativeToScVal,
} from "@stellar/stellar-sdk";
import { Buffer } from "buffer";

import type { AccessResult } from "../types";
import { extractApiErrorMessage } from "../utils/errorLogger";
import { DEFAULT_NETWORK_PASSPHRASE, DEFAULT_STELLAR_NETWORK } from "./resources";

const STELLAR_NETWORK_IDS = {
  mainnet: "stellar:pubnet",
  testnet: "stellar:testnet",
} as const;
const STELLAR_USDC_DECIMALS = 7;

interface X402PaymentRequirements {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  payTo: string;
  asset: string;
  maxTimeoutSeconds?: number;
}

interface X402PaymentRequiredResponse {
  x402Version: number;
  accepts: X402PaymentRequirements[];
}

export interface PaymentChallenge {
  x402Version: number;
  accepted: X402PaymentRequirements;
  networkPassphrase: string;
  unsignedXdr: string;
}

export type ResourceAccess =
  | { type: "ready"; result: AccessResult }
  | { type: "payment"; challenge: PaymentChallenge };

export function parsePaymentChallenge(
  body: string,
  displayedPrice: string
): Omit<PaymentChallenge, "networkPassphrase" | "unsignedXdr"> {
  let parsed: X402PaymentRequiredResponse;

  try {
    parsed = JSON.parse(body) as X402PaymentRequiredResponse;
  } catch {
    throw new Error("402 received but the x402 challenge body was invalid.");
  }

  if (parsed.x402Version !== 1 && parsed.x402Version !== 2) {
    throw new Error("402 received but the x402 challenge version is unsupported.");
  }

  if (!Array.isArray(parsed.accepts) || parsed.accepts.length === 0) {
    throw new Error("402 received but the x402 challenge did not include any payment options.");
  }

  const exactOptions = parsed.accepts.filter((option) => option?.scheme === "exact");
  if (exactOptions.length === 0) {
    throw new Error("This resource uses an unsupported payment scheme.");
  }

  const appNetwork = STELLAR_NETWORK_IDS[DEFAULT_STELLAR_NETWORK as keyof typeof STELLAR_NETWORK_IDS];
  if (!appNetwork) {
    throw new Error("This app network does not support x402 payments.");
  }

  const accepted = exactOptions.find((option) => option?.network === appNetwork);
  if (!accepted) {
    throw new Error(`This resource requires ${exactOptions[0].network}, but the app is on ${appNetwork}.`);
  }

  if (
    !accepted.payTo ||
    !accepted.asset ||
    !accepted.maxAmountRequired ||
    !/^\d+$/.test(accepted.maxAmountRequired)
  ) {
    throw new Error("402 received but the x402 payment requirements were incomplete.");
  }

  if (BigInt(accepted.maxAmountRequired) > priceToAtomicUnits(displayedPrice)) {
    throw new Error("The requested payment is higher than the displayed price.");
  }

  return {
    x402Version: parsed.x402Version,
    accepted,
  };
}

export function buildUnsignedPaymentTransaction(
  challenge: Omit<PaymentChallenge, "networkPassphrase" | "unsignedXdr">,
  payerPublicKey: string
): string {
  const publicKey = payerPublicKey.trim();
  if (!StrKey.isValidEd25519PublicKey(publicKey)) {
    throw new Error("Enter a valid Stellar public key.");
  }

  const contract = new Contract(challenge.accepted.asset);
  const transaction = new TransactionBuilder(new Account(publicKey, "0"), {
    fee: "100",
    networkPassphrase: DEFAULT_NETWORK_PASSPHRASE,
  })
    .addOperation(
      contract.call(
        "transfer",
        Address.fromString(publicKey).toScVal(),
        Address.fromString(challenge.accepted.payTo).toScVal(),
        nativeToScVal(BigInt(challenge.accepted.maxAmountRequired), { type: "i128" })
      )
    )
    .setTimeout(challenge.accepted.maxTimeoutSeconds ?? 60)
    .build();

  return transaction.toXDR();
}

export async function prepareResourceAccess(
  url: string,
  displayedPrice: string,
  payerPublicKey: string
): Promise<ResourceAccess> {
  const firstRes = await fetch(url);

  if (firstRes.status === 402) {
    const challenge = parsePaymentChallenge(await firstRes.text(), displayedPrice);
    return {
      type: "payment",
      challenge: {
        ...challenge,
        networkPassphrase: DEFAULT_NETWORK_PASSPHRASE,
        unsignedXdr: buildUnsignedPaymentTransaction(challenge, payerPublicKey),
      },
    };
  }

  if (!firstRes.ok) {
    throw new Error(
      await extractApiErrorMessage(firstRes, `Failed to access resource (${firstRes.status}).`)
    );
  }

  return { type: "ready", result: await resolveResponse(firstRes, url) };
}

export async function submitSignedPayment(
  url: string,
  challenge: PaymentChallenge,
  signedXdr: string
): Promise<AccessResult> {
  const secondRes = await fetch(url, {
    headers: {
      "X-PAYMENT": encodePaymentHeader(challenge, signedXdr),
    },
  });

  if (!secondRes.ok) {
    throw new Error(
      await extractApiErrorMessage(
        secondRes,
        secondRes.status === 402
          ? "Payment rejected by the server."
          : `Failed to access resource (${secondRes.status}).`
      )
    );
  }

  return resolveResponse(secondRes, url);
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

function encodePaymentHeader(challenge: PaymentChallenge, signedXdr: string): string {
  return Buffer.from(
    JSON.stringify({
      x402Version: challenge.x402Version,
      scheme: challenge.accepted.scheme,
      network: challenge.accepted.network,
      payload: {
        transaction: signedXdr,
      },
    }),
    "utf8"
  ).toString("base64");
}

function priceToAtomicUnits(price: string): bigint {
  const trimmed = price.trim();
  if (!/^\d+(?:\.\d+)?$/.test(trimmed)) {
    throw new Error("The displayed price is invalid.");
  }

  const [whole, fraction = ""] = trimmed.split(".");
  const normalizedFraction = fraction.padEnd(STELLAR_USDC_DECIMALS, "0").slice(0, STELLAR_USDC_DECIMALS);
  return BigInt(`${whole}${normalizedFraction}`);
}
