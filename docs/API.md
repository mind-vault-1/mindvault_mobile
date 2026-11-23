# Mobile API contract

This is the contract between MindVault Mobile and the MindVault server. The mobile
client resolves its base URL from `app.json`'s `extra.apiUrl`, or from a locally
saved override (`@mindvault_api_base_url`); the default is `http://localhost:4021`.
See `src/api/apiSettings.ts` and `src/api/resources.ts`.

Server implementation: <https://github.com/mind-vault-1/mindvault/tree/main/server>.

## Global rules

- Every request is JSON unless the endpoint is explicitly marked multipart or
  plain text. Response bodies are untrusted and validated by the client before
  reaching UI state.
- Public endpoints require no credentials. Publisher endpoints require the
  publisher's API key in `x-api-key`.
- Signing secrets never leave `src/services/wallet.ts`. The server receives only
  signed XDR, payment signatures, or public keys.
- Payments above the configured local spending guard require an extra typed
  confirmation before any request is sent.
- Localized UI strings use stable message keys. API error codes and header names
  stay locale-neutral.
- Unknown response fields are ignored. Removing or changing the type of an
  existing field requires a versioned migration path.
- GET requests retry network and 5xx failures twice (300 ms, 600 ms). POST,
  DELETE, payment access, and receipt fetches are never retried automatically.

## Transport errors

The central client (`src/api/client.ts`) converts every failure to `ApiError`
with a stable `kind`:

| Kind | When | Message |
| --- | --- | --- |
| `network` | fetch rejected | `Network error. Please check your connection.` |
| `timeout` | request exceeded 15 s | `The request timed out. Please try again.` |
| `aborted` | caller cancelled | `The request was cancelled.` |
| `http` | non-2xx response | Server message, or the endpoint fallback below |

`ApiError.status` and `ApiError.headers` are set for `http` errors. Callers use
`headers.get("PAYMENT-REQUIRED")` for x402 challenges and
`headers.get("PAYMENT-RESPONSE")` for settlement metadata.

## Headers

### Pagination

`GET /resources`, `GET /resources/:id/payments`, and `GET /receipts` use either
`limit`/`offset` or `limit`/`cursor`. Servers should return `X-Total-Count`,
`X-Limit`, `X-Offset`, `X-Next-Offset` where applicable. The mobile client also
accepts `{ items, total, nextOffset }` and `{ receipts, nextCursor }` envelopes.

Server source: <https://github.com/mind-vault-1/mindvault/blob/main/server/src/routes/resources.ts>

### x402 payment

| Header | Direction | Meaning |
| --- | --- | --- |
| `PAYMENT-REQUIRED` | server → client | Base64 JSON x402 challenge on HTTP 402. |
| `PAYMENT-SIGNATURE` | client → server | Base64 JSON `{ x402Version, accepted, resource, ... }` plus signed transaction. Must not be replayed. |
| `PAYMENT-RESPONSE` | server → client | Base64 JSON settlement receipt on the successful retry. Best effort on mobile. |
| `X-Payment-Id`, `X-Payment-Amount`, `X-Payment-Recipient` | server → client | Settlement metadata exposed by CORS. |

Server source: <https://github.com/mind-vault-1/mindvault/blob/main/server/src/middleware/dynamicPaywall.ts>

### HMAC request signing

Publisher writes use the API key plus signed headers when the server requires
request signatures:

| Header | Meaning |
| --- | --- |
| `x-api-key` | Publisher API key. |
| `X-Timestamp` | Unix seconds, 10 digits. |
| `X-Signature` | Lowercase hex HMAC-SHA256. |
| `Idempotency-Key` | Optional unique key for retry-safe writes. |

Canonical string:

```text
METHOD
PATH
TIMESTAMP
SHA256(body)
[idempotencyKey]
```

`SHA256(body)` is over the exact UTF-8 bytes sent; bodyless DELETE/GET requests
use the empty-string hash. Client implementation:
`src/utils/requestSignature.ts`.

