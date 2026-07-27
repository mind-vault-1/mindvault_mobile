import { Keypair } from "@stellar/stellar-sdk";
import { validateStellarAddress } from "./useTransferOwnership";

describe("validateStellarAddress", () => {
  it("accepts a valid ed25519 public key", () => {
    const publicKey = Keypair.random().publicKey();
    expect(validateStellarAddress(publicKey)).toBe(true);
    expect(validateStellarAddress(`  ${publicKey.toLowerCase()}  `)).toBe(true);
  });

  it("rejects empty and whitespace-only input", () => {
    expect(validateStellarAddress("")).toBe(false);
    expect(validateStellarAddress("   ")).toBe(false);
  });

  it("rejects malformed keys", () => {
    expect(validateStellarAddress("not-a-key")).toBe(false);
    expect(validateStellarAddress("GABC")).toBe(false);
    expect(validateStellarAddress("S" + "A".repeat(55))).toBe(false);
  });

  it("rejects keys with valid length but invalid checksum", () => {
    const publicKey = Keypair.random().publicKey();
    const tampered = publicKey.slice(0, -1) + (publicKey.endsWith("A") ? "B" : "A");
    expect(validateStellarAddress(tampered)).toBe(false);
  });
});
