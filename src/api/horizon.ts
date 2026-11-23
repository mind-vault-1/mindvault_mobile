import { Asset, Horizon, Operation, TransactionBuilder } from "@stellar/stellar-sdk";

import { getNetworkConfig, type StellarNetworkConfig } from "../config/network";

export const TESTNET_USDC_ASSET_CODE = "USDC";
const USDC_DECIMALS = 7;

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
