import { Keypair, TransactionBuilder } from "@stellar/stellar-sdk";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";

import { isBiometricAvailable, isBiometricLockEnabled } from "./secureStorage";
import { validateStellarSecret } from "../utils/validateStellarSecret";

const SECRET_KEY = "mindvault_wallet_secret";
const PUBLIC_KEY = "mindvault_wallet_public";

/** Creates a wallet, storing its secret only in the device's SecureStore. */
export async function generateWallet(): Promise<string> {
  const keypair = Keypair.random();
  await persistKeypair(keypair);
  return keypair.publicKey();
}

/** Imports a Stellar secret after validating its StrKey checksum and format. */
export async function importWallet(secret: string): Promise<string> {
  const validation = validateStellarSecret(secret);
  if (!validation.isValid) {
    throw new Error(validation.errorMessage ?? "Invalid Stellar secret key.");
  }

  const keypair = Keypair.fromSecret(secret.trim());
  await persistKeypair(keypair);
  return keypair.publicKey();
}

async function persistKeypair(keypair: Keypair): Promise<void> {
  // Write the secret first; if either write fails, don't leave a half-configured wallet.
  await SecureStore.setItemAsync(SECRET_KEY, keypair.secret());
  try {
    await SecureStore.setItemAsync(PUBLIC_KEY, keypair.publicKey());
  } catch (error) {
    await SecureStore.deleteItemAsync(SECRET_KEY).catch(() => undefined);
    throw error;
  }
}

/** Returns the public address, or null when no wallet has been configured. */
export async function getPublicKey(): Promise<string | null> {
  return SecureStore.getItemAsync(PUBLIC_KEY);
}

async function unlockSecret(): Promise<string> {
  if (await isBiometricLockEnabled()) {
    // Do not silently bypass an enabled lock if biometrics are unavailable.
    if (!(await isBiometricAvailable())) {
      throw new Error("Biometric authentication is unavailable for this wallet.");
    }
    let result: LocalAuthentication.LocalAuthenticationResult;
    try {
      result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Unlock your Stellar wallet",
      });
    } catch {
      throw new Error("Biometric authentication failed.");
    }
    if (!result.success) {
      throw new Error("Biometric authentication was not completed.");
    }
  }

  const secret = await SecureStore.getItemAsync(SECRET_KEY);
  if (!secret) throw new Error("No wallet has been configured.");
  return secret;
}

/**
 * Signs a transaction XDR with the locally stored key. The secret is never
 * returned from this module or sent over the network.
 */
export async function sign(xdr: string, passphrase: string): Promise<string> {
  if (!xdr.trim() || !passphrase.trim()) {
    throw new Error("Transaction XDR and network passphrase are required.");
  }

  const secret = await unlockSecret();
  const validation = validateStellarSecret(secret);
  if (!validation.isValid) throw new Error("The stored wallet key is invalid.");

  try {
    const transaction = TransactionBuilder.fromXDR(xdr, passphrase);
    transaction.sign(Keypair.fromSecret(secret));
    return transaction.toXDR();
  } catch {
    throw new Error("Unable to sign this Stellar transaction.");
  }
}

/** Permanently removes the local wallet keypair. */
export async function wipe(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(SECRET_KEY),
    SecureStore.deleteItemAsync(PUBLIC_KEY),
  ]);
}
