import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  buildReferralLink,
  getReferralState,
  grantFirstPurchaseRewards,
  parseReferralPath,
  recordReferral,
  referralCodeFor,
  resetReferralsForTests,
  startReferralTracking,
} from "./referrals";
import { saveReceipt } from "./receipts";
import { getPublicKey } from "./wallet";

jest.mock("./wallet", () => ({ getPublicKey: jest.fn() }));

const ME = "GBUYERPUBLICKEY";
const FRIEND = "GFRIENDPUBLICKEY";
const myCode = referralCodeFor(ME);
const friendCode = referralCodeFor(FRIEND);

beforeEach(async () => {
  await AsyncStorage.clear();
  resetReferralsForTests();
  jest.mocked(getPublicKey).mockResolvedValue(ME);
});

describe("referral codes and links", () => {
  it("derives a stable 8-character code per wallet", () => {
    expect(myCode).toMatch(/^[A-F0-9]{8}$/);
    expect(referralCodeFor(ME)).toBe(myCode);
    expect(friendCode).not.toBe(myCode);
  });

  it("round-trips through the deep-link path", () => {
    const path = buildReferralLink(friendCode).replace("mindvault://", "");
    expect(parseReferralPath(path)).toBe(friendCode);
    expect(parseReferralPath(`ref/${friendCode.toLowerCase()}`)).toBe(friendCode);
    expect(parseReferralPath("ref/not-a-code")).toBeNull();
    expect(parseReferralPath(`resources/${friendCode}`)).toBeNull();
  });
});

describe("attribution", () => {
  it("records the first referrer and ignores later ones", async () => {
    expect(await recordReferral(friendCode)).toBe("recorded");
    expect(await recordReferral(referralCodeFor("GOTHER"))).toBe("already-attributed");
    expect((await getReferralState()).referrerCode).toBe(friendCode);
  });

  it("rejects self-referral and invalid codes", async () => {
    expect(await recordReferral(myCode)).toBe("self");
    expect(await recordReferral("nope")).toBe("invalid");
    expect((await getReferralState()).referrerCode).toBeNull();
  });
});

describe("rewards", () => {
  const receipt = { txHash: "tx1", payer: ME };

  it("grants one labelled reward to each side after the first purchase", async () => {
    await recordReferral(friendCode);
    const granted = await grantFirstPurchaseRewards(receipt);
    expect(granted.map((r) => r.role).sort()).toEqual(["referred", "referrer"]);
    expect(granted.every((r) => r.label.length > 0 && r.referrerCode === friendCode)).toBe(true);
  });

  it("is idempotent across replays and later purchases", async () => {
    await recordReferral(friendCode);
    await grantFirstPurchaseRewards(receipt);
    expect(await grantFirstPurchaseRewards(receipt)).toEqual([]);
    expect(await grantFirstPurchaseRewards({ txHash: "tx2", payer: ME })).toEqual([]);
    expect((await getReferralState()).rewards).toHaveLength(2);
  });

  it("grants nothing without a referrer or when the buyer is the referrer", async () => {
    expect(await grantFirstPurchaseRewards(receipt)).toEqual([]);
    await recordReferral(friendCode);
    expect(await grantFirstPurchaseRewards({ txHash: "tx3", payer: FRIEND })).toEqual([]);
  });

  it("grants automatically when a receipt is saved", async () => {
    await recordReferral(friendCode);
    startReferralTracking();
    await saveReceipt({
      resourceId: "r1",
      title: "Doc",
      amount: "100",
      asset: "XLM",
      network: "testnet",
      txHash: "tx4",
      payer: ME,
      paidAt: new Date().toISOString(),
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect((await getReferralState()).rewards).toHaveLength(2);
  });
});
