import { useCallback, useState } from "react";

import { prepareEditPrice, submitPriceEdit } from "../api/resources";

export type EditPriceStatus = "idle" | "preparing" | "signing" | "submitting";
export interface PendingPriceTransaction {
  resourceId: string;
  price: string;
  unsignedXdr: string;
  networkPassphrase?: string;
}

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
  const [pendingTransaction, setPendingTransaction] = useState<PendingPriceTransaction | null>(null);

  const preparePriceEdit = useCallback(
    async (resourceId: string, price: string) => {
      setError(null);

      // Validate price locally before making any API calls
      const priceError = validatePrice(price);
      if (priceError) {
        setError(priceError);
        return false;
      }

      setStatus("preparing");

      try {
        const trimmedPrice = price.trim();
        const { unsignedXdr, networkPassphrase } = await prepareEditPrice(resourceId, trimmedPrice);
        setStatus("signing");
        setPendingTransaction({ resourceId, price: trimmedPrice, unsignedXdr, networkPassphrase });
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

  const submitSigned = useCallback(async (signedXdr: string) => {
    if (!pendingTransaction) return false;
    if (signedXdr === pendingTransaction.unsignedXdr) {
      setPendingTransaction(null);
      setError("The transaction must be signed before submission.");
      return false;
    }
    setStatus("submitting");
    try {
      await submitPriceEdit(pendingTransaction.resourceId, signedXdr, pendingTransaction.price);
      setPendingTransaction(null);
      setStatus("idle");
      return true;
    } catch (err) {
      // Close the signing sheet so the card can show the error; saving again
      // prepares a fresh transaction.
      setPendingTransaction(null);
      setError(err instanceof Error ? err.message : "Unable to update price.");
      setStatus("idle");
      return false;
    }
  }, [pendingTransaction]);

  const cancelSigning = useCallback(() => {
    setPendingTransaction(null);
    setError(null);
    setStatus("idle");
  }, []);

  return {
    status,
    error,
    pendingTransaction,
    preparePriceEdit,
    submitSigned,
    cancelSigning,
    resetError: () => setError(null),
  };
}
