import { StrKey } from "@stellar/stellar-sdk";

export interface SecretKeyValidationResult {
  isValid: boolean;
  errorMessage: string | null;
}

/**
 * Validates a Stellar secret key without logging or exposing the key value.
 *
 * Checks, in order:
 * 1. Not empty / whitespace-only
 * 2. Starts with "S" (ed25519 secret seed prefix)
 * 3. Valid checksum via StrKey.isValidEd25519SecretSeed
 *
 * Returns a result with an actionable error message, or isValid: true.
 * The key value is never included in the returned error message.
 */
export function validateStellarSecret(secretKey: string): SecretKeyValidationResult {
  if (!secretKey || !secretKey.trim()) {
    return { isValid: false, errorMessage: "Secret key is required." };
  }

  const normalized = secretKey.trim();

  if (!normalized.startsWith("S")) {
    return {
      isValid: false,
      errorMessage: "Invalid secret key format. Stellar secret keys start with 'S'.",
    };
  }

  if (!StrKey.isValidEd25519SecretSeed(normalized)) {
    return {
      isValid: false,
      errorMessage: "Invalid secret key. Check the key and try again.",
    };
  }

  return { isValid: true, errorMessage: null };
}
