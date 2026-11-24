/**
 * Contract check between the app and the MindVault server's OpenAPI spec.
 *
 * The server publishes its spec in `server/src/openapi.ts` of
 * https://github.com/mind-vault-1/mindvault. A copy is committed at
 * `src/api/__contract__/openapi.snapshot.json`. `CONTRACT` below lists every
 * endpoint the app calls and what it relies on: the query parameters and JSON
 * body fields it sends, and the response fields it reads, with their JSON types
 * (taken from the types in `src/api/*.ts` and `src/types.ts`). The check fails
 * when the snapshot no longer provides one of them, so a server change that
 * would break the app breaks CI first instead.
 *
 * Usage (Node 22):
 *   node --experimental-strip-types scripts/check-contract.ts
 *       Check the app's contract against the committed snapshot. No network.
 *
 *   npm run contract:update -- --source <server checkout | openapi.ts | openapi.json | https://api.host>
 *       Refresh the snapshot from the server, then re-run the check against it.
 *       A directory is read as a checkout of the server repo (server/src/openapi.ts),
 *       a URL is read from `<url>/openapi.json`. MINDVAULT_OPENAPI_SOURCE is used
 *       when --source is omitted.
 *
 *   node --experimental-strip-types scripts/check-contract.ts --fresh --source <...>
 *       Fail when the snapshot differs from the server's current spec
 *       (the scheduled drift job in .github/workflows/contract.yml).
 *
 * Update workflow: when the server's spec changes, run `npm run contract:update`
 * with the new spec, review the snapshot diff, and commit it with any app change
 * the check asks for. When the app starts using another endpoint or field, add it
 * to CONTRACT in the same PR. See "Contract check" in docs/API.md.
 */

declare const process: {
  argv: string[];
  env: Record<string, string | undefined>;
  stdout: { write(chunk: string): void };
  stderr: { write(chunk: string): void };
  exitCode?: number;
  /** Node 22.3+; used instead of `require`, which is undefined in ESM. */
  getBuiltinModule?: (id: string) => any;
};

export type HttpMethod = "get" | "post" | "delete";
export type JsonType = "string" | "number" | "boolean" | "array" | "object";

export interface Operation {
  method: HttpMethod;
  /** Path template exactly as the spec writes it. */
  path: string;
  /** Where the app calls it. */
  usedBy: string;
  /** Query parameters the app sends. */
  query?: string[];
  /** JSON body fields the app sends. The spec must accept them, and must not require any others. */
  body?: string[];
  /** The success response the app reads. `items` means the response is an array of that object. */
  response?: { status: string; items?: boolean; fields: Record<string, JsonType> };
}

const RESOURCE_FIELDS: Record<string, JsonType> = {
  id: "string",
  title: "string",
  price: "string",
  resourceType: "string",
  walletAddress: "string",
  verificationStatus: "string",
  onchainStatus: "string",
  onchainTxHash: "string",
  listed: "boolean",
  accessUrl: "string",
  contentHash: "string",
};

