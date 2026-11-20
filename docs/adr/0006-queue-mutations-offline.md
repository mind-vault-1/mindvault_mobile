# ADR 0006: Queue Mutations When Offline

**Status:** Accepted  
**Date:** 2026-11-20  
**Author(s):** DeborahOlaboye

## Context

MindVault Mobile is used in regions with spotty connectivity. If a user is in the subway (no connection) and tries to save a search or publish a resource, the mutation fails silently, and the user loses their work.

We need a way to:
- Queue mutations when offline
- Retry when connection is restored
- Show clear status to the user (pending, failed, retrying)
- Survive app crashes and restarts

## Decision

Mutations are **queued in persistent storage** when the device is offline. When connectivity is restored, queued mutations are **retried automatically**, with exponential backoff and a maximum retry limit.

## Rationale

### Pros
- **User never loses work:** Mutations are replayed when online.
- **Transparent:** User sees "pending" status; no surprise failures.
- **Resilient:** Survives app crashes; queue survives across sessions.
- **Familiar pattern:** Gmail, Slack, and other apps do this.

### Cons
- **Complexity:** Offline-first logic is non-trivial; more code to maintain.
- **Consistency questions:** What if the backend state changed while offline? (Mitigated by idempotent operations.)
- **Storage overhead:** Each queued mutation takes space in AsyncStorage.

### Alternatives Considered
- **Fail immediately:** Simple but loses work; bad UX.
- **In-memory queue:** Lost on app restart.
- **Backend queue only:** Requires backend changes; not in scope.

## Consequences

1. **Mutation queue managed in `src/services/mutationQueue.ts`**.
2. **Network status monitored** via `@react-native-community/netinfo`.
3. **Mutations marked with `status: 'pending' | 'failed' | 'retrying'`**.
4. **Retry logic with exponential backoff** (1s, 2s, 4s, 8s, then give up).
5. **UI shows mutation status** to the user (spinner, warning, error).
6. **Failed mutations** can be manually retried or discarded.
7. **All mutations must be idempotent** (safe to replay).

## Related Issues & PRs

- Issue #273: Offline mutation queue, receipt sync, secret redaction
- Issue #276: Mutation queue integration

## See Also

- [ADR 0003: Store Sensitive Data with Expo Secure Store](0003-use-async-storage.md) for queue persistence
- [docs/TESTING.md](../TESTING.md) for offline testing strategy
