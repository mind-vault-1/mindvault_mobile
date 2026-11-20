import { Buffer } from "buffer";

import { TIP_PRESETS, initiateTip, submitTip, type TipRequest } from "./tips";

const mockInitiateTip = jest.fn();
const mockSubmitTip = jest.fn();
jest.mock("./payment", () => {
  const actual = jest.requireActual("./payment");
  return {
    ...actual,
    initiateTip: mockInitiateTip,
    submitTip: mockSubmitTip,
  };
});

const originalFetch = global.fetch;
let fetchMock: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof global.fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("tips API", () => {
  describe("TIP_PRESETS", () => {
    it("should export standard tip preset amounts", () => {
      expect(TIP_PRESETS).toEqual(["1.00", "5.00", "10.00", "25.00"]);
    });
  });

  describe("initiateTip", () => {
    it("should throw if publisher ID is missing", async () => {
      const request: TipRequest = {
        publisherId: "",
        amount: "5.00",
      };

      await expect(initiateTip(request)).rejects.toThrow("Publisher ID is required");
    });

    it("should throw if tip amount is zero or negative", async () => {
      const request: TipRequest = {
        publisherId: "pub-123",
        amount: "0.00",
      };

      await expect(initiateTip(request)).rejects.toThrow("greater than zero");
    });

    it("should throw on invalid amount format", async () => {
      const request: TipRequest = {
        publisherId: "pub-123",
        amount: "invalid",
      };

      await expect(initiateTip(request)).rejects.toThrow();
    });

    it("should throw if no payment challenge is received", async () => {
      const request: TipRequest = {
        publisherId: "pub-123",
        amount: "5.00",
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => null },
      });

      await expect(initiateTip(request)).rejects.toThrow("no payment challenge");
    });

    it("should throw if the request fails with 5xx error", async () => {
      const request: TipRequest = {
        publisherId: "pub-123",
        amount: "5.00",
      };

      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
        headers: { get: () => null },
      });

      await expect(initiateTip(request)).rejects.toThrow("Failed to initiate");
    });
  });

  describe("submitTip", () => {
    const challenge = {
      x402Version: 2,
      accepted: {
        scheme: "exact",
        network: "stellar:testnet",
        asset: "contract123",
        amount: "5000000",
        payTo: "GAXMJWXU23RVVKTSX3SH246CONRPSTEYQNDVZLVLND6RJTWCYL35G6V",
        maxTimeoutSeconds: 60,
        extra: { areFeesSponsored: true },
      },
      resource: { url: "https://example.com" },
    };

    it("should throw if the response is not ok", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 400,
      });

      const signature = "mock-signature";
      await expect(submitTip(challenge, signature)).rejects.toThrow("Failed to submit");
    });

    it("should throw if the receipt is missing required fields", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tipId: "tip-123",
          publisherId: "pub-123",
        }),
      });

      const signature = "mock-signature";
      await expect(submitTip(challenge, signature)).rejects.toThrow("missing required");
    });

    it("should throw if the receipt has an invalid timestamp", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tipId: "tip-123",
          publisherId: "pub-123",
          amount: "5000000",
          txHash: "tx-hash-123",
          createdAt: "not-a-date",
        }),
      });

      const signature = "mock-signature";
      await expect(submitTip(challenge, signature)).rejects.toThrow("invalid timestamp");
    });

    it("should return a valid tip receipt on success", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tipId: "tip-123",
          publisherId: "pub-123",
          resourceId: "res-456",
          amount: "5000000",
          txHash: "tx-hash-abc123",
          createdAt: "2026-11-20T12:00:00Z",
        }),
      });

      const signature = "mock-signature";
      const receipt = await submitTip(challenge, signature);

      expect(receipt).toEqual({
        tipId: "tip-123",
        publisherId: "pub-123",
        resourceId: "res-456",
        amount: "5000000",
        txHash: "tx-hash-abc123",
        createdAt: "2026-11-20T12:00:00Z",
      });
    });

    it("should include optional note in request", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tipId: "tip-123",
          publisherId: "pub-123",
          amount: "5000000",
          txHash: "tx-hash-123",
          createdAt: "2026-11-20T12:00:00Z",
        }),
      });

      const signature = "mock-signature";
      const note = "Great work!";
      await submitTip(challenge, signature, { note });

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/tips/verify"),
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining(note),
        })
      );
    });
  });
});
