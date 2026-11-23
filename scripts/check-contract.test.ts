import {
  CONTRACT,
  UNDOCUMENTED,
  checkContract,
  loadSpec,
  newlyDocumented,
  resolveSchema,
  serializeSnapshot,
  type Operation,
} from "./check-contract";

const snapshot = require("../src/api/__contract__/openapi.snapshot.json");

/** A deep copy of the committed spec that a test can break. */
function spec(mutate?: (copy: any) => void): any {
  const copy = JSON.parse(JSON.stringify(snapshot));
  mutate?.(copy);
  return copy;
}

const resourceItem = (copy: any) => copy.components.schemas.Resource;

describe("the committed snapshot", () => {
  it("provides everything the app relies on", () => {
    expect(checkContract(snapshot)).toEqual([]);
  });

  it("is serialized stably: sorted keys and a trailing newline", () => {
    const text = serializeSnapshot(snapshot);

    expect(text.endsWith("}\n")).toBe(true);
    expect(serializeSnapshot(JSON.parse(text))).toBe(text);
    expect(serializeSnapshot({ b: 1, a: { d: 1, c: 2 } })).toBe(
      '{\n  "a": {\n    "c": 2,\n    "d": 1\n  },\n  "b": 1\n}\n'
    );
  });

  it("does not list an endpoint as undocumented that the spec already has", () => {
    expect(newlyDocumented(snapshot)).toEqual([]);
    expect(UNDOCUMENTED.length).toBeGreaterThan(0);
  });
});

describe("checkContract detects server changes that break the app", () => {
  it("a removed or renamed endpoint", () => {
    const broken = spec((copy) => {
      delete copy.paths["/registry/status"];
    });

    expect(checkContract(broken)).toEqual([
      expect.stringContaining("GET /registry/status (src/api/resources.ts): not in the spec"),
    ]);
  });

  it("a removed method on a kept path", () => {
    const broken = spec((copy) => {
      delete copy.paths["/resources/{id}"].delete;
    });

    expect(checkContract(broken)).toEqual([expect.stringContaining("DELETE /resources/{id}")]);
  });

  it("a response field that disappears", () => {
    const broken = spec((copy) => {
      delete resourceItem(copy).properties.accessUrl;
    });

    const problems = checkContract(broken);

    expect(problems).toContainEqual(expect.stringContaining('GET /resources'));
    expect(problems.join("\n")).toContain('no longer has "accessUrl"');
  });

  it("a response field whose type changes", () => {
    const broken = spec((copy) => {
      resourceItem(copy).properties.price = { type: "number" };
    });

    expect(checkContract(broken).join("\n")).toContain(
      'response field "price" is number in the spec, the app expects string'
    );
  });

  it("an integer field is accepted where the app expects a number", () => {
    const loose = spec((copy) => {
      copy.components.schemas.RegistryStatusResponse.properties.resourceCount = { type: "integer" };
    });

    expect(checkContract(loose)).toEqual([]);
  });

  it("a list response that stops being an array", () => {
    const broken = spec((copy) => {
      copy.paths["/resources"].get.responses["200"].content["application/json"].schema = { type: "object" };
    });

    expect(checkContract(broken).join("\n")).toContain("is no longer an array");
  });

  it("a success status that is no longer documented", () => {
    const broken = spec((copy) => {
      delete copy.paths["/resources"].post.responses["201"];
    });

    expect(checkContract(broken).join("\n")).toContain("response 201 is no longer documented");
  });

  it("a query parameter that is dropped", () => {
    const broken = spec((copy) => {
      copy.paths["/resources"].get.parameters = copy.paths["/resources"].get.parameters.filter(
        (p: any) => p.name !== "offset"
      );
    });

    expect(checkContract(broken).join("\n")).toContain('query parameter "offset" is no longer accepted');
  });

  it("a query parameter that becomes required", () => {
    const broken = spec((copy) => {
      copy.paths["/resources"].get.parameters.push({ name: "region", in: "query", required: true });
    });

    expect(checkContract(broken).join("\n")).toContain('"region" is now required but the app does not send it');
  });

  it("a request field that is no longer accepted", () => {
    const broken = spec((copy) => {
      const schema = copy.paths["/resources/{id}/price"].post.requestBody.content["application/json"].schema;
      delete schema.properties.price;
    });

    expect(checkContract(broken).join("\n")).toContain('request field "price" is no longer accepted');
  });

  it("a request field that becomes required", () => {
    const broken = spec((copy) => {
      const schema = copy.paths["/resources"].post.requestBody.content["application/json"].schema;
      schema.properties.category = { type: "string" };
      schema.required = [...(schema.required ?? []), "category"];
    });

    expect(checkContract(broken).join("\n")).toContain('"category" is now required but the app does not send it');
  });

  it("a request body that is no longer JSON", () => {
    const broken = spec((copy) => {
      copy.paths["/resources/{id}/register"].post.requestBody = {
        content: { "text/plain": { schema: { type: "string" } } },
      };
    });

    expect(checkContract(broken).join("\n")).toContain("no longer describes a JSON request body");
  });

  it("reports every problem, not just the first", () => {
    const broken = spec((copy) => {
      delete copy.paths["/health"];
      delete copy.paths["/registry/status"];
    });

    expect(checkContract(broken)).toHaveLength(2);
  });
});

describe("schema resolution", () => {
  const doc = {
    components: {
      schemas: {
        Base: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
        Alias: { $ref: "#/components/schemas/Base" },
      },
    },
  };

  it("follows $ref chains and merges allOf parts", () => {
    const merged = resolveSchema(doc, {
      allOf: [{ $ref: "#/components/schemas/Alias" }, { type: "object", properties: { apiKey: { type: "string" } } }],
    });

    expect(Object.keys(merged.properties).sort()).toEqual(["apiKey", "id"]);
    expect(merged.required).toEqual(["id"]);
  });

  it("returns an empty schema for an unresolvable reference", () => {
    expect(resolveSchema(doc, { $ref: "#/components/schemas/Missing" }).properties).toEqual({});
  });

  it("matches an endpoint documented later through newlyDocumented", () => {
    const later = spec((copy) => {
      copy.paths["/tips/verify"] = { post: {} };
    });

    expect(newlyDocumented(later)).toEqual([expect.stringContaining("POST /tips/verify")]);
  });
});

describe("the contract table", () => {
  it("has no duplicate operations", () => {
    const keys = CONTRACT.map((op: Operation) => `${op.method} ${op.path}`);

    expect(new Set(keys).size).toBe(keys.length);
  });

  it("names a source file for every operation", () => {
    for (const op of CONTRACT) expect(op.usedBy).toMatch(/^src\/.+\.tsx?$/);
  });
});

describe("loadSpec", () => {
  it("reads a JSON file", async () => {
    const fs = require("node:fs");
    const os = require("node:os");
    const path = require("node:path");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "contract-"));
    const file = path.join(dir, "openapi.json");
    fs.writeFileSync(file, JSON.stringify({ openapi: "3.0.3", paths: {} }));

    await expect(loadSpec(file)).resolves.toEqual({ openapi: "3.0.3", paths: {} });
    await expect(loadSpec(path.join(dir, "missing.json"))).rejects.toThrow("No OpenAPI source");
  });
});
