import AsyncStorage from "@react-native-async-storage/async-storage";

import type { Resource } from "../types";
import { logError } from "../utils/errorLogger";

/**
 * Publisher getting-started checklist. Every step is derived from state the
 * app already has (API key, the publisher's resources), so nothing here can
 * drift out of sync; only the "dismissed" choice is stored.
 */

export const CHECKLIST_DISMISSED_KEY = "@mindvault_publisher_checklist_dismissed:v1";

export type ChecklistStepId = "signup" | "publish" | "verify" | "register";

export interface ChecklistStep {
  id: ChecklistStepId;
  label: string;
  done: boolean;
  /** The resource the step should open, when one applies. */
  resource?: Resource;
}

export interface ChecklistInput {
  hasApiKey: boolean;
  resources: readonly Resource[];
}

export function getPublisherChecklist({ hasApiKey, resources }: ChecklistInput): ChecklistStep[] {
  const verified = resources.filter((r) => r.verificationStatus === "verified");
  const registered = resources.some((r) => r.onchainStatus === "registered");
  return [
    { id: "signup", label: "Create your publisher account", done: hasApiKey },
    { id: "publish", label: "Publish your first resource", done: resources.length > 0 },
    {
      id: "verify",
      label: "Get a resource verified",
      done: verified.length > 0,
      resource: resources.find((r) => r.verificationStatus !== "verified"),
    },
    {
      id: "register",
      label: "Register a verified resource on-chain",
      done: registered,
      resource: verified.find((r) => r.onchainStatus !== "registered"),
    },
  ];
}

export function isChecklistComplete(steps: readonly ChecklistStep[]): boolean {
  return steps.every((step) => step.done);
}

export async function isChecklistDismissed(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(CHECKLIST_DISMISSED_KEY)) === "true";
  } catch (err) {
    logError("onboarding.isChecklistDismissed", err);
    return false;
  }
}

export async function dismissChecklist(): Promise<void> {
  await AsyncStorage.setItem(CHECKLIST_DISMISSED_KEY, "true");
}