export const CONTRACT: readonly Operation[] = [
  {
    method: "get",
    path: "/health",
    usedBy: "src/api/health.ts",
    response: { status: "200", fields: { status: "string" } },
  },
  {
    method: "get",
    path: "/registry/status",
    usedBy: "src/api/resources.ts",
    response: { status: "200", fields: { resourceCount: "number" } },
  },
  {
    method: "get",
    path: "/resources",
    usedBy: "src/api/resources.ts",
    query: ["search", "sort", "limit", "offset"],
    response: { status: "200", items: true, fields: RESOURCE_FIELDS },
  },
  {
    method: "get",
    path: "/resources/{id}/meta",
    usedBy: "src/api/resources.ts",
    response: { status: "200", fields: RESOURCE_FIELDS },
  },
  {
    method: "get",
    path: "/resources/{id}/verification",
    usedBy: "src/api/verification.ts",
    response: { status: "200", fields: { isOriginal: "boolean", confidence: "number", flags: "array" } },
  },
  {
    method: "post",
    path: "/resources",
    usedBy: "src/api/publish.ts",
    body: ["title", "description", "price", "walletAddress", "externalUrl"],
    response: { status: "201", fields: { id: "string", verificationStatus: "string", onchainStatus: "string" } },
  },
  {
    method: "get",
    path: "/resources/{id}/register/prepare",
    usedBy: "src/api/resources.ts",
    response: { status: "200", fields: { unsignedXdr: "string", networkPassphrase: "string" } },
  },
  {
    method: "post",
    path: "/resources/{id}/register",
    usedBy: "src/api/resources.ts",
    body: ["signedXdr"],
    response: { status: "200", fields: { id: "string", onchainStatus: "string" } },
  },
  {
    method: "post",
    path: "/resources/{id}/price/prepare",
    usedBy: "src/api/resources.ts",
    body: ["price"],
    response: { status: "200", fields: { unsignedXdr: "string", networkPassphrase: "string" } },
  },
  {
    method: "post",
    path: "/resources/{id}/price",
    usedBy: "src/api/resources.ts",
    body: ["signedXdr", "price"],
    response: { status: "200", fields: { id: "string", price: "string" } },
  },
  {
    method: "post",
    path: "/resources/{id}/ownership/prepare",
    usedBy: "src/api/resources.ts",
    body: ["newCreator"],
    response: { status: "200", fields: { unsignedXdr: "string", networkPassphrase: "string" } },
  },
  {
    method: "post",
    path: "/resources/{id}/ownership",
    usedBy: "src/api/resources.ts",
    body: ["signedXdr", "newCreator"],
    response: { status: "200", fields: { id: "string" } },
  },
  {
    method: "delete",
    path: "/resources/{id}",
    usedBy: "src/api/resources.ts",
  },
  {
    method: "post",
    path: "/publishers",
    usedBy: "src/api/publishers.ts",
    body: ["name", "email", "walletAddress"],
  },
  {
    method: "get",
    path: "/publishers/wallet/{address}",
    usedBy: "src/api/publishers.ts",
    response: { status: "200", fields: { id: "string", name: "string", walletAddress: "string" } },
  },
  {
    method: "get",
    path: "/publishers/me",
    usedBy: "src/api/publishers.ts",
    response: {
      status: "200",
      fields: { id: "string", name: "string", email: "string", walletAddress: "string", createdAt: "string" },
    },
  },
  {
    method: "get",
    path: "/publishers/me/resources",
    usedBy: "src/api/publishers.ts",
    response: { status: "200", items: true, fields: RESOURCE_FIELDS },
  },
  {
    method: "get",
    path: "/publishers/me/analytics",
    usedBy: "src/api/publishers.ts",
    response: { status: "200", fields: { summary: "object", resources: "array" } },
  },
  {
    method: "get",
    path: "/publishers/leaderboard",
    usedBy: "src/api/publishers.ts",
    response: {
      status: "200",
      items: true,
      fields: {
        id: "string",
        name: "string",
        walletAddress: "string",
        joinedAt: "string",
        totalResources: "number",
        listedResources: "number",
        verifiedResources: "number",
        totalSales: "number",
        totalEarned: "string",
      },
    },
  },
];

/**
 * Endpoints the app calls that the spec does not describe yet. They are not
 * checked; they are listed so the gap stays visible. When the server documents
 * one, the check says so and the entry should move into CONTRACT.
 */
export const UNDOCUMENTED: readonly { method: HttpMethod; path: string; usedBy: string }[] = [
  { method: "get", path: "/publishers/me/api-key", usedBy: "src/api/publishers.ts" },
  { method: "post", path: "/publishers/me/api-key/rotate", usedBy: "src/api/publishers.ts" },
  { method: "get", path: "/resources/{id}/lease/quote", usedBy: "src/api/leases.ts" },
  { method: "post", path: "/tips/verify", usedBy: "src/api/tips.ts" },
];

type Json = Record<string, any>;

export const SNAPSHOT_PATH = "src/api/__contract__/openapi.snapshot.json";

function resolveRef(spec: Json, ref: string): Json | undefined {
  if (!ref.startsWith("#/")) return undefined;
  return ref
    .slice(2)
    .split("/")
    .reduce<any>((node, key) => (node === undefined ? undefined : node[key]), spec);
}

