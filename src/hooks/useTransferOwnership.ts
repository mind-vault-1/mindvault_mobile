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
  start: (resourceId: string) => Promise<void>;
  reset: () => void;
}

/**
 * Validates a Stellar public key:
 * - Must start with "G"
 * - Must be exactly 56 characters long
 * - Must contain only base32 characters
 */
export function validateStellarAddress(address: string): boolean {
  if (!address.startsWith("G")) return false;
  if (address.length !== 56) return false;
  if (!/^[A-Z2-7]+$/.test(address)) return false;
  return true;
}

/**
 * Mobile transfer-ownership flow:
 * 1. prepare  — POST /resources/:id/ownership/prepare  → get XDR
 * 2. sign     — sign the XDR (stub — replace with mobile wallet)
 * 3. submit   — POST /resources/:id/ownership          → broadcast
 */
export function useTransferOwnership(): UseTransferOwnershipResult {
  const [step, setStep] = useState<TransferStep>("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [destinationAddress, setDestinationAddress] = useState("");

  const isValidAddress = validateStellarAddress(destinationAddress.trim());

  async function start(resourceId: string): Promise<void> {
    if (!isValidAddress) {
      setError("Invalid destination address.");
      return;
    }

    setError(null);
    setTxHash(null);

    try {
      // Step 1: Prepare
      setStep("preparing");
      const { xdr } = await prepareOwnershipTransfer(resourceId);

      // Step 2: Sign
      setStep("signing");
      const signedXdr = await signXdr(xdr);

      // Step 3: Submit
      setStep("submitting");
      const result = await submitOwnershipTransfer(
        resourceId,
        signedXdr,
        destinationAddress.trim()
      );

      setTxHash(result.txHash ?? null);
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transfer failed.");
      setStep("error");
    }
  }

  function reset() {
    setStep("idle");
    setError(null);
    setTxHash(null);
    setDestinationAddress("");
  }

  return {
    step,
    error,
    txHash,
    destinationAddress,
    setDestinationAddress,
    isValidAddress,
    start,
    reset,
  };
}

/**
 * Mobile XDR signing stub.
 * Replace with Freighter deep-link, WalletConnect, or local keypair for dev.
 */
async function signXdr(xdr: string): Promise<string> {
  // TODO: integrate mobile wallet signing
  return xdr;
}
