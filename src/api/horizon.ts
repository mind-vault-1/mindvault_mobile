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

import { Asset, Horizon, Operation, TransactionBuilder } from "@stellar/stellar-sdk";

import { getNetworkConfig, type StellarNetworkConfig } from "../config/network";

export const TESTNET_USDC_ASSET_CODE = "USDC";
const USDC_DECIMALS = 7;

export interface WalletBalances {
  xlm: string;
  /** null when the account has no USDC trustline. */
  usdc: string | null;
}

export interface FriendbotResult {
  funded: boolean;
  hash?: string;
}

export type UsdcPaymentCheck =
  | { status: "ok" }
  | { status: "missing-trustline"; message: string }
  | { status: "insufficient-balance"; message: string }
  | { status: "unavailable"; warning: string };

export interface CheckUsdcForPaymentOptions {
  publicKey?: string | null;
  signal?: AbortSignal;
}

interface HorizonBalance {
  asset_code?: string;
  asset_issuer?: string;
  balance?: string;
}

function parseUsdcAmount(value: string): bigint {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) throw new Error("Invalid USDC amount.");
  const [whole, fraction = ""] = normalized.split(".");
  if (fraction.length > USDC_DECIMALS) throw new Error("Too many USDC decimals.");
  const scale = BigInt(10) ** BigInt(USDC_DECIMALS);
  return BigInt(whole) * scale + BigInt(fraction.padEnd(USDC_DECIMALS, "0") || "0");
}

function serverFor(config: StellarNetworkConfig): Horizon.Server {
  return new Horizon.Server(config.horizonUrl);
}

/** Horizon URL for the app's currently configured network. */
export function getHorizonUrl(): string {
  return getNetworkConfig().horizonUrl;
}

function isHorizonNotFound(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const row = error as Record<string, unknown>;
  if (row.status === 404) return true;
  const response = row.response as Record<string, unknown> | undefined;
  return response?.status === 404;
}

/**
 * Fetches XLM and USDC balances for an address. Unfunded accounts resolve to
 * zero balances rather than an error so the wallet screen can show them.
 */
export async function fetchWalletBalances(address: string): Promise<WalletBalances> {
  const trimmed = address.trim();
  if (!trimmed) throw new Error("A wallet address is required.");

  try {
    const account = await serverFor(getNetworkConfig()).loadAccount(trimmed);
    const balances = account.balances;
    const xlmEntry = balances.find((balance) => balance.asset_type === "native");
    const usdcEntry = balances.find(
      (balance) =>
        balance.asset_type !== "native" &&
        "asset_code" in balance &&
        balance.asset_code === TESTNET_USDC_ASSET_CODE
    );
    return {
      xlm: xlmEntry?.balance ?? "0",
      usdc: usdcEntry && "balance" in usdcEntry ? usdcEntry.balance : null,
    };
  } catch (error) {
    if (isHorizonNotFound(error)) return { xlm: "0", usdc: null };
    if (error instanceof Error) {
      const message = error.message;
      if (message && !/network request failed|failed to fetch/i.test(message)) {
        throw new Error(message);
      }
    }
    throw new Error("Network error. Please check your connection.");
  }
}

function assertTestnetConfig(config: StellarNetworkConfig): void {
  if (!config.friendbotUrl || config.id === "mainnet") {
    throw new Error("Friendbot is available on test networks only.");
  }
}

export async function checkUsdcForPayment(
  price: string,
  { publicKey, signal }: CheckUsdcForPaymentOptions = {}
): Promise<UsdcPaymentCheck> {
  const config = getNetworkConfig();
  if (!config.usdcIssuer) {
    return { status: "unavailable", warning: "USDC checks are not available on this network." };
  }
  if (!publicKey) {
    return {
      status: "unavailable",
      warning: "Connect a wallet to check your USDC balance before paying.",
    };
  }

  try {
    const response = await fetch(
      `${config.horizonUrl}/accounts/${encodeURIComponent(publicKey)}`,
      { signal }
    );
    if (response.status === 404) {
      return {
        status: "missing-trustline",
        message: "Your wallet needs a USDC trustline before you can pay.",
      };
    }
    if (!response.ok) throw new Error(`Horizon returned ${response.status}`);

    const account = (await response.json()) as { balances?: HorizonBalance[] };
    const usdc = account.balances?.find(
      (balance) =>
        balance.asset_code === TESTNET_USDC_ASSET_CODE &&
        balance.asset_issuer === config.usdcIssuer
    );
    if (!usdc?.balance) {
      return {
        status: "missing-trustline",
        message: "Your wallet needs a USDC trustline before you can pay.",
      };
    }

    if (parseUsdcAmount(usdc.balance) < parseUsdcAmount(price)) {
      return {
        status: "insufficient-balance",
        message: "Your wallet does not have enough USDC to cover this payment.",
      };
    }
    return { status: "ok" };
  } catch {
    return { status: "unavailable", warning: "Couldn't check your USDC balance right now." };
  }
}

export async function fundWithFriendbot(
  publicKey: string,
  config: StellarNetworkConfig
): Promise<FriendbotResult> {
  assertTestnetConfig(config);
  const friendbotUrl = config.friendbotUrl as string;
  const response = await fetch(`${friendbotUrl}?addr=${encodeURIComponent(publicKey)}`);
  if (!response.ok) throw new Error("Friendbot could not fund this testnet account.");

  const body = (await response.json().catch(() => ({}))) as { hash?: string };
  return { funded: true, hash: body.hash };
}

export async function hasUsdcTrustline(
  publicKey: string,
  config: StellarNetworkConfig
): Promise<boolean> {
  if (!config.usdcIssuer) return false;
  const account = await serverFor(config).loadAccount(publicKey);
  return account.balances.some(
    (balance) =>
      "asset_code" in balance &&
      "asset_issuer" in balance &&
      balance.asset_code === TESTNET_USDC_ASSET_CODE &&
      balance.asset_issuer === config.usdcIssuer
  );
}

export async function buildAddUsdcTrustlineXdr(
  publicKey: string,
  config: StellarNetworkConfig
): Promise<string> {
  if (!config.usdcIssuer) throw new Error("USDC is not configured for this network.");
  const server = serverFor(config);
  const account = await server.loadAccount(publicKey);
  const transaction = new TransactionBuilder(account, {
    fee: "100",
    networkPassphrase: config.passphrase,
  })
    .addOperation(
      Operation.changeTrust({
        asset: new Asset(TESTNET_USDC_ASSET_CODE, config.usdcIssuer),
      })
    )
    .setTimeout(300)
    .build();
  return transaction.toXDR();
}

export async function submitSignedTransaction(
  signedXdr: string,
  config: StellarNetworkConfig
): Promise<string> {
  const transaction = TransactionBuilder.fromXDR(signedXdr, config.passphrase);
  const result = await serverFor(config).submitTransaction(transaction);
  return result.hash;
}
