import { StrKey } from "@stellar/stellar-sdk";
import { useState } from "react";
import {
  prepareOwnershipTransfer,
  submitOwnershipTransfer,
} from "../api/resources";
import { getNetworkConfig } from "../config/network";
import { t } from "../i18n";

export type TransferStep =
  | "idle"
  | "confirm"
  | "preparing"
  | "signing"
  | "submitting"
  | "done"
  | "error";

export const TRANSFER_CONFIRM_PHRASE = "TRANSFER";

export interface UseTransferOwnershipResult {
  step: TransferStep;
  error: string | null;
  txHash: string | null;
  destinationAddress: string;
  setDestinationAddress: (address: string) => void;
  isValidAddress: boolean;
  confirmationText: string;
  setConfirmationText: (text: string) => void;
  isConfirmed: boolean;
  networkLabel: string;
  networkPassphrase: string;
  scanDestination: (payload: string) => boolean;
  beginConfirm: () => void;
  cancelConfirm: () => void;
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

function extractDestination(payload: string): string {
  const trimmed = payload.trim();
  if (!trimmed.includes(":")) return trimmed;
  try {
    const url = new URL(trimmed);
    const param = url.searchParams.get("destination");
    return param ?? trimmed;
  } catch {
    return trimmed;
  }
}

/**
 * Mobile transfer-ownership flow:
 * 1. scan/confirm — validate the destination, review details, type TRANSFER
 * 2. prepare      — POST /resources/:id/ownership/prepare { newCreator } → unsigned XDR
 * 3. sign         — sign the XDR
 * 4. submit       — POST /resources/:id/ownership { signedXdr, newCreator } → broadcast
 */
export function useTransferOwnership(): UseTransferOwnershipResult {
  const [step, setStep] = useState<TransferStep>("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [destinationAddress, setDestinationAddress] = useState("");
  const [confirmationText, setConfirmationText] = useState("");
  const [pendingTransaction, setPendingTransaction] = useState<PendingOwnershipTransaction | null>(null);

  const network = getNetworkConfig();
  const isValidAddress = validateStellarAddress(destinationAddress);
  const isConfirmed = confirmationText.trim().toUpperCase() === TRANSFER_CONFIRM_PHRASE;

  function scanDestination(payload: string): boolean {
    const candidate = normalizeStellarAddress(extractDestination(payload));
    if (!validateStellarAddress(candidate)) {
      setError(t("modals.transfer.error.scanInvalidKey"));
      return false;
    }
    setDestinationAddress(candidate);
    setConfirmationText("");
    setError(null);
    setStep("idle");
    return true;
  }

  function beginConfirm() {
    if (!validateStellarAddress(destinationAddress)) {
      setError(t("modals.transfer.error.enterValidAddress"));
      return;
    }
    setError(null);
    setStep("confirm");
  }

  function cancelConfirm() {
    setConfirmationText("");
    setError(null);
    setStep("idle");
  }

  async function start(resourceId: string): Promise<void> {
    if (step !== "confirm" || !isConfirmed) {
      setError(t("modals.transfer.error.confirmFirst", { phrase: TRANSFER_CONFIRM_PHRASE }));
      return;
    }
    const destination = normalizeStellarAddress(destinationAddress);
    if (!validateStellarAddress(destination)) {
      setError(t("modals.transfer.error.invalidDestination"));
      return;
    }

    setError(null);
    setTxHash(null);

    try {
      setStep("preparing");
      const { unsignedXdr, networkPassphrase } = await prepareOwnershipTransfer(resourceId, destination);
      setStep("signing");
      setPendingTransaction({ resourceId, destination, unsignedXdr, networkPassphrase });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("modals.transfer.error.failed"));
      setStep("error");
    }
  }

  async function submitSigned(signedXdr: string): Promise<void> {
    if (!pendingTransaction) return;
    if (signedXdr === pendingTransaction.unsignedXdr) {
      setPendingTransaction(null);
      setError(t("modals.transfer.error.mustBeSigned"));
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
      setError(err instanceof Error ? err.message : t("modals.transfer.error.failed"));
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
    setConfirmationText("");
    setPendingTransaction(null);
  }

  return {
    step,
    error,
    txHash,
    destinationAddress,
    setDestinationAddress,
    isValidAddress,
    confirmationText,
    setConfirmationText,
    isConfirmed,
    networkLabel: network.label,
    networkPassphrase: network.passphrase,
    scanDestination,
    beginConfirm,
    cancelConfirm,
    pendingTransaction,
    start,
    submitSigned,
    cancelSigning,
    reset,
  };
}
