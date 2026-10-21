import Constants from "expo-constants";
import { Buffer } from "buffer";
import { getApiBaseUrl } from "./resources";
import { getApiKey } from "../services/secureStorage";
import { extractApiErrorMessage } from "../utils/errorLogger";

/** Lease tier as stored on-chain (0=hour, 1=day, 2=week). */
export type LeaseTier = 0 | 1 | 2;

/** Human-readable label for a lease tier. */
export function leaseTierLabel(tier: LeaseTier): string {
  return tier === 0 ? "Hour" : tier === 1 ? "Day" : "Week";
}

/** Seconds in each lease tier. */
export function leaseTierSeconds(tier: LeaseTier): number {
  return tier === 0 ? 3600 : tier === 1 ? 86400 : 604800;
}

/** Quote returned by the server for a lease tier. */
export interface LeaseQuote {
  resourceId: string;
  tier: LeaseTier;
  creator: string;
  price: string; // USDC in atomic units (7 decimals)
}

/** Result of a lease purchase. */
export interface LeasePurchaseResult {
  resourceId: string;
  tier: LeaseTier;
  state: "Pending" | "Active" | "Expired";
  expiresAt: string | null;
  txHash: string;
}

/** Creates a Soroban contract client for the vault registry. */
export async function getRegistryClient() {
  const { contract } = await import("@stellar/stellar-sdk");
  const registryContractId =
    (Constants.expoConfig?.extra?.registryContractId as string | undefined)?.trim() ??
    "CDQKUIADLO5S5WEHEUTTXX2M45WAHVRU2PBEBD6ZGDKMOP5A72FJ3OD4";
  const rpcUrl =
    (Constants.expoConfig?.extra?.sorobanRpcUrl as string | undefined)?.trim() ??
    "https://soroban-testnet.stellar.org";
  const networkPassphrase =
    (Constants.expoConfig?.extra?.networkPassphrase as string | undefined) ??
    "Test SDF Network ; September 2015";

  return new contract.Client({
    contractId: registryContractId,
    networkPassphrase,
    rpcUrl,
  });
}

/** Fetches a lease quote from the API. */
export async function quoteLease(resourceId: string, tier: LeaseTier): Promise<LeaseQuote> {
  const res = await fetch(`${getApiBaseUrl()}/resources/${encodeURIComponent(resourceId)}/lease/quote?tier=${tier}`, {
    headers: { "Content-Type": "application/json" },
  });

  if (!res.ok) {
    const message = await extractApiErrorMessage(res, "Failed to fetch lease quote");
    throw new Error(message);
  }

  const data = (await res.json()) as LeaseQuote & { price: string | number };
  return { ...data, price: String(data.price) };
}

