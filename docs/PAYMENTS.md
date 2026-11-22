# Payments (x402)

Paid resources are served behind the backend's x402 paywall:
`@x402/express` with the `@x402/stellar` **exact** scheme, protocol **v2**,
paid in Stellar USDC. The app's client lives in `src/api/payment.ts` and mirrors
`ExactStellarScheme` from `@x402/stellar/exact/client`.

## Flow

1. **Request.** `GET` the resource. A `200` is returned as-is (free or already
   paid content).
2. **Challenge.** A `402` carries a base64 JSON `PaymentRequired` in the
   `PAYMENT-REQUIRED` response header:
   `{ x402Version: 2, resource, accepts: [{ scheme, network, asset, amount, payTo, maxTimeoutSeconds, extra }] }`.
   `parsePaymentRequired` picks the `exact` option on the app's network
   (`stellar:testnet` or `stellar:pubnet`) and refuses:
   - other schemes or networks
   - an asset that isn't a contract (`C…`) or a `payTo` that isn't an account (`G…`)
   - `extra.areFeesSponsored !== true` (the scheme requires the facilitator to pay fees)
   - an `amount` (USDC base units, 7 decimals) above the price the user was shown
3. **Sign.** The user enters their secret in the shared `SignTransactionSheet`,
   which calls `signPaymentTransaction` for this one operation. It:
   - builds the USDC contract `transfer(payer, payTo, amount)` with
     `contract.AssembledTransaction` and simulates it through Soroban RPC
   - checks the payer is the only account whose authorization is needed
   - signs **only the payer's authorization entry**, valid until
     `latestLedger + ceil(maxTimeoutSeconds / 5)`
   - re-simulates and returns the transaction XDR

   The secret never leaves the sheet and is cleared after the call.
4. **Pay.** Retry the request with a `PAYMENT-SIGNATURE` header: base64 JSON
   `{ x402Version, payload: { transaction }, extensions, resource, accepted }`.
   `accepted` is the requirement object exactly as the server sent it, because
   the server matches it by deep equality. The facilitator verifies, adds fees,
   submits and settles, then the server returns the content.

## Configuration

- The network comes from `app.json` `extra.network` (`testnet` or `mainnet`).
- Testnet uses `https://soroban-testnet.stellar.org`. Mainnet needs a Soroban RPC
  provider; set it via `sorobanRpcUrl()` once a provider is chosen (see the
  [RPC provider list](https://developers.stellar.org/docs/data/apis/rpc/providers)).
- The payer needs a USDC trustline and balance. Without one, simulation fails with
  the USDC contract's `Error(Contract, #13)` (trustline missing), which the sheet shows.

## Testing

`src/api/payment.test.ts` covers challenge parsing and every rejection, the
`PAYMENT-SIGNATURE` encoding, the 200, 402 and retry paths, and auth-entry
signing with Soroban RPC mocked. The header format was also checked against
`@x402/core` 2.9's own decoder and the server's requirement matching, and the
build/simulate path was run against Soroban testnet's USDC contract.

## Follow-ups

- Replace this hand-written client with the `@x402/stellar` client package once it
  can be added (it needs a newer `@stellar/stellar-sdk` than the app's 12.x).
- Wallet signing (WalletConnect / SEP-43) instead of entering a secret.
