# Payments

Paywalled resources are unlocked over [x402](https://www.x402.org/). The app
talks to the API directly; there is no payment backend of its own.

## The flow

Everything lives in [`src/api/payment.ts`](../src/api/payment.ts).

1. **Request the resource.** `prepareResourceAccess(url, displayedPrice, payerPublicKey)`
   does a plain `GET` on the resource URL.
2. **HTTP 200.** Nothing is paywalled — the response is returned as an
   `AccessResult` (`text` for text/JSON, `external` for anything else).
3. **HTTP 402.** The body is an x402 challenge:

   ```json
   {
     "x402Version": 1,
     "accepts": [
       {
         "scheme": "exact",
         "network": "stellar:testnet",
         "maxAmountRequired": "10000000",
         "payTo": "GBHEGW3KWOY2OFH767EDALFGCUTBOEVBDQMCKU4APMDLQNBW5QV3W3KO",
         "asset": "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
         "maxTimeoutSeconds": 60
       }
     ]
   }
   ```

   `parsePaymentChallenge` picks the `exact` option for the app's own network,
   then `buildUnsignedPaymentTransaction` builds an unsigned Soroban
   `transfer(from, to, amount)` call on the USDC token contract.
4. **Sign.** [`PaywallModal`](../src/components/PaywallModal.tsx) hands the
   unsigned XDR and the network passphrase to the shared
   `SignTransactionSheet`, so payment signing behaves exactly like the other
   on-chain flows.
5. **Retry.** `submitSignedPayment` re-sends the request with the signed
   transaction in a base64 `X-PAYMENT` header and returns the unlocked content.

## Safety rules

A 402 is only ever accepted when all of these hold; otherwise the challenge is
rejected with a message the user can act on:

- The scheme is `exact` and the network matches the app's. `stellar:testnet`
  maps to `testnet`, `stellar:pubnet` to `mainnet` (see `app.config.js`); a
  challenge on another network is never signed.
- `maxAmountRequired` is a whole number of atomic token units (USDC has 7
  decimals) and is not **greater** than the price shown in the paywall. Paying
  less than displayed is fine; paying more is not.
- `payTo`, `asset` and `maxAmountRequired` are all present.

## Following up

Signing and submitting are done with `@stellar/stellar-sdk` directly. The
official `@x402/stellar` client package would replace the hand-rolled
challenge parsing and the `X-PAYMENT` payload, but it is a separate change.
