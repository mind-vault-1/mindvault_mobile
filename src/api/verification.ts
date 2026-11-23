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

/** Shape returned by the AI verification agent status endpoint. */
export interface AgentStatus {
  verificationsProcessed: number;
  approvalRate: number;
  earnings: string;
  status?: string;
}

export const agentStatusSchema = (value: unknown): AgentStatus => {
  const row = asRecord(value);

  const verificationsProcessed =
    typeof row.verificationsProcessed === "number"
      ? row.verificationsProcessed
      : typeof row.verifications_processed === "number"
      ? row.verifications_processed
      : null;

  const approvalRate =
    typeof row.approvalRate === "number"
      ? row.approvalRate
      : typeof row.approval_rate === "number"
      ? row.approval_rate
      : null;

  const earnings =
    typeof row.earnings === "string"
      ? row.earnings
      : typeof row.earnings === "number"
      ? String(row.earnings)
      : typeof row.totalEarned === "string"
      ? row.totalEarned
      : typeof row.total_earnings === "string" || typeof row.total_earnings === "number"
      ? String(row.total_earnings)
      : null;

  if (verificationsProcessed === null || approvalRate === null || earnings === null) {
    throw new Error(UNEXPECTED);
  }

  return {
    verificationsProcessed,
    approvalRate,
    earnings,
    ...(typeof row.status === "string" ? { status: row.status } : {}),
  };
};

/** Fetches AI verification agent status and stats from the server. */
export async function fetchAgentStatus(signal?: AbortSignal): Promise<AgentStatus> {
  const { data } = await request<AgentStatus>(
    `${getApiBaseUrl()}/verify/agent-status`,
    {
      fallbackMessage: "Failed to load agent status",
      retry: false,
      signal,
      schema: agentStatusSchema,
    }
  );
  return data;
}

export const fetchVerificationAgentStatus = fetchAgentStatus;

/** Formats a confidence value from either a 0–1 fraction or a 0–100 percentage. */
export function formatConfidence(confidence: number): string {
  const percent = confidence <= 1 ? confidence * 100 : confidence;
  return `${Math.round(percent)}%`;
}
