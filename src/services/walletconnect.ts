// Must be the first import: polyfills crypto/storage/URL APIs WalletConnect needs on React Native.
import "@walletconnect/react-native-compat";
import SignClient from "@walletconnect/sign-client";
import type { SessionTypes } from "@walletconnect/types";
import Constants from "expo-constants";

/** Stellar methods requested from the wallet (WalletConnect's Stellar namespace). */
export const STELLAR_SIGN_METHOD = "stellar_signXDR";
const NAMESPACE = "stellar";
const USER_DISCONNECTED = { code: 6000, message: "User disconnected." };

/** Thrown when no WalletConnect project ID is configured. */
export class WalletConnectConfigError extends Error {
  constructor() {
    super(
      "WalletConnect is not configured. Set EXPO_PUBLIC_WALLETCONNECT_PROJECT_ID or expo.extra.walletConnectProjectId."
    );
    this.name = "WalletConnectConfigError";
  }
}

/** The connected wallet account. */
export interface WalletConnectAccount {
  topic: string;
  /** Stellar public key (G...). */
  address: string;
  /** CAIP-2 chain id, e.g. `stellar:testnet`. */
  chainId: string;
  /** Name of the wallet app, when it reports one. */
  walletName?: string;
}

/**
 * Reads the project ID from config, never from source: the
 * `EXPO_PUBLIC_WALLETCONNECT_PROJECT_ID` env var wins over `expo.extra.walletConnectProjectId`.
 */
export function getProjectId(): string {
  const fromEnv = process.env.EXPO_PUBLIC_WALLETCONNECT_PROJECT_ID;
  const fromExtra = Constants.expoConfig?.extra?.walletConnectProjectId as string | undefined;
  const id = (fromEnv || fromExtra || "").trim();
  if (!id) throw new WalletConnectConfigError();
  return id;
}

/** CAIP-2 chain for the app's configured Stellar network. */
export function getChainId(): string {
  const network = ((Constants.expoConfig?.extra?.network as string | undefined) ?? "testnet")
    .trim()
    .toLowerCase();
  return network === "mainnet" || network === "public" || network === "pubnet"
    ? `${NAMESPACE}:pubnet`
    : `${NAMESPACE}:testnet`;
}

let clientPromise: Promise<SignClient> | null = null;

/** Creates the SignClient once. Sessions are persisted by WalletConnect's storage and restored on init. */
function getClient(): Promise<SignClient> {
  if (!clientPromise) {
    const projectId = getProjectId();
    clientPromise = SignClient.init({
      projectId,
      metadata: {
        name: "MindVault",
        description: "MindVault mobile",
        url: "https://mindvault.app",
        icons: [],
      },
    }).catch((error) => {
      clientPromise = null; // allow a retry after a transient failure
      throw error;
    });
  }
  return clientPromise;
}

function toAccount(session: SessionTypes.Struct): WalletConnectAccount | null {
  const entry = session.namespaces[NAMESPACE]?.accounts?.[0];
  if (!entry) return null;
  // CAIP-10: stellar:<reference>:<address>
  const [namespace, reference, address] = entry.split(":");
  if (namespace !== NAMESPACE || !reference || !address) return null;
  return {
    topic: session.topic,
    address,
    chainId: `${namespace}:${reference}`,
    walletName: session.peer?.metadata?.name,
  };
}

/** Returns the persisted session's account, or null when no wallet is connected. */
export async function getConnectedAccount(): Promise<WalletConnectAccount | null> {
  const client = await getClient();
  const now = Math.floor(Date.now() / 1000);
  const sessions = client.session
    .getAll()
    .filter((session) => !session.expiry || session.expiry > now)
    .sort((a, b) => (b.expiry ?? 0) - (a.expiry ?? 0));
  for (const session of sessions) {
    const account = toAccount(session);
    if (account) return account;
  }
  return null;
}

export interface PendingConnection {
  /** `wc:` pairing URI to open in a wallet app or show as a QR code. */
  uri: string;
  /** Resolves once the wallet approves; rejects if it rejects or the proposal expires. */
  approval: () => Promise<WalletConnectAccount>;
}

/** Starts a session proposal for the configured Stellar network. */
export async function startConnection(): Promise<PendingConnection> {
  const client = await getClient();
  const { uri, approval } = await client.connect({
    requiredNamespaces: {
      [NAMESPACE]: {
        chains: [getChainId()],
        methods: [STELLAR_SIGN_METHOD],
        events: [],
      },
    },
  });
  if (!uri) throw new Error("WalletConnect did not return a pairing link.");

  return {
    uri,
    approval: async () => {
      const session = await approval();
      const account = toAccount(session);
      if (!account) throw new Error("The wallet did not share a Stellar account.");
      return account;
    },
  };
}

/** Ends the active session on both sides and removes it from storage. */
export async function disconnectWallet(): Promise<void> {
  const client = await getClient();
  const account = await getConnectedAccount();
  if (!account) return;
  try {
    await client.disconnect({ topic: account.topic, reason: USER_DISCONNECTED });
  } catch {
    // The wallet may already be gone; make sure our copy of the session is dropped.
    await client.session.delete(account.topic, USER_DISCONNECTED).catch(() => undefined);
  }
}

/** Asks the connected wallet to sign an XDR (`stellar_signXDR`). Returns the signed XDR. */
export async function signXdrWithWallet(xdr: string): Promise<string> {
  const client = await getClient();
  const account = await getConnectedAccount();
  if (!account) throw new Error("No wallet is connected.");
  const result = await client.request<{ signedXDR?: string; signedXdr?: string }>({
    topic: account.topic,
    chainId: account.chainId,
    request: { method: STELLAR_SIGN_METHOD, params: { xdr } },
  });
  const signed = result?.signedXDR ?? result?.signedXdr;
  if (!signed) throw new Error("The wallet did not return a signed transaction.");
  return signed;
}

/** Test hook: forgets the cached client. */
export function resetWalletConnectForTests(): void {
  clientPromise = null;
}
