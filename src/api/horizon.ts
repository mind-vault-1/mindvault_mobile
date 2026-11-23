import { Horizon } from "@stellar/stellar-sdk";

import { DEFAULT_STELLAR_NETWORK } from "./resources";

const HORIZON_URLS: Record<string, string> = {
  mainnet: "https://horizon.stellar.org",
  testnet: "https://horizon-testnet.stellar.org",
  futurenet: "https://horizon-futurenet.stellar.org",
};

const DEFAULT_HORIZON_TIMEOUT_MS = 15_000;

/** Balances for the wallet's configured Stellar network. */
export interface WalletBalances {
  xlm: string;
  /** null when no USDC trustline exists on this account. */
  usdc: string | null;
}

/**
 * Returns the Horizon base URL for the app's configured Stellar network.
 * Throws if the network is not recognised.
 */
export function getHorizonUrl(): string {
  const url = HORIZON_URLS[DEFAULT_STELLAR_NETWORK];
  if (!url) {
    throw new Error(
      `No Horizon URL configured for network "${DEFAULT_STELLAR_NETWORK}".`
    );
  }
  return url;
}

function makeServer(): Horizon.Server {
  return new Horizon.Server(getHorizonUrl(), {
    allowHttp: DEFAULT_STELLAR_NETWORK === "testnet" || DEFAULT_STELLAR_NETWORK === "futurenet",
  });
}

/**
 * Fetches the XLM and USDC balances for `address` from Stellar Horizon.
 *
 * - Unfunded accounts (404 from Horizon) resolve to `{ xlm: "0", usdc: null }`.
 * - Accounts without a USDC trustline resolve with `usdc: null`.
 * - Network failures throw an `Error` with a user-safe message.
 */
export async function fetchWalletBalances(address: string): Promise<WalletBalances> {
  if (!address.trim()) {
    throw new Error("A wallet address is required.");
  }

  const server = makeServer();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_HORIZON_TIMEOUT_MS);

  try {
    const account = await server.loadAccount(address);
    const balances = account.balances;

    const xlmEntry = balances.find(
      (b): b is Horizon.HorizonApi.BalanceLine =>
        b.asset_type === "native"
    );
    const usdcEntry = balances.find(
      (b): b is Horizon.HorizonApi.BalanceLine =>
        b.asset_type !== "native" &&
        "asset_code" in b &&
        b.asset_code === "USDC"
    );

    return {
      xlm: xlmEntry?.balance ?? "0",
      usdc: usdcEntry ? usdcEntry.balance : null,
    };
  } catch (error) {
    // Horizon throws an object with status 404 for unfunded accounts.
    if (isHorizonNotFound(error)) {
      return { xlm: "0", usdc: null };
    }

    if (controller.signal.aborted) {
      throw new Error("The request timed out. Please try again.");
    }

    if (error instanceof Error) {
      // Surface the message if it looks user-safe; otherwise use a generic one.
      const msg = error.message;
      if (msg && !msg.toLowerCase().includes("network request failed") && !msg.toLowerCase().includes("failed to fetch")) {
        throw new Error(msg);
      }
    }

    throw new Error("Network error. Please check your connection.");
  } finally {
    clearTimeout(timer);
  }
}

/** Returns true when Horizon's error response indicates a 404 (unfunded account). */
function isHorizonNotFound(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as Record<string, unknown>;
  // Horizon SDK wraps HTTP errors with a `response.status` field.
  if (typeof e.status === "number" && e.status === 404) return true;
  if (
    e.response &&
    typeof e.response === "object" &&
    typeof (e.response as Record<string, unknown>).status === "number" &&
    (e.response as Record<string, unknown>).status === 404
  ) {
    return true;
  }
  return false;
}
