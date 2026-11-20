# ADR 0004: Use Stellar SDK for Payment Processing

**Status:** Accepted  
**Date:** 2026-11-20  
**Author(s):** DeborahOlaboye

## Context

MindVault Mobile integrates Stellar payments using the x402 v2 payment protocol. The app must:
- Parse payment requirements from HTTP headers
- Build and sign Stellar transactions
- Submit payments to the Stellar network
- Handle payment failures and retries

We need a robust, well-maintained library for Stellar operations.

## Decision

Use **@stellar/stellar-sdk** for all Stellar operations (transaction building, signing, network submission).

## Rationale

### Pros
- **Official library:** Maintained by Stellar Development Foundation; industry standard.
- **Full-featured:** Covers all Stellar operations (payments, assets, contracts, Soroban).
- **Active development:** Security patches and new features are released regularly.
- **Well-documented:** Official docs and many community examples.
- **Type-safe:** Written in TypeScript; full type coverage for IDE support.

### Cons
- **Large bundle size:** Adds ~300KB to the app (acceptable for financial app).
- **Steep learning curve:** Stellar operations are complex; requires study.
- **Breaking changes:** Major versions can require code updates.

### Alternatives Considered
- **TinySDK:** Lightweight but abandoned; no Soroban support.
- **Custom transaction builder:** Reinventing serialization and validation.
- **Hardcoded XDR:** Inflexible; hard to maintain when spec changes.

## Consequences

1. **Payment client in `src/api/payment.ts`** wraps the Stellar SDK with app-specific logic.
2. **Transaction building isolated** in a single module; changes are localized.
3. **Network selection centralized** in `DEFAULT_NETWORK_PASSPHRASE` and `DEFAULT_STELLAR_NETWORK`.
4. **RPC endpoint managed** via `DEFAULT_TESTNET_RPC_URL` for Soroban operations.
5. **SDK upgrades tracked** in `package.json`; breaking changes reviewed in code review.

## Related Issues & PRs

- See [docs/PAYMENTS.md](../PAYMENTS.md) for payment flow and fee handling.

## See Also

- [ADR 0002: Sign Payments with Stellar Keypair](0002-sign-with-keypair.md)
- [Stellar SDK documentation](https://developers.stellar.org/docs/learn/stellar-basics)
- [x402 Payment Protocol](https://github.com/x402-io/spec)
