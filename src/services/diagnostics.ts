import Constants from "expo-constants";
import { Platform } from "react-native";

import { getApiBaseUrl } from "../api/resources";
import { getApiKey } from "./secureStorage";
import { getErrorLog } from "../utils/errorLogger";

/** Support information a user can preview and share. Never contains secrets. */
export interface DiagnosticsReport {
  generatedAt: string;
  appVersion: string;
  platform: string;
  osVersion: string;
  deviceModel: string;
  environment: "development" | "production";
  apiBaseUrl: string;
  network: string;
  hasApiKey: boolean;
  log: string;
}

function deviceModel(): string {
  if (Platform.OS === "android") {
    const { Manufacturer, Model } = Platform.constants as { Manufacturer?: string; Model?: string };
    return [Manufacturer, Model].filter(Boolean).join(" ") || "Android device";
  }
  if (Platform.OS === "ios") {
    return Platform.isPad ? "iPad" : "iPhone";
  }
  return Platform.OS;
}

async function hasStoredApiKey(): Promise<boolean> {
  try {
    return (await getApiKey()) !== null;
  } catch {
    return false;
  }
}

export async function collectDiagnostics(): Promise<DiagnosticsReport> {
  return {
    generatedAt: new Date().toISOString(),
    appVersion: Constants.expoConfig?.version ?? "unknown",
    platform: Platform.OS,
    osVersion: String(Platform.Version),
    deviceModel: deviceModel(),
    environment: __DEV__ ? "development" : "production",
    apiBaseUrl: getApiBaseUrl(),
    network: String(Constants.expoConfig?.extra?.network ?? "unknown"),
    hasApiKey: await hasStoredApiKey(),
    log: getErrorLog(),
  };
}

export function formatDiagnostics(report: DiagnosticsReport): string {
  return [
    "=== MindVault Diagnostics ===",
    `Generated: ${report.generatedAt}`,
    `App version: ${report.appVersion}`,
    `Platform: ${report.platform} ${report.osVersion}`,
    `Device: ${report.deviceModel}`,
    `Environment: ${report.environment}`,
    `API: ${report.apiBaseUrl}`,
    `Network: ${report.network}`,
    `API key stored: ${report.hasApiKey ? "yes" : "no"}`,
    "",
    "=== Recent errors (redacted) ===",
    report.log || "None",
  ].join("\n");
}