/**
 * The object properties of a schema: `$ref`s are followed and `allOf` parts merged.
 * `array` is set when the schema is an array, with `items` the element schema.
 */
export function resolveSchema(
  spec: Json,
  schema: Json | undefined,
  depth = 0
): { type?: string; properties: Record<string, Json>; required: string[]; items?: Json } {
  const empty = { properties: {}, required: [] as string[] };
  if (!schema || depth > 10) return empty;
  if (typeof schema.$ref === "string") return resolveSchema(spec, resolveRef(spec, schema.$ref), depth + 1);

  let properties: Record<string, Json> = { ...(schema.properties ?? {}) };
  let required: string[] = [...(schema.required ?? [])];
  for (const part of schema.allOf ?? []) {
    const merged = resolveSchema(spec, part, depth + 1);
    properties = { ...properties, ...merged.properties };
    required = [...required, ...merged.required];
  }
  return { type: schema.type, properties, required, items: schema.items };
}

/** The JSON type a property is declared as, following `$ref`. `integer` counts as `number`. */
function declaredType(spec: Json, property: Json): string | undefined {
  const type = resolveSchema(spec, property).type ?? property.type;
  return type === "integer" ? "number" : type;
}

function jsonSchemaOf(content: Json | undefined): Json | undefined {
  return content?.["application/json"]?.schema;
}

/** Problems found when the app's contract is checked against `spec`; empty when it holds. */
export function checkContract(spec: Json, contract: readonly Operation[] = CONTRACT): string[] {
  const problems: string[] = [];

  for (const op of contract) {
    const label = `${op.method.toUpperCase()} ${op.path} (${op.usedBy})`;
    const operation = spec.paths?.[op.path]?.[op.method];
    if (!operation) {
      problems.push(`${label}: not in the spec. The server removed or renamed it.`);
      continue;
    }

    const declaredQuery = new Set<string>(
      (operation.parameters ?? []).filter((p: Json) => p.in === "query").map((p: Json) => p.name)
    );
    for (const name of op.query ?? []) {
      if (!declaredQuery.has(name)) problems.push(`${label}: query parameter "${name}" is no longer accepted.`);
    }
    const requiredQuery = (operation.parameters ?? []).filter((p: Json) => p.in === "query" && p.required);
    for (const param of requiredQuery) {
      if (!(op.query ?? []).includes(param.name)) {
        problems.push(`${label}: query parameter "${param.name}" is now required but the app does not send it.`);
      }
    }

    if (op.body) {
      const body = resolveSchema(spec, jsonSchemaOf(operation.requestBody?.content));
      if (Object.keys(body.properties).length === 0) {
        problems.push(`${label}: the spec no longer describes a JSON request body.`);
      }
      for (const field of op.body) {
        if (!(field in body.properties)) problems.push(`${label}: request field "${field}" is no longer accepted.`);
      }
      for (const field of body.required) {
        if (!op.body.includes(field)) {
          problems.push(`${label}: request field "${field}" is now required but the app does not send it.`);
        }
      }
    }

    if (op.response) {
      const { status, items, fields } = op.response;
      const response = operation.responses?.[status];
      if (!response) {
        problems.push(`${label}: response ${status} is no longer documented.`);
        continue;
      }
      let target = resolveSchema(spec, jsonSchemaOf(response.content));
      if (items) {
        if (target.type !== "array") {
          problems.push(`${label}: response ${status} is no longer an array.`);
          continue;
        }
        target = resolveSchema(spec, target.items);
      }
      for (const [field, type] of Object.entries(fields)) {
        const property = target.properties[field];
        if (!property) {
          problems.push(`${label}: response ${status} no longer has "${field}".`);
          continue;
        }
        const actual = declaredType(spec, property);
        if (actual !== type) {
          problems.push(
            `${label}: response field "${field}" is ${actual ?? "untyped"} in the spec, the app expects ${type}.`
          );
        }
      }
    }
  }

  return problems;
}

/** Entries of UNDOCUMENTED the spec now describes. */
export function newlyDocumented(spec: Json, list = UNDOCUMENTED): string[] {
  return list
    .filter((entry) => spec.paths?.[entry.path]?.[entry.method])
    .map((entry) => `${entry.method.toUpperCase()} ${entry.path} is in the spec now; move it from UNDOCUMENTED into CONTRACT.`);
}

