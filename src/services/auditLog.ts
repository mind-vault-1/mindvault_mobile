import AsyncStorage from "@react-native-async-storage/async-storage";
import { redact } from "../utils/redact";
import { STORAGE_KEYS } from "./storage";

export type AuditLogEntry = {
  id: string;
  action: "key_rotation" | "wallet_wipe" | "signing";
  timestamp: string;
  outcome: "success" | "failure";
  metadata?: {
    walletAddress?: string;
    errorMessage?: string;
  };
};

const AUDIT_LOG_KEY = STORAGE_KEYS.auditLog;

export async function appendAuditLogEntry(
  action: AuditLogEntry["action"],
  outcome: AuditLogEntry["outcome"],
  metadata?: AuditLogEntry["metadata"]
): Promise<void> {
  try {
    const log = await getAuditLog();
    const entry: AuditLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      action,
      timestamp: new Date().toISOString(),
      outcome,
      metadata: redactMetadata(metadata),
    };
    log.push(entry);
    await AsyncStorage.setItem(AUDIT_LOG_KEY, JSON.stringify(log));
  } catch (err) {
  }
}

export async function getAuditLog(): Promise<AuditLogEntry[]> {
  try {
    const data = await AsyncStorage.getItem(AUDIT_LOG_KEY);
    if (!data) return [];
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function clearAuditLog(): Promise<void> {
  try {
    await AsyncStorage.removeItem(AUDIT_LOG_KEY);
  } catch {
  }
}

export async function exportAuditLog(): Promise<string> {
  try {
    const log = await getAuditLog();
    return JSON.stringify(log, null, 2);
  } catch (err) {
    return "Failed to export audit log";
  }
}

function redactMetadata(
  metadata?: AuditLogEntry["metadata"]
): AuditLogEntry["metadata"] {
  if (!metadata) return undefined;

  const redacted: AuditLogEntry["metadata"] = {};

  if (metadata.walletAddress) {
    redacted.walletAddress = redact(metadata.walletAddress, {
      showStart: 4,
      showEnd: 4,
    });
  }

  if (metadata.errorMessage) {
    redacted.errorMessage = metadata.errorMessage;
  }

  return redacted;
}
