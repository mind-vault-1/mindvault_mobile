import fixtures from "./fixtures/publishers.json";

type Fixture = {
  method: string;
  path: string;
  request?: {
    headers?: Record<string, string>;
    body?: Record<string, unknown>;
    required?: string[];
  };
  response: {
    status: number;
    body?: Record<string, unknown>;
    required: string[];
  };
};

type PublisherFixtures = {
  _refresh: { note: string; steps: string[] };
  registerPublisher: Fixture;
  prepareRegister: Fixture;
  submitRegister: Fixture;
  preparePriceEdit: Fixture;
  submitPriceEdit: Fixture;
  prepareOwnershipTransfer: Fixture;
  submitOwnershipTransfer: Fixture;
  delist: Fixture;
  rotateApiKey: Fixture;
};

const data = fixtures as PublisherFixtures;

function deepCopy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function expectRequiredFields(body: Record<string, unknown>, required: string[]): void {
  for (const field of required) {
    expect(body).toHaveProperty(field);
    expect((body as Record<string, unknown>)[field]).not.toBeUndefined();
  }
}

function expectExactKeys(body: Record<string, unknown>, required: string[]): void {
  expect(Object.keys(body).sort()).toEqual([...required].sort());
}

function validateFixtureShape(fixture: Fixture): string[] {
  const problems: string[] = [];
  if (!fixture.method || !fixture.path) problems.push("missing method/path");
  if (!fixture.response) {
    problems.push("missing response");
    return problems;
  }
  const body = fixture.response.body;
  if (body) {
    for (const field of fixture.response.required) {
      if (!(field in body)) problems.push(`response missing required field "${field}"`);
    }
  } else if (fixture.response.required.length > 0) {
    problems.push("response body missing");
  }

  const requestBody = fixture.request?.body;
  const requestRequired = fixture.request?.required ?? [];
  if (requestBody) {
    for (const field of requestRequired) {
      if (!(field in requestBody)) problems.push(`request missing required field "${field}"`);
    }
  }
  return problems;
}

function expectProblemsToMentionField(problems: string[], field: string): void {
  expect(problems.join("\n")).toContain(field);
}

const CONTRACT_CASES: Array<{
  name: string;
  fixture: Fixture;
  requestType: Record<string, string>;
  responseType: Record<string, string>;
}> = [
  {
    name: "register publisher",
    fixture: data.registerPublisher,
    requestType: { name: "string", email: "string", walletAddress: "string" },
    responseType: {
      id: "string",
      name: "string",
      email: "string",
      walletAddress: "string",
      apiKey: "string",
      createdAt: "string",
    },
  },
  {
    name: "prepare register",
    fixture: data.prepareRegister,
    requestType: {},
    responseType: { unsignedXdr: "string", networkPassphrase: "string" },
  },
  {
    name: "submit register",
    fixture: data.submitRegister,
    requestType: { signedXdr: "string" },
    responseType: { id: "string", onchainStatus: "string", txHash: "string" },
  },
  {
    name: "prepare price edit",
    fixture: data.preparePriceEdit,
    requestType: { price: "string" },
    responseType: { unsignedXdr: "string", networkPassphrase: "string" },
  },
  {
    name: "submit price edit",
    fixture: data.submitPriceEdit,
    requestType: { signedXdr: "string", price: "string" },
    responseType: { id: "string", price: "string", status: "string" },
  },
  {
    name: "prepare ownership transfer",
    fixture: data.prepareOwnershipTransfer,
    requestType: { newCreator: "string" },
    responseType: { unsignedXdr: "string", networkPassphrase: "string" },
  },
  {
    name: "submit ownership transfer",
    fixture: data.submitOwnershipTransfer,
    requestType: { signedXdr: "string", newCreator: "string" },
    responseType: { id: "string", newCreator: "string", status: "string", txHash: "string" },
  },
  {
    name: "delist",
    fixture: data.delist,
    requestType: {},
    responseType: { id: "string", message: "string" },
  },
  {
    name: "rotate api key",
    fixture: data.rotateApiKey,
    requestType: {},
    responseType: { apiKey: "string" },
  },
];

describe("publisher write endpoint contract fixtures", () => {
  it("includes fixture refresh instructions", () => {
    expect(data._refresh.note).toMatch(/refresh/i);
    expect(data._refresh.steps.join("\n")).toContain("contract:update");
    expect(data._refresh.steps.join("\n")).toContain("Redact secrets");
  });

  it.each(CONTRACT_CASES)("captures real $name request/response shapes", ({ fixture, requestType, responseType }) => {
    expect(fixture.method).toMatch(/^(GET|POST|DELETE)$/);
    expect(fixture.path).toContain("/");
    expect(fixture.response.status).toBeGreaterThanOrEqual(200);

    if (fixture.request?.body) {
      expectExactKeys(fixture.request.body, fixture.request.required ?? []);
      for (const [field, type] of Object.entries(requestType)) {
        expect(typeof fixture.request.body[field]).toBe(type);
      }
    } else {
      expect(Object.keys(requestType)).toHaveLength(0);
    }

    if (fixture.response.body) {
      expectRequiredFields(fixture.response.body, fixture.response.required);
      for (const [field, type] of Object.entries(responseType)) {
        if (field in fixture.response.body) {
          expect(typeof fixture.response.body[field]).toBe(type);
        }
      }
    }
  });

  it("keeps publisher write endpoints behind API key auth headers", () => {
    const authed = [
      data.prepareRegister,
      data.submitRegister,
      data.preparePriceEdit,
      data.submitPriceEdit,
      data.prepareOwnershipTransfer,
      data.submitOwnershipTransfer,
      data.delist,
      data.rotateApiKey,
    ];
    for (const fixture of authed) {
      expect(fixture.request?.headers?.["x-api-key"]).toBe("<PUBLISHER_API_KEY>");
    }
  });

  it("fails when a required response field is renamed or removed", () => {
    for (const { fixture } of CONTRACT_CASES) {
      if (!fixture.response.body) continue;
      for (const field of fixture.response.required) {
        const renamed = deepCopy(fixture);
        const body = renamed.response.body as Record<string, unknown>;
        body[`${field}Renamed`] = body[field];
        delete body[field];
        const problems = validateFixtureShape(renamed);
        expectProblemsToMentionField(problems, field);

        const removed = deepCopy(fixture);
        delete (removed.response.body as Record<string, unknown>)[field];
        const removedProblems = validateFixtureShape(removed);
        expectProblemsToMentionField(removedProblems, field);
      }
    }
  });

  it("fails when a required request field is renamed or removed", () => {
    for (const { fixture } of CONTRACT_CASES) {
      const body = fixture.request?.body;
      const required = fixture.request?.required ?? [];
      if (!body) continue;
      for (const field of required) {
        const renamed = deepCopy(fixture);
        const requestBody = renamed.request?.body as Record<string, unknown>;
        requestBody[`${field}Renamed`] = requestBody[field];
        delete requestBody[field];
        const problems = validateFixtureShape(renamed);
        expectProblemsToMentionField(problems, field);

        const removed = deepCopy(fixture);
        delete (removed.request?.body as Record<string, unknown>)[field];
        const removedProblems = validateFixtureShape(removed);
        expectProblemsToMentionField(removedProblems, field);
      }
    }
  });
});
