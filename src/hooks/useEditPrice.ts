import { useCallback, useState } from "react";

import {
  prepareEditPrice,
  signTransactionXdr,
  submitPriceEdit,
} from "../api/resources";

export type EditPriceStatus = "idle" | "preparing" | "signing" | "submitting";

/**
 * Validates a price string before sending it to the API.
 * Returns an error message string if invalid, or null if valid.
 *
 * Rules:
 * - Must not be empty or whitespace-only
 * - Must be a valid number (no non-numeric characters)
 * - Must be greater than zero
 */
export function validatePrice(price: string): string | null {
  const trimmed = price.trim();

  if (!trimmed) {
    return "Price cannot be empty.";
  }

  const numeric = Number(trimmed);

  if (isNaN(numeric)) {
    return "Price must be a valid number.";
  }

  if (numeric <= 0) {
    return "Price must be greater than zero.";
  }

  return null;
}

export function useEditPrice() {
  const [status, setStatus] = useState<EditPriceStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const editPrice = useCallback(
    async (resourceId: string, price: string, secretKey: string) => {
      setError(null);

      // Validate price locally before making any API calls
      const priceError = validatePrice(price);
      if (priceError) {
        setError(priceError);
        return false;
      }

      setStatus("preparing");

      try {
        const { xdr, networkPassphrase } = await prepareEditPrice(resourceId, price);
        setStatus("signing");

        const signedXdr = signTransactionXdr(xdr, secretKey, networkPassphrase);
        setStatus("submitting");

        await submitPriceEdit(resourceId, signedXdr);
        setStatus("idle");
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unable to update price.";
        setError(message);
        setStatus("idle");
        return false;
      }
    },
    []
  );

  return {
    status,
    error,
    editPrice,
    resetError: () => setError(null),
  };
}
