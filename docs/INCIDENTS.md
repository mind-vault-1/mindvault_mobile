# Incident response

Use this process for production-impacting outages, unsafe releases, payment
problems, and suspected credential exposure affecting MindVault Mobile.

## Severity and escalation

| Severity | Examples | Response |
| --- | --- | --- |
| Critical | Suspected secret exposure, unauthorized signing/payment, or broad loss of access to funds | Stop the affected flow, alert the maintainers and relevant service/security owners immediately, and use GitHub's private vulnerability reporting path for security issues. |
| High | Production release blocks a core workflow, API outage affecting most users, or payment outcomes cannot be reconciled | Assign an incident lead, engage the API/network owner, and post regular status updates until mitigation. |
| Moderate | A platform-specific regression or degraded non-critical feature with a workaround | Track an owner and workaround in an issue; provide updates as the fix progresses. |
| Low | Limited cosmetic or non-user-impacting problem | Add it to the normal backlog with reproduction details. |

When uncertain, use the higher severity until impact is understood. Do not put
secrets, wallet keys, API keys, signed transaction payloads, or payment headers
in public issues, pull requests, screenshots, or chat messages.

## Response steps

1. **Triage:** Capture first observed time, app version/build, platform,
   configured API URL, affected network, reproduction steps, and known impact.
   Use redacted logs and public transaction hashes only.
2. **Contain:** Stop a risky release or pause the affected app flow. For a
   payment with unknown outcome, do not retry until its transaction and receipt
   state have been reconciled.
3. **Coordinate:** Name an incident lead and a technical owner. Keep a
   timestamped timeline of findings, decisions, mitigations, and user updates.
4. **Mitigate:** Restore the last known-good service or app version when safe.
   Use the rollback process in [RELEASE.md](./RELEASE.md); changes to `main`
   must go through a revert PR.
5. **Verify:** Confirm the affected user journey on the impacted platform and
   network. Confirm recovery with the service owner when an external API,
   payment processor, Stellar RPC, or EAS service was involved.
6. **Communicate:** Tell affected users what is unavailable, the safe
   workaround (if any), and when the next update will be provided. Avoid
   promising recovery before it has been verified.
7. **Review:** Record scope, root cause, resolution, and prevention actions.
   Assign follow-up owners and link the post-incident work to relevant issues.

## Credential or transaction safety

- If a wallet secret, publisher API key, or signing credential may be exposed,
  use the private security reporting path in [SECURITY.md](./SECURITY.md) and
  involve the credential owner to revoke or rotate it. Do not investigate by
  copying the secret into logs or a public report.
- If an API key is exposed, revoke it on the server and replace it through the
  publisher's secure account flow. Verify that the old key no longer works.
- If a transaction was signed or submitted unexpectedly, stop further signing
  and reconcile its public transaction hash with the relevant network operator.
  Do not publish the signed XDR or ask the user to disclose their secret.
- Preserve relevant CI and server logs according to the service owner's
  retention policy, with credentials and sensitive payloads redacted.

## Incident record

Maintain a private record containing:

- Incident lead, responders, severity, and start/resolution timestamps.
- Affected app versions, platforms, API service, and network.
- User impact, timeline, mitigation, recovery verification, and communications.
- Root cause, follow-up action owners, and linked issues/PRs.

Do not include credentials or personally identifying information that is not
needed for the response.

## Tabletop exercise — catalog API outage (first entry)

| Field | Record |
| --- | --- |
| Impact | Simulated API outage blocks catalog refresh and publisher actions for all mobile users. |
| Timeline | T+0 alert raised; T+4 incident lead assigned; T+9 service owner engaged; T+18 cached catalog confirmed read-only; T+25 service restored; T+31 user-visible flows verified. |
| Root cause | Exercise scenario: API dependency unavailable after a bad deploy. No production defect. |
| Follow-ups | Add health-check dashboard link to the runbook; rehearse rollback communication; verify offline queue replay in the next release. |

Outcome: the escalation path and redaction rules were clear; the biggest gap
was locating the service owner's health dashboard quickly.
