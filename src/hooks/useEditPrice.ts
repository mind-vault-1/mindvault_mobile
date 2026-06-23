import { useCallback, useState } from "react";

import {
  prepareEditPrice,
  signTransactionXdr,
  submitPriceEdit,
} from "../api/resources";

export type EditPriceStatus = "idle" | "preparing" | "signing" | "submitting";

export function useEditPrice() {
  const [status, setStatus] = useState<EditPriceStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const editPrice = useCallback(
    async (resourceId: string, price: string, secretKey: string) => {
      setError(null);
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
