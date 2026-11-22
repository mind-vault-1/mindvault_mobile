import { getApiBaseUrl } from "./resources";
import { extractApiErrorMessage } from "../utils/errorLogger";
import type { VerificationStatus } from "../types";

/** The latest AI check, or null when the resource hasn't been checked yet. */
export interface VerificationCheck {
  isOriginal: boolean;
  /** 0–1 fraction or 0–100 percentage, depending on the verifier. */
  confidence: number;
  flags: string[];
  checkedAt: string;
}

/** Shape returned by `GET /resources/:id/verification`. */
export interface VerificationDetails {
  resourceId: string;
  title: string;
  status: VerificationStatus;
  listed: boolean;
  publishedAt: string;
  verification: VerificationCheck | null;
}

export async function fetchVerification(id: string): Promise<VerificationDetails> {
  const url = `${getApiBaseUrl()}/resources/${encodeURIComponent(id)}/verification`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(await extractApiErrorMessage(res, "Failed to load verification details"));
  }

  return res.json();
}

/** Formats a confidence value from either a 0–1 fraction or a 0–100 percentage. */
export function formatConfidence(confidence: number): string {
  const percent = confidence <= 1 ? confidence * 100 : confidence;
  return `${Math.round(percent)}%`;
}