Server source: <https://github.com/mind-vault-1/mindvault/blob/main/server/src/middleware/requestSignatureAuth.ts>

CORS allow-list: `Content-Type`, `Authorization`, `x-api-key`, `x-timestamp`,
`x-signature`, `Idempotency-Key`, `x-request-id`, `PAYMENT-SIGNATURE`, `X-Payment`.
Exposed headers additionally include `PAYMENT-REQUIRED`, `PAYMENT-RESPONSE`,
`X-PAYMENT-RESPONSE`, `X-Payment-Id`, `X-Payment-Amount`, `X-Payment-Recipient`.
Source: <https://github.com/mind-vault-1/mindvault/blob/main/server/src/cors.ts>

## Public endpoints

| Endpoint | Auth | Request | Response / headers | Errors | Server source |
| --- | --- | --- | --- | --- | --- |
| `GET /health` | none | – | JSON health status. Mobile never throws; maps failure to `down`. | network/5xx → `down` | [health.ts](https://github.com/mind-vault-1/mindvault/blob/main/server/src/routes/health.ts) |
| `GET /resources` | none | Query: `search`, `verificationStatus`, `resourceType`, `owner`, `sort`, `minPrice`, `maxPrice`, `limit`, `offset` | Resource array or `{ items, total, nextOffset }`; pagination headers | 400 invalid query; network/5xx | [resources.ts](https://github.com/mind-vault-1/mindvault/blob/main/server/src/routes/resources.ts) |
| `GET /resources/:id/meta` | none | – | Public resource metadata JSON | 404 `Resource not found.` | [resources.ts](https://github.com/mind-vault-1/mindvault/blob/main/server/src/routes/resources.ts) |
| `GET /registry/status` | none | – | On-chain registry status JSON | network/5xx | [registry.ts](https://github.com/mind-vault-1/mindvault/blob/main/server/src/routes/registry.ts) |
| `GET /resources/:id` | none initially; x402 on 402 | Access URL from the resource record | 200 JSON link receipt or binary file; `PAYMENT-RESPONSE`, `X-Payment-*` | 402 challenge; 404 missing; 409 conflict; 503/500 upstream | [resources.ts](https://github.com/mind-vault-1/mindvault/blob/main/server/src/routes/resources.ts), [dynamicPaywall.ts](https://github.com/mind-vault-1/mindvault/blob/main/server/src/middleware/dynamicPaywall.ts) |
| Retry `GET accessUrl` | `PAYMENT-SIGNATURE` | Base64 x402 payload with signed transaction | Same as 200 above; `PAYMENT-RESPONSE` best effort | 402 payment rejected: `The payment was not accepted. Check your USDC balance and try again.` | [dynamicPaywall.ts](https://github.com/mind-vault-1/mindvault/blob/main/server/src/middleware/dynamicPaywall.ts) |
| `GET /payments/:id/receipt` | none | – | Normalized receipt: `id`, `resourceId`, `resourceTitle`, `amount`, `asset`, `network`, `txHash`, `payer`, `paidAt`, `verified`, optional `verificationDetails`. `resourceTitle: null` is normalized to `""`. | 404; malformed body → `The server returned an unexpected response.` | [payments.ts](https://github.com/mind-vault-1/mindvault/blob/main/server/src/routes/payments.ts) |
| `GET /buyers/:address/payments` | none | `limit`, `offset` | Payment array; mobile derives `nextOffset` and fills missing `txHash`, `network`, `resourceTitle` | 400; network/5xx | [payments.ts](https://github.com/mind-vault-1/mindvault/blob/main/server/src/routes/payments.ts) |
| `GET /resources/:id/verification` | none | – | `{ resourceId, title, status, listed, publishedAt, verification }` | 404; malformed body → unexpected response | [resources.ts](https://github.com/mind-vault-1/mindvault/blob/main/server/src/routes/resources.ts) |
| `GET /resources/:id/lease/status` | none | `holder` address | Active lease or empty state. Mobile treats any error as no active lease. | 404/network → no lease | [planned lease route](https://github.com/mind-vault-1/mindvault/tree/main/server/src/routes) |
| `GET /resources/:id/lease/quote` | none | `tier` | `LeaseQuote` with atomic USDC `price` | 400 invalid tier; 404 | [planned lease route](https://github.com/mind-vault-1/mindvault/tree/main/server/src/routes) |
| `GET /receipts` | none | `limit`, `cursor` | `{ receipts, nextCursor }`; page limit 50 | 5xx throws; other failures empty | [planned receipts route](https://github.com/mind-vault-1/mindvault/tree/main/server/src/routes) |
| `POST /publishers/:id/tip` | public x402 initiation | `{ amount, resourceId?, note? }` | 200 tip intent or 402 with `PAYMENT-REQUIRED` | 402; non-OK generic error | [planned tips route](https://github.com/mind-vault-1/mindvault/tree/main/server/src/routes) |
| `POST /tips/verify` | `PAYMENT-SIGNATURE` | `{ challenge, note? }` | `TipReceipt` JSON | 402/400; non-OK generic error | [planned tips route](https://github.com/mind-vault-1/mindvault/tree/main/server/src/routes) |

## Publisher endpoints

| Endpoint | Auth | Request | Response / headers | Errors | Server source |
| --- | --- | --- | --- | --- | --- |
| `POST /publishers` | none | `{ name, email, walletAddress }` | 201 `PublisherProfile` with one-time `apiKey` | 409 `Email already registered`; 400 validation | [publishers.ts](https://github.com/mind-vault-1/mindvault/blob/main/server/src/routes/publishers.ts) |
| `GET /publishers/me` | `x-api-key` | – | `PublisherProfile` | 401 `Unauthorized: Invalid API key` | [publishers.ts](https://github.com/mind-vault-1/mindvault/blob/main/server/src/routes/publishers.ts) |
| `GET /publishers/me/resources` | `x-api-key` | `search` | Resource array | 401/403 | [publishers.ts](https://github.com/mind-vault-1/mindvault/blob/main/server/src/routes/publishers.ts) |
| `GET /publishers/me/analytics` | `x-api-key` | – | `{ summary, resources }`; numeric counts, decimal `totalEarned` strings | 401 | [publishers.ts](https://github.com/mind-vault-1/mindvault/blob/main/server/src/routes/publishers.ts) |
| `GET /publishers/wallet/:address` | none | – | `PublisherProfile`; 404 means no publisher | 404 | [publishers.ts](https://github.com/mind-vault-1/mindvault/blob/main/server/src/routes/publishers.ts) |
| `GET /publishers/leaderboard` | none | – | `LeaderboardEntry[]` | network/5xx | [publishers.ts](https://github.com/mind-vault-1/mindvault/blob/main/server/src/routes/publishers.ts) |
| `POST /resources` | `x-api-key` + HMAC; optional `Idempotency-Key` | JSON link body or multipart file body | 201 Resource | 402 x402 verification fee; 403 `Forbidden: Access denied` | [resources.ts](https://github.com/mind-vault-1/mindvault/blob/main/server/src/routes/resources.ts) |
| `GET /resources/:id` publish status | `x-api-key` | – | Publish status mapped by client | 402 from paywall route; 403 | [resources.ts](https://github.com/mind-vault-1/mindvault/blob/main/server/src/routes/resources.ts) |
| `POST /resources/:id/price/prepare` | `x-api-key` + HMAC | `{ price }` | `PreparedTransaction` | 400/403 | [resources.ts](https://github.com/mind-vault-1/mindvault/blob/main/server/src/routes/resources.ts) |
| `POST /resources/:id/price` | `x-api-key` + HMAC | `{ signedXdr, price }` | `{ id, price, status }` | 400/403 | [resources.ts](https://github.com/mind-vault-1/mindvault/blob/main/server/src/routes/resources.ts) |
| `GET /resources/:id/register/prepare` | `x-api-key` | – | `PreparedTransaction` (client contract) | 400/403 | [resources.ts](https://github.com/mind-vault-1/mindvault/blob/main/server/src/routes/resources.ts) |
| `POST /resources/:id/register` | `x-api-key` + HMAC | `{ signedXdr }` | `{ txHash }` | 400/403 | [resources.ts](https://github.com/mind-vault-1/mindvault/blob/main/server/src/routes/resources.ts) |
| `POST /resources/:id/ownership/prepare` | `x-api-key` + HMAC | `{ newCreator }` | `PreparedTransaction` | 400/403 | [resources.ts](https://github.com/mind-vault-1/mindvault/blob/main/server/src/routes/resources.ts) |
| `POST /resources/:id/ownership` | `x-api-key` + HMAC | `{ signedXdr, newCreator }` | `{ id, newCreator, status, txHash? }` | 400/403 | [resources.ts](https://github.com/mind-vault-1/mindvault/blob/main/server/src/routes/resources.ts) |
| `DELETE /resources/:id` | `x-api-key` + HMAC | – | Delisted resource | 403/404 | [resources.ts](https://github.com/mind-vault-1/mindvault/blob/main/server/src/routes/resources.ts) |
| `POST /publishers/me/api-key/rotate` | `x-api-key` + HMAC | – | `{ apiKey }`; mobile stores only after validation | 401; malformed body → `Server did not return a new API key.` | [planned publisher route](https://github.com/mind-vault-1/mindvault/tree/main/server/src/routes) |
| `DELETE /publishers/me/api-key` | `x-api-key` + HMAC | – | 204; client clears local key | 401/404 treated as locally revoked | [planned publisher route](https://github.com/mind-vault-1/mindvault/tree/main/server/src/routes) |

## External Stellar endpoints

These are not MindVault API routes but are used by the mobile client directly:

| Endpoint | Used for | Source |
| --- | --- | --- |
| `GET {horizonUrl}/accounts/:publicKey` | USDC trustline and balance preflight | `src/api/horizon.ts` |
| Friendbot `GET {friendbotUrl}?addr=` | Testnet account funding | `src/api/horizon.ts` |
| Soroban RPC `getLatestLedger`, `simulateTransaction`, `sendTransaction` | Payment and lease transactions | `src/api/payment.ts`, `src/api/leases.ts` |
| SEP-7 `stellar:` deep links and callbacks | External wallet signing | `src/utils/sep7.ts` |

## Compatibility and differences from older versions

- Older clients treated `/resources`, leaderboard, and saved-search responses as
  always arrays. Current clients accept both bare arrays and envelope objects,
  and validate each row before rendering.
- The server's `/resources/:id/register/prepare` no longer prepares an XDR; it
  delists. Mobile still expects a prepared XDR, so this route must be aligned
  before mainnet release.
- The price-prepare schema requires `price`, while the server handler reads
  `newPrice`. The client sends `price`; this mismatch is documented here and
  must be fixed server-side.
- Receipt and buyer-payment rows from older server versions omit `txHash`,
  `network`, and `resourceTitle`. Current mobile normalizes missing values, but
  strict receipt validation requires the full normalized shape.
- Tips, lease status/quote, receipt sync, API-key rotate, and API-key revoke are
  client contracts that are not yet present on the server `main` branch. They
  are marked as planned above and must be implemented before those screens are
  advertised as production-ready.
- The server OpenAPI document currently covers only a subset of these routes;
  this file is authoritative for the mobile contract until OpenAPI catches up.

## Verification checklist

- [ ] Method, path, auth, request, response, errors, and headers match the code.
- [ ] Pagination works for arrays and envelopes.
- [ ] 402 challenges include a valid `PAYMENT-REQUIRED` header and signed retries
      are never replayed.
- [ ] HMAC canonical string matches `src/utils/requestSignature.ts`.
- [ ] Publisher API keys are redacted from errors and logs.
- [ ] New response fields are additive; breaking changes are versioned.
