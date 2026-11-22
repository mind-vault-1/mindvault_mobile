import * as SecureStore from "expo-secure-store";
import { Keypair, Networks, TransactionBuilder, Operation, Asset, Account } from "@stellar/stellar-sdk";


import { generateWallet, getPublicKey, importWallet, sign, wipe } from "./wallet";

jest.unmock("@stellar/stellar-sdk");

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));
jest.mock("expo-local-authentication", () => ({
  hasHardwareAsync: jest.fn().mockResolvedValue(true),
  isEnrolledAsync: jest.fn().mockResolvedValue(true),
  authenticateAsync: jest.fn().mockResolvedValue({ success: true }),
}));

const store = SecureStore as jest.Mocked<typeof SecureStore>;
const walletSecretKey = "mindvault_wallet_secret";
const walletPublicKey = "mindvault_wallet_public";

beforeEach(() => {
  jest.resetAllMocks();
  store.setItemAsync.mockResolvedValue();
  store.deleteItemAsync.mockResolvedValue();
  store.getItemAsync.mockResolvedValue(null);
});

describe("wallet service", () => {
  it("generates a wallet and stores secret and public key securely", async () => {
    const publicKey = await generateWallet();
    expect(publicKey).toMatch(/^G[A-Z2-7]{55}$/);
    expect(store.setItemAsync).toHaveBeenCalledTimes(2);
    expect(store.setItemAsync).toHaveBeenCalledWith(walletPublicKey, publicKey);
    const secret = (store.setItemAsync.mock.calls.find(([key]) => key === walletSecretKey)?.[1]);
    expect(secret).toMatch(/^S[A-Z2-7]{55}$/);
    expect(publicKey).not.toBe(secret);
  });

  it("validates imported secrets and stores only valid keypairs", async () => {
    const keypair = Keypair.random();
    await expect(importWallet(` ${keypair.secret()} `)).resolves.toBe(keypair.publicKey());
    await expect(importWallet("not-a-secret")).rejects.toThrow(/invalid secret key/i);
    expect(store.setItemAsync).toHaveBeenCalledTimes(2);
  });

  it("rolls back the secret if saving the public key fails", async () => {
    store.setItemAsync.mockImplementation(async (key) => {
      if (key === walletPublicKey) throw new Error("storage failure");
    });
    await expect(generateWallet()).rejects.toThrow("storage failure");
    expect(store.deleteItemAsync).toHaveBeenCalledWith(walletSecretKey);
  });

  it("returns the public key and wipes both wallet values", async () => {
    store.getItemAsync.mockResolvedValue("Gpublic");
    await expect(getPublicKey()).resolves.toBe("Gpublic");
    await wipe();
    expect(store.deleteItemAsync).toHaveBeenCalledWith(walletSecretKey);
    expect(store.deleteItemAsync).toHaveBeenCalledWith(walletPublicKey);
  });

  it("signs XDR with the stored key without exposing the secret", async () => {
    const keypair = Keypair.random();
    store.getItemAsync.mockImplementation(async (key) =>
      key === walletSecretKey ? keypair.secret() : null
    );
    const transaction = new TransactionBuilder(
      new Account(keypair.publicKey(), "1"),
      { fee: "100", networkPassphrase: Networks.TESTNET }
    ).addOperation(Operation.payment({
      destination: Keypair.random().publicKey(),
      asset: Asset.native(),
      amount: "1",
    })).setTimeout(30).build();

    const signed = await sign(transaction.toXDR(), Networks.TESTNET);
    expect(signed).not.toBe(transaction.toXDR());
    expect(signed).not.toContain(keypair.secret());
  });

  it("rejects invalid XDR with a safe message", async () => {
    store.getItemAsync.mockImplementation(async (key) => key === walletSecretKey ? Keypair.random().secret() : null);
    await expect(sign("not-xdr", Networks.TESTNET)).rejects.toThrow("Unable to sign this Stellar transaction.");
  });
});
