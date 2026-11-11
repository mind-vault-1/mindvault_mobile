import {
  CatalogPageSchema,
  PreparedTransactionSchema,
  RegistryStatusSchema,
  ResourceSchema,
} from "./schemas";

describe("ResourceSchema", () => {
  const validResource = {
    id: "res-123",
    title: "Quantum Mechanics Notes",
    price: "10.00",
    resourceType: "file",
    publisherName: "Alice",
    walletAddress: "GBVOLKEYEXAMPLE1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    verificationStatus: "verified",
    onchainStatus: "registered",
    onchainTxHash: "a1b2c3d4",
    listed: true,
    accessUrl: "https://mindvault.io/access/res-123",
    mimeType: "application/pdf",
    thumbnailUrl: "https://mindvault.io/thumb/res-123.png",
    publishedAt: "2026-11-10T12:00:00Z",
    updatedAt: "2026-11-11T08:00:00Z",
  };

  it("successfully parses a valid resource payload", () => {
    const parsed = ResourceSchema.parse(validResource);
    expect(parsed.id).toBe("res-123");
    expect(parsed.verificationStatus).toBe("verified");
    expect(parsed.listed).toBe(true);
  });

  it("handles extra fields by stripping or preserving safely without crashing", () => {
    const payloadWithExtra = {
      ...validResource,
      untrackedServerField: "extra_drift_value",
      betaMetadata: { active: true },
    };
    const parsed = ResourceSchema.parse(payloadWithExtra);
    expect(parsed.id).toBe("res-123");
    expect(parsed.title).toBe("Quantum Mechanics Notes");
  });

  it("fails parsing when required fields are missing", () => {
    const missingTitle = { ...validResource };
    delete (missingTitle as any).title;
    expect(() => ResourceSchema.parse(missingTitle)).toThrow();

    const missingWallet = { ...validResource };
    delete (missingWallet as any).walletAddress;
    expect(() => ResourceSchema.parse(missingWallet)).toThrow();

    const missingId = { ...validResource };
    delete (missingId as any).id;
    expect(() => ResourceSchema.parse(missingId)).toThrow();
  });

  it("rejects invalid verificationStatus or onchainStatus enums", () => {
    const invalidStatus = {
      ...validResource,
      verificationStatus: "unknown_status",
    };
    expect(() => ResourceSchema.parse(invalidStatus)).toThrow();

    const invalidOnchain = {
      ...validResource,
      onchainStatus: "corrupted_state",
    };
    expect(() => ResourceSchema.parse(invalidOnchain)).toThrow();
  });
});

describe("CatalogPageSchema", () => {
  const sampleItem = {
    id: "item-1",
    title: "Intro to Soroban",
    price: "5.00",
    resourceType: "link",
    walletAddress: "GBTESTWALLETADDRESS1234567890",
    verificationStatus: "verified",
    onchainStatus: "registered",
    listed: true,
    accessUrl: "https://example.com/item-1",
  };

  it("parses a bare array catalog response", () => {
    const payload = [sampleItem];
    const parsed = CatalogPageSchema.parse(payload);
    expect(Array.isArray(parsed)).toBe(true);
    expect((parsed as any)[0].id).toBe("item-1");
  });

  it("parses a paginated envelope catalog response", () => {
    const payload = {
      items: [sampleItem],
      total: 25,
      nextOffset: 10,
    };
    const parsed = CatalogPageSchema.parse(payload);
    expect(Array.isArray(parsed)).toBe(false);
    expect((parsed as any).items).toHaveLength(1);
    expect((parsed as any).total).toBe(25);
    expect((parsed as any).nextOffset).toBe(10);
  });

  it("fails when item inside catalog payload violates resource schema", () => {
    const badPayload = [
      {
        id: "broken",
        // missing required fields title, walletAddress, etc.
      },
    ];
    expect(() => CatalogPageSchema.parse(badPayload)).toThrow();
  });
});

describe("RegistryStatusSchema", () => {
  it("parses valid registry status", () => {
    const parsed = RegistryStatusSchema.parse({ resourceCount: 42 });
    expect(parsed.resourceCount).toBe(42);
  });

  it("fails when resourceCount is missing or non-numeric", () => {
    expect(() => RegistryStatusSchema.parse({})).toThrow();
    expect(() => RegistryStatusSchema.parse({ resourceCount: "invalid" })).toThrow();
  });
});

describe("PreparedTransactionSchema", () => {
  it("parses valid prepared transaction payload", () => {
    const parsed = PreparedTransactionSchema.parse({
      unsignedXdr: "AAAAE...",
      networkPassphrase: "Test SDF Network ; September 2015",
    });
    expect(parsed.unsignedXdr).toBe("AAAAE...");
    expect(parsed.networkPassphrase).toContain("Test SDF");
  });

  it("parses prepared transaction when networkPassphrase is omitted", () => {
    const parsed = PreparedTransactionSchema.parse({
      unsignedXdr: "AAAAE...",
    });
    expect(parsed.unsignedXdr).toBe("AAAAE...");
    expect(parsed.networkPassphrase).toBeUndefined();
  });

  it("fails when unsignedXdr is missing", () => {
    expect(() => PreparedTransactionSchema.parse({})).toThrow();
  });
});
