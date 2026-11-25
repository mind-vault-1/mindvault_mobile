import AsyncStorage from "@react-native-async-storage/async-storage";

import { getPublicKey } from "./wallet";
import { subscribeReceiptSaved, type PaymentReceipt } from "./receipts";
import { sha256Hex } from "../utils/hash";
import { logError } from "../utils/errorLogger";

/**
 * Referrals: a per-wallet code, a `mindvault://ref/<CODE>` link that records
 * the referrer on this device, and a one-time reward for both sides after the
 * referred user's first purchase.
 *
 * Rewards are keyed by (referrer, buyer, role), so replaying a purchase or the
 * link never grants a second reward.
 */

export const REFERRALS_KEY = "@mindvault_referrals:v1";
const VERSION = 1;
const CODE_PATTERN = /^[A-F0-9]{8}$/;

export type ReferralRole = "referrer" | "referred";

export interface ReferralReward {
  id: string;
  role: ReferralRole;
  label: string;
  referrerCode: string;
  buyerCode: string;
  txHash: string;
  grantedAt: string;
}

interface ReferralState {
  version: typeof VERSION;
  referrerCode: string | null;
  attributedAt: string | null;
  rewards: ReferralReward[];
}

export const REWARD_LABELS: Record<ReferralRole, string> = {
  referrer: "Referral reward: a friend you invited made their first purchase",
  referred: "Welcome reward: thanks for joining through a referral",
};

/** Stable 8-character code derived from a wallet public key. */
export function referralCodeFor(publicKey: string): string {
  return sha256Hex(publicKey).slice(0, 8).toUpperCase();
}

export function normalizeReferralCode(value: string): string | null {
  const code = value.trim().toUpperCase();
  return CODE_PATTERN.test(code) ? code : null;
}

export function buildReferralLink(code: string): string {
  return `mindvault://ref/${code}`;
}

/** Extracts the code from a `ref/<CODE>` deep-link path; null for anything else. */
export function parseReferralPath(path: string): string | null {
  const match = /^\/*ref\/([^/?#]+)\/?(?:[?#].*)?$/i.exec(path);
  return match ? normalizeReferralCode(match[1]) : null;
}

function emptyState(): ReferralState {
  return { version: VERSION, referrerCode: null, attributedAt: null, rewards: [] };
}

async function read(): Promise<ReferralState> {
  try {
    const raw = await AsyncStorage.getItem(REFERRALS_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<ReferralState>) : null;
    if (parsed?.version !== VERSION || !Array.isArray(parsed.rewards)) return emptyState();
    return {
      version: VERSION,
      referrerCode: typeof parsed.referrerCode === "string" ? parsed.referrerCode : null,
      attributedAt: typeof parsed.attributedAt === "string" ? parsed.attributedAt : null,
      rewards: parsed.rewards,
    };
  } catch (err) {
    logError("referrals.read", err);
    return emptyState();
  }
}

// Serialize read-modify-write so a link and a purchase can't race each other.
let pending: Promise<unknown> = Promise.resolve();
function update<T>(fn: (state: ReferralState) => Promise<T> | T): Promise<T> {
  const result = pending.then(async () => {
    const state = await read();
    const out = await fn(state);
    await AsyncStorage.setItem(REFERRALS_KEY, JSON.stringify(state));
    return out;
  });
  pending = result.catch(() => undefined);
  return result;
}

export async function getMyReferralCode(): Promise<string | null> {
  const key = await getPublicKey();
  return key ? referralCodeFor(key) : null;
}

export type AttributionResult = "recorded" | "invalid" | "self" | "already-attributed";

/** Records who referred this device. The first valid referrer wins; your own code is rejected. */
export async function recordReferral(rawCode: string, now: Date = new Date()): Promise<AttributionResult> {
  const code = normalizeReferralCode(rawCode);
  if (!code) return "invalid";
  if (code === (await getMyReferralCode())) return "self";
  return update((state) => {
    if (state.referrerCode) return "already-attributed";
    state.referrerCode = code;
    state.attributedAt = now.toISOString();
    return "recorded";
  });
}

/**
 * Grants both labelled rewards after the referred user's first purchase.
 * Returns only the rewards newly granted by this call (empty when replayed).
 */
export async function grantFirstPurchaseRewards(
  receipt: Pick<PaymentReceipt, "txHash" | "payer">,
  now: Date = new Date(),
): Promise<ReferralReward[]> {
  if (!receipt.payer) return [];
  const buyerCode = referralCodeFor(receipt.payer);
  return update((state) => {
    const referrerCode = state.referrerCode;
    // A wallet switched to the referrer's own after attribution still can't self-reward.
    if (!referrerCode || referrerCode === buyerCode) return [];
    const granted: ReferralReward[] = [];
    for (const role of ["referred", "referrer"] as const) {
      const id = `${referrerCode}:${buyerCode}:${role}`;
      if (state.rewards.some((reward) => reward.id === id)) continue;
      const reward: ReferralReward = {
        id,
        role,
        label: REWARD_LABELS[role],
        referrerCode,
        buyerCode,
        txHash: receipt.txHash,
        grantedAt: now.toISOString(),
      };
      state.rewards.push(reward);
      granted.push(reward);
    }
    return granted;
  });
}

export async function getReferralState(): Promise<Omit<ReferralState, "version">> {
  await pending;
  const { referrerCode, attributedAt, rewards } = await read();
  return { referrerCode, attributedAt, rewards };
}

let unsubscribe: (() => void) | null = null;

/** Starts listening for purchases. Safe to call repeatedly. */
export function startReferralTracking(): void {
  if (unsubscribe) return;
  unsubscribe = subscribeReceiptSaved((receipt) => {
    grantFirstPurchaseRewards(receipt).catch((err) => logError("referrals.grant", err));
  });
}

export function resetReferralsForTests(): void {
  unsubscribe?.();
  unsubscribe = null;
  pending = Promise.resolve();
}
