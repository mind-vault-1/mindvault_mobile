import { request } from "./client";
import { getApiBaseUrl } from "./resources";
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

const UNEXPECTED = "The server returned an unexpected response.";

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") throw new Error(UNEXPECTED);
  return value as Record<string, unknown>;
}

export const verificationDetailsSchema = (value: unknown): VerificationDetails => {
  const row = asRecord(value);
  if (
    typeof row.resourceId !== "string" ||
    typeof row.title !== "string" ||
    typeof row.status !== "string" ||
    typeof row.listed !== "boolean" ||
    typeof row.publishedAt !== "string"
  ) {
    throw new Error(UNEXPECTED);
  }
  if (row.verification !== null) {
    const check = asRecord(row.verification);
    if (
      typeof check.isOriginal !== "boolean" ||
      typeof check.confidence !== "number" ||
      !Array.isArray(check.flags) ||
      !check.flags.every((flag) => typeof flag === "string") ||
      typeof check.checkedAt !== "string"
    ) {
      throw new Error(UNEXPECTED);
    }
  }
  return value as VerificationDetails;
};

export async function fetchVerification(id: string): Promise<VerificationDetails> {
  const { data } = await request<VerificationDetails>(
    `${getApiBaseUrl()}/resources/${encodeURIComponent(id)}/verification`,
    {
      fallbackMessage: "Failed to load verification details",
      // The plain-fetch original made a single attempt.
      retry: false,
      schema: verificationDetailsSchema,
    }
  );
  return data;
}

/** Formats a confidence value from either a 0–1 fraction or a 0–100 percentage. */
export function formatConfidence(confidence: number): string {
  const percent = confidence <= 1 ? confidence * 100 : confidence;
  return `${Math.round(percent)}%`;
}