/** Buys a lease: (1) transfers USDC to creator, (2) calls buy_lease on registry. */
export async function buyLease(
  resourceId: string,
  tier: LeaseTier,
  secretKey: string,
  signTransaction: (xdr: string, networkPassphrase: string) => Promise<string>
): Promise<LeasePurchaseResult> {
  // Step 1: Get quote to know the amount and creator
  const quote = await quoteLease(resourceId, tier);
  const amount = quote.price;
  const creator = quote.creator;

  // Step 2: Build and sign USDC transfer
  const { Keypair, contract, nativeToScVal, rpc } = await import("@stellar/stellar-sdk");

  const keypair = Keypair.fromSecret(secretKey.trim());
  const payer = keypair.publicKey();

  const USDC_CONTRACT_ID = "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";
  const networkPassphrase =
    (Constants.expoConfig?.extra?.networkPassphrase as string | undefined) ??
    "Test SDF Network ; September 2015";
  const rpcUrl =
    (Constants.expoConfig?.extra?.sorobanRpcUrl as string | undefined)?.trim() ??
    "https://soroban-testnet.stellar.org";

  // Build USDC transfer transaction
  const latestLedger = await new rpc.Server(rpcUrl).getLatestLedger();
  const expiration = latestLedger.sequence + Math.ceil(300 / 5); // 5 min timeout

  const transferTx = await contract.AssembledTransaction.build({
    contractId: USDC_CONTRACT_ID,
    method: "transfer",
    args: [
      nativeToScVal(payer, { type: "address" }),
      nativeToScVal(creator, { type: "address" }),
      nativeToScVal(BigInt(amount), { type: "i128" }),
    ],
    networkPassphrase,
    rpcUrl,
    parseResultXdr: (result) => result,
  });

  // Verify simulation
  if (!transferTx.simulation) throw new Error("USDC transfer simulation failed");
  if (rpc.Api.isSimulationError(transferTx.simulation)) {
    throw new Error(`USDC transfer simulation failed: ${transferTx.simulation.error}`);
  }
  if (rpc.Api.isSimulationRestore(transferTx.simulation)) {
    throw new Error("USDC transfer needs ledger restore; try again later");
  }

  const missing = transferTx.needsNonInvokerSigningBy();
  if (!missing.includes(payer) || missing.length > 1) {
    throw new Error("USDC transfer needs signature from a different account");
  }

  const { signAuthEntry } = contract.basicNodeSigner(keypair, networkPassphrase);
  await transferTx.signAuthEntries({ publicKey: payer, signAuthEntry, expiration });
  await transferTx.simulate();

  if (transferTx.needsNonInvokerSigningBy().length > 0) {
    throw new Error("USDC transfer still needs another signature");
  }

  if (!transferTx.built) throw new Error("USDC transfer transaction could not be built");

  const transferXdr = transferTx.built.toXDR();
  const signedTransferXdr = await signTransaction(transferXdr, networkPassphrase);

  // Submit the USDC transfer to get the transaction hash
  const server = new rpc.Server(rpcUrl);
  const submitResponse = await server.sendTransaction(signedTransferXdr);

  if (submitResponse.status !== "PENDING") {
    throw new Error(`USDC transfer failed: ${submitResponse.errorResultXdr ?? "unknown"}`);
  }

  const txHash = submitResponse.hash;

  // Step 3: Call buy_lease on the registry
  const registry = await getRegistryClient();
  const holder = payer;

  const buyLeaseAssembled = await registry.buy_lease({
    holder: nativeToScVal(holder, { type: "address" }),
    resource_id: nativeToScVal(resourceId, { type: "string" }),
    tier: nativeToScVal(tier, { type: "u32" }),
    amount: nativeToScVal(BigInt(amount), { type: "i128" }),
    tx_hash: nativeToScVal(Buffer.from(txHash, "hex"), { type: "bytes" }),
  });

  // Verify buy_lease simulation
  if (!buyLeaseAssembled.simulation) throw new Error("buy_lease simulation failed");
  if (rpc.Api.isSimulationError(buyLeaseAssembled.simulation)) {
    throw new Error(`buy_lease simulation failed: ${buyLeaseAssembled.simulation.error}`);
  }
  if (rpc.Api.isSimulationRestore(buyLeaseAssembled.simulation)) {
    throw new Error("buy_lease needs ledger restore; try again later");
  }

  const buyLeaseMissing = buyLeaseAssembled.needsNonInvokerSigningBy();
  if (!buyLeaseMissing.includes(payer) || buyLeaseMissing.length > 1) {
    throw new Error("buy_lease needs signature from a different account");
  }

  await buyLeaseAssembled.signAuthEntries({ publicKey: payer, signAuthEntry, expiration });
  await buyLeaseAssembled.simulate();

  if (buyLeaseAssembled.needsNonInvokerSigningBy().length > 0) {
    throw new Error("buy_lease still needs another signature");
  }

  if (!buyLeaseAssembled.built) throw new Error("buy_lease transaction could not be built");

  // Sign the buy_lease transaction with the user's key
  const buyLeaseUnsignedXdr = buyLeaseAssembled.built.toXDR();
  const signedBuyLeaseXdr = await signTransaction(buyLeaseUnsignedXdr, networkPassphrase);

  // Submit the buy_lease transaction
  const buyLeaseResponse = await server.sendTransaction(signedBuyLeaseXdr);

  if (buyLeaseResponse.status !== "PENDING") {
    throw new Error(`buy_lease failed: ${buyLeaseResponse.errorResultXdr ?? "unknown"}`);
  }

  // Return the result with the buy_lease transaction hash
  return {
    resourceId,
    tier,
    state: "Pending",
    expiresAt: null,
    txHash: buyLeaseResponse.hash,
  };
}