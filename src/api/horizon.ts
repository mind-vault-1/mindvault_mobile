import Constants from "expo-constants";

import { DEFAULT_STELLAR_NETWORK } from "./resources";
import { getPublicKey } from "../services/wallet";

/** Classic USDC issuers, from the server's registry-client network presets. */
export const USDC_ISSUER: Record<"testnet" | "mainnet", string> = {
  testnet: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
  mainnet: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
};

export const HORIZON_URL: Record<"testnet" | "mainnet", string> = {
  testnet: "https://horizon-testnet.stellar.org",
  mainnet: "https://horizon.stellar.org",
};

const USDC_DECIMALS = 7;
const USDC_SCALE = BigInt(10) ** BigInt(USDC_DECIMALS);

export type UsdcCheck =
  | { status: "ok" }
  | { status: "missing-trustline"; message: string }
  | {
      status: "insufficient-balance";
      message: string;
      available: string;
      required: string;
    }
  /** Horizon or wallet lookup failed: warn, but let the payment flow continue. */
  | { status: "unavailable"; warning: string };

export interface UsdcCheckOptions {
  /** Cancels the in-flight Horizon request when the pay sheet closes. */
  signal?: AbortSignal;
  /** Defaults to the public key stored by the local wallet. */
  address?: string;
  /** Defaults to the app's configured Stellar network. */
  network?: "testnet" | "mainnet";
  horizonUrl?: string;
  /** Override for self-hosted deployments using a different classic USDC issuer. */
  issuer?: string;
  /** Injectable for tests; defaults to the global fetch. */
  fetchFn?: typeof fetch;
}

function resolveNetwork(network: string): "testnet" | "mainnet" {
  const normalized = network.trim().toLowerCase();
  if (normalized === "mainnet" || normalized === "pubnet" || normalized === "public") {
    return "mainnet";
  }
  return "testnet";
}

/** Converts a USDC decimal string to 7-decimal base units. */
export function usdcToStroops(value: string): bigint | null {
  const trimmed = value.trim();
  if (!/^\d+(?:\.\d+)?$/.test(trimmed)) return null;
  const [whole, fraction = ""] = trimmed.split(".");
  if (fraction.length > USDC_DECIMALS) return null;
  return BigInt(whole) * USDC_SCALE + BigInt((fraction + "0".repeat(USDC_DECIMALS)).slice(0, USDC_DECIMALS));
}

function formatStroops(value: bigint): string {
  const whole = value / USDC_SCALE;
  const fraction = ("0000000" + (value % USDC_SCALE).toString()).slice(-USDC_DECIMALS).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
}

function isAbort(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  return error instanceof Error && error.name === "AbortError";
}

const HORIZON_WARNING =
  "Couldn't check your USDC balance right now. You can still try the payment.";

/**
 * Checks that the paying wallet has a USDC trustline and enough USDC for the
 * displayed price. Horizon failures are non-fatal: the caller gets a warning
 * and the normal x402 flow proceeds, since the server still enforces payment.
 */
export async function checkUsdcForPayment(
  price: string,
  options: UsdcCheckOptions = {}
): Promise<UsdcCheck> {
  if (options.signal?.aborted) throw new Error("USDC check cancelled");

  const required = usdcToStroops(price);
  if (required === null || required <= BigInt(0)) {
    return { status: "unavailable", warning: HORIZON_WARNING };
  }

  let address = options.address?.trim();
  if (!address) {
    try {
      address = (await getPublicKey())?.trim() || undefined;
    } catch {
      return { status: "unavailable", warning: HORIZON_WARNING };
    }
  }
  if (!address) {
    return { status: "unavailable", warning: HORIZON_WARNING };
  }

  const network = resolveNetwork(options.network ?? DEFAULT_STELLAR_NETWORK);
  const url = `${(options.horizonUrl ?? HORIZON_URL[network]).replace(/\/+$/, "")}/accounts/${encodeURIComponent(address)}`;
  const fetchFn = options.fetchFn ?? global.fetch;

  let response: Response;
  try {
    response = await fetchFn(url, options.signal ? { signal: options.signal } : undefined);
  } catch (error) {
    if (isAbort(error, options.signal)) throw error;
    return { status: "unavailable", warning: HORIZON_WARNING };
  }

  if (response.status === 404) {
    return {
      status: "missing-trustline",
      message: "Your wallet needs a USDC trustline before you can pay. Open Wallet to add USDC.",
    };
  }
  if (!response.ok) {
    return { status: "unavailable", warning: HORIZON_WARNING };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    if (isAbort(error, options.signal)) throw error;
    return { status: "unavailable", warning: HORIZON_WARNING };
  }

  const balances = (body as { balances?: unknown } | null)?.balances;
  // Self-hosted deployments can override the classic issuer without patching
  // the app: app.json -> expo.extra.usdcIssuer, or the caller's `issuer`.
  const configuredIssuer = (Constants.expoConfig?.extra?.usdcIssuer as string | undefined)?.trim();
  const issuer = options.issuer?.trim() || configuredIssuer || USDC_ISSUER[network];
  const usdc = Array.isArray(balances)
    ? balances.find((entry) => {
        if (!entry || typeof entry !== "object") return false;
        const row = entry as Record<string, unknown>;
        return row.asset_code === "USDC" && row.asset_issuer === issuer;
      })
    : undefined;

  if (!usdc || typeof (usdc as Record<string, unknown>).balance !== "string") {
    return {
      status: "missing-trustline",
      message: "Your wallet needs a USDC trustline before you can pay. Open Wallet to add USDC.",
    };
  }

  const available = usdcToStroops((usdc as Record<string, unknown>).balance as string);
  if (available === null) {
    return { status: "unavailable", warning: HORIZON_WARNING };
  }
  if (available < required) {
    return {
      status: "insufficient-balance",
      message: `You need ${formatStroops(required)} USDC to pay, but your wallet has ${formatStroops(available)} USDC. Open Wallet to add USDC.`,
      available: formatStroops(available),
      required: formatStroops(required),
    };
  }

  return { status: "ok" };
}
