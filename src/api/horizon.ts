import { Asset, Horizon, Operation, TransactionBuilder } from "@stellar/stellar-sdk";

import type { StellarNetworkConfig } from "../config/network";

export const TESTNET_USDC_ASSET_CODE = "USDC";

export interface FriendbotResult {
  funded: boolean;
  hash?: string;
}

function serverFor(config: StellarNetworkConfig): Horizon.Server {
  return new Horizon.Server(config.horizonUrl);
}

function assertTestnetConfig(config: StellarNetworkConfig): void {
  if (!config.friendbotUrl || config.id === "mainnet") {
    throw new Error("Friendbot is available on test networks only.");
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
