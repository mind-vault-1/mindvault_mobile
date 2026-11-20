# Architecture Decision Records

An **Architecture Decision Record (ADR)** is a document that records an important architectural decision made during development. Each ADR captures the context, decision, and consequences of that choice so future contributors understand the **why**, not just the **what**.

## When to Write an ADR

Write an ADR when you make a decision that:
- Affects **multiple parts of the codebase** or multiple teams.
- Is **hard to reverse** or costly to change later.
- Has **trade-offs** worth documenting (performance vs. complexity, etc.).
- Answers a question that might **recur in the future** (e.g., "why do we use Expo instead of bare React Native?").

## How to Write an ADR

1. Create a new file in `docs/adr/` named `NNNN-<short-title>.md`, where `NNNN` is the next sequential number.
2. Follow the [ADR template](#template) below.
3. Keep it **concise** (typically 1–2 pages).
4. Use clear, **present-tense language**.
5. Include a **status** field (Accepted, Superseded, Deprecated).

### Template

```markdown
# ADR NNNN: <Title of the Decision>

**Status:** Accepted | Proposed | Superseded | Deprecated  
**Date:** YYYY-MM-DD  
**Author(s):** [Name or GitHub username]

## Context

What was the problem or question? What was the status quo?

## Decision

What did we choose to do, and why? Keep this brief—the rationale goes in the next section.

## Rationale

Why is this the best choice? What trade-offs did we consider?

- **Pros:** Benefits of this approach.
- **Cons:** Downsides or limitations.
- **Alternatives considered:** Other options and why they were rejected.

## Consequences

What are the downstream effects? What becomes easier, harder, or clearer?

## Related Issues & PRs

Links to GitHub issues or PRs that implement or discuss this decision.

## See Also

Links to related ADRs or documentation.
```

## Index

| # | Title | Status | Date |
|---|-------|--------|------|
| [0001](0001-record-architecture.md) | Record Architecture Decisions | Accepted | 2026-11-20 |
| [0002](0002-sign-with-keypair.md) | Sign Payments with Stellar Keypair | Accepted | 2026-11-20 |
| [0003](0003-use-async-storage.md) | Store Sensitive Data with Expo Secure Store | Accepted | 2026-11-20 |
| [0004](0004-stellar-payment-client.md) | Use Stellar SDK for Payment Processing | Accepted | 2026-11-20 |
| [0005](0005-system-theme-default.md) | Follow System Theme by Default | Accepted | 2026-11-20 |
| [0006](0006-queue-mutations-offline.md) | Queue Mutations When Offline | Accepted | 2026-11-20 |

---

## Updating ADRs

If a decision changes, **do not delete** the old ADR. Instead:

1. Update the **Status** to `Superseded`.
2. Add a "**Superseded by**" section linking to the new ADR.
3. Create a new ADR with the updated decision and reference the superseded one.

This keeps the history intact, so future contributors can see what changed and why.

## Contributing

When you open a PR that affects architecture:

1. Include an ADR if the change is significant.
2. Link the ADR in your PR description.
3. ADRs are reviewed alongside code—expect discussion.
