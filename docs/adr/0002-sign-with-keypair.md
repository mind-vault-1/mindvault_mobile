# ADR 0002: Sign Payments with Stellar Keypair

**Status:** Accepted  
**Date:** 2026-11-20  
**Author(s):** DeborahOlaboye

## Context

MindVault Mobile needs to sign Stellar transactions for payments. Users can:

1. Use an external wallet (WalletConnect v2 for production)
2. Use an in-app signer for development/testing

The in-app signer must securely handle signing without exposing or storing secret keys in an unsafe manner.

## Decision

Payments are signed **in-memory** using the Stellar Keypair from `@stellar/stellar-sdk`. Secrets are:
- Accepted from user input (temporary, in-memory only)
- Never persisted to disk
- Cleared immediately after signing or on cancellation

For production signing, **WalletConnect v2** is the recommended approach; the in-app signer is for development only.

## Rationale

### Pros
- **Secure by default:** Secrets never touch disk or are logged.
- **Clear intent:** The signing sheet explicitly shows what's being signed.
- **Testable:** Development and testing are straightforward without wallet setup.
- **Reversible:** WalletConnect can be swapped in without changing this layer.

### Cons
- **User friction:** Requires users to paste secret keys during development.
- **Not production-ready:** In-app signer is dev-only; real users need external wallets.

### Alternatives Considered
- **SEP-0007 (Deep Linking):** Easier UX but disjointed flow (user leaves app).
- **Persistent secrets:** Easier development but severe security risk.

## Consequences

1. **Signing only in memory:** `src/api/payment.ts` creates a local `Keypair` and signs, then discards it.
2. **SignTransactionSheet shows warnings:** For test/dev networks, explicit warnings are displayed.
3. **No secrets in logs or storage:** Code reviews must verify this is enforced.
4. **WalletConnect planned:** Production signing must redirect to external wallets.

## Related Issues & PRs

- See [SIGNING_STRATEGY.md](../SIGNING_STRATEGY.md) for detailed flow diagrams.
- Issue #287: Audit log for sensitive account actions (enforces no-log guarantee).

## See Also

- [ADR 0001: Record Architecture Decisions](0001-record-architecture.md)
- [ADR 0003: Store Sensitive Data with Expo Secure Store](0003-use-async-storage.md)
