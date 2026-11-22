import { Keypair, Transaction } from 'stellar-sdk';
import * as SecureStore from 'expo-secure-store';

/**
 * SEP-7 signing with fallback mechanism
 */

export async function signTransactionWithFallback(
  transactionXdr: string,
  publicKey: string
): Promise<string | null> {
  try {
    // Attempt SEP-7 signing via native wallet
    return await attemptSEP7Signing(transactionXdr);
  } catch (sep7Error) {
    console.warn('SEP-7 signing failed, attempting fallback:', sep7Error);
    return await fallbackLocalSigning(transactionXdr, publicKey);
  }
}

async function attemptSEP7Signing(transactionXdr: string): Promise<string> {
  // Delegate to wallet app via SEP-7 protocol
  const sep7Url = `stellar:tx?xdr=${encodeURIComponent(transactionXdr)}`;

  // This would typically use linking.openURL or similar
  // For now, throw to trigger fallback if not available
  throw new Error('SEP-7 not available');
}

async function fallbackLocalSigning(
  transactionXdr: string,
  publicKey: string
): Promise<string | null> {
  try {
    const secretKey = await SecureStore.getItemAsync(`secret_${publicKey}`);

    if (!secretKey) {
      return null;
    }

    const keypair = Keypair.fromSecret(secretKey);
    const transaction = new Transaction(transactionXdr, 'Test SDF Network ; September 2015');

    transaction.sign(keypair);
    return transaction.toEnvelope().toXDR('base64');
  } catch {
    return null;
  }
}
