import { StrKey } from "@stellar/stellar-sdk";
import { useState } from "react";
import {
  prepareOwnershipTransfer,
  submitOwnershipTransfer,
} from "../api/resources";

export type TransferStep = "idle" | "preparing" | "signing" | "submitting" | "done" | "error";

export interface UseTransferOwnershipResult {
  step: TransferStep;
  error: string | null;
  txHash: string | null;
  destinationAddress: string;
  setDestinationAddress: (address: string) => void;
  isValidAddress: boolean;
  pendingTransaction: PendingOwnershipTransaction | null;
  start: (resourceId: string) => Promise<void>;
  submitSigned: (signedXdr: string) => Promise<void>;
  cancelSigning: () => void;
  reset: () => void;
}

export interface PendingOwnershipTransaction {
  resourceId: string;
  destination: string;
  unsignedXdr: string;
  networkPassphrase?: string;
}

/**
 * Validates a Stellar ed25519 public key (checksum and encoding).
 */
export function validateStellarAddress(address: string): boolean {
  const normalized = address.trim().toUpperCase();
  if (!normalized) return false;
  return StrKey.isValidEd25519PublicKey(normalized);
}

function normalizeStellarAddress(address: string): string {
  return address.trim().toUpperCase();
}

/**
 * Mobile transfer-ownership flow:
 * 1. prepare  — POST /resources/:id/ownership/prepare { newCreator } → unsigned XDR
 * 2. sign     — sign the XDR (stub — replace with mobile wallet)
 * 3. submit   — POST /resources/:id/ownership { signedXdr, newCreator } → broadcast
 */
export function useTransferOwnership(): UseTransferOwnershipResult {
  const [step, setStep] = useState<TransferStep>("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [destinationAddress, setDestinationAddress] = useState("");
  const [pendingTransaction, setPendingTransaction] = useState<PendingOwnershipTransaction | null>(null);

  const isValidAddress = validateStellarAddress(destinationAddress);

  async function start(resourceId: string): Promise<void> {
    const destination = normalizeStellarAddress(destinationAddress);
    if (!validateStellarAddress(destination)) {
      setError("Invalid destination address.");
      return;
    }

    setError(null);
    setTxHash(null);

    try {
      // Step 1: Prepare
      setStep("preparing");
      const { unsignedXdr, networkPassphrase } = await prepareOwnershipTransfer(resourceId, destination);
      setStep("signing");
      setPendingTransaction({ resourceId, destination, unsignedXdr, networkPassphrase });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transfer failed.");
      setStep("error");
    }
  }

  async function submitSigned(signedXdr: string): Promise<void> {
    if (!pendingTransaction) return;
    if (signedXdr === pendingTransaction.unsignedXdr) {
      setPendingTransaction(null);
      setError("The transaction must be signed before submission.");
      setStep("error");
      return;
    }
    try {
      setStep("submitting");
      const result = await submitOwnershipTransfer(
        pendingTransaction.resourceId,
        signedXdr,
        pendingTransaction.destination
      );
      setPendingTransaction(null);
      setTxHash(result.txHash ?? null);
      setStep("done");
    } catch (err) {
      // Close the signing sheet so the modal underneath can show the error.
      setPendingTransaction(null);
      setError(err instanceof Error ? err.message : "Transfer failed.");
      setStep("error");
    }
  }

  function cancelSigning() {
    setPendingTransaction(null);
    setError(null);
    setStep("idle");
  }

  function reset() {
    setStep("idle");
    setError(null);
    setTxHash(null);
    setDestinationAddress("");
    setPendingTransaction(null);
  }

  return {
    step,
    error,
    txHash,
    destinationAddress,
    setDestinationAddress,
    isValidAddress,
    pendingTransaction,
    start,
    submitSigned,
    cancelSigning,
    reset,
  };
}