function sortKeys(value: any): any {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortKeys(value[key])])
    );
  }
  return value;
}

/** Stable text for the committed snapshot: sorted keys, two-space indent, trailing newline. */
export function serializeSnapshot(spec: Json): string {
  return `${JSON.stringify(sortKeys(spec), null, 2)}\n`;
}

function builtin(id: string): any {
  if (!process.getBuiltinModule) throw new Error("Run with Node 22.3 or newer.");
  return process.getBuiltinModule(id);
}

/** Loads the spec from a server checkout, an `openapi.ts` / `.json` file, or a running server. */
export async function loadSpec(source: string): Promise<Json> {
  if (/^https?:\/\//i.test(source)) {
    const url = source.endsWith(".json") ? source : `${source.replace(/\/+$/, "")}/openapi.json`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`GET ${url} returned ${response.status}`);
    return (await response.json()) as Json;
  }

  const fs = builtin("node:fs");
  const path = builtin("node:path");
  let file = path.resolve(source);
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
    file = path.join(file, fs.existsSync(path.join(file, "server")) ? "server/src/openapi.ts" : "src/openapi.ts");
  }
  if (!fs.existsSync(file)) throw new Error(`No OpenAPI source at ${file}`);

  if (file.endsWith(".json")) return JSON.parse(fs.readFileSync(file, "utf8")) as Json;
  const mod = await import(builtin("node:url").pathToFileURL(file).href);
  if (!mod.openApiSpec) throw new Error(`${file} does not export openApiSpec`);
  return JSON.parse(JSON.stringify(mod.openApiSpec)) as Json;
}

function flag(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

function report(spec: Json): boolean {
  const problems = checkContract(spec);
  for (const problem of problems) process.stderr.write(`::error::${problem}\n`);
  for (const note of newlyDocumented(spec)) process.stdout.write(`::notice::${note}\n`);
  if (problems.length > 0) {
    process.stderr.write(
      `\n${problems.length} contract problem(s). Fix the app, or update CONTRACT if the app no longer relies on it.\n`
    );
    return false;
  }
  process.stdout.write(`Contract holds: ${CONTRACT.length} endpoints match the snapshot.\n`);
  return true;
}

async function main(argv: string[]): Promise<void> {
  const fs = builtin("node:fs");
  const update = argv.includes("--update");
  const fresh = argv.includes("--fresh");
  const source = flag(argv, "--source") ?? process.env.MINDVAULT_OPENAPI_SOURCE;

  if ((update || fresh) && !source) {
    process.stderr.write(
      "::error::Pass --source <server checkout | openapi.ts | openapi.json | url> (or set MINDVAULT_OPENAPI_SOURCE).\n"
    );
    process.exitCode = 2;
    return;
  }

  if (update) {
    const text = serializeSnapshot(await loadSpec(source as string));
    fs.mkdirSync(SNAPSHOT_PATH.replace(/\/[^/]+$/, ""), { recursive: true });
    fs.writeFileSync(SNAPSHOT_PATH, text);
    process.stdout.write(`Wrote ${SNAPSHOT_PATH}. Review the diff before committing.\n`);
  }

  if (!fs.existsSync(SNAPSHOT_PATH)) {
    process.stderr.write(`::error::${SNAPSHOT_PATH} is missing. Run npm run contract:update -- --source <server>.\n`);
    process.exitCode = 1;
    return;
  }
  const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf8")) as Json;

  if (fresh) {
    const current = serializeSnapshot(await loadSpec(source as string));
    if (current !== serializeSnapshot(snapshot)) {
      process.stderr.write(
        "::error::The server's OpenAPI spec differs from the committed snapshot. Run npm run contract:update -- --source <server> and review the diff.\n"
      );
      process.exitCode = 1;
      return;
    }
    process.stdout.write("Snapshot matches the server's current spec.\n");
  }

  if (!report(snapshot)) process.exitCode = 1;
}

if (String(process.argv[1] ?? "").endsWith("check-contract.ts")) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(`::error::${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
