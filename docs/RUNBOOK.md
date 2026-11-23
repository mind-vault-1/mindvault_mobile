# Operations runbook

This runbook covers response for the MindVault mobile app and its configured
MindVault API. The mobile app does not operate the API, Stellar RPC, or EAS
services; involve the owners of those systems for incidents outside the app.

## First response

1. Record the start time, affected app version/platform, configured API URL,
   network (testnet or mainnet), symptoms, and the first known affected build
   or release. Do not copy API keys, wallet secrets, signed XDR, or payment
   headers into an issue or chat.
2. Check GitHub Actions for the affected commit or release and review the
   `Release` workflow and PR checks. Check API health and provider status using
   the service owner's dashboards.
3. Decide whether this is an app release, API availability, payment/network, or
   credential incident. Assign one incident lead to coordinate updates and
   keep a timestamped record of decisions.
4. If users could lose funds, expose credentials, or sign an unexpected
   transaction, treat the incident as high severity and escalate immediately
   using the private security reporting path in [SECURITY.md](./SECURITY.md).

## Server health and API error spikes

1. Use the configured URL shown in Settings and the app's health check to
   confirm whether the client can reach the API.
2. Ask the API owner for server health, recent deploy history, error-rate
   graphs, and upstream dependency status. Correlate spikes with app releases
   before blaming the client.
3. Capture a representative (redacted) request path, status code, and count of
   affected users. Do not paste tokens, API keys, or wallet data into public
   incident records.
4. If the API is healthy, check client-side retry, offline queue replay, and
   the affected screen's error handling before escalating further.

## OTA channels

1. Record the EAS update channel, runtime version, and release channel of the
   affected build. Verify that the device is on the expected channel.
2. Pause or roll back the OTA update through the release owner's EAS workflow;
   do not publish an untested replacement while triaging.
3. Confirm the rollback on at least one iOS and one Android device before
   resuming the rollout.

## Contacts and escalation

| Area | Contact path | Escalate when |
| --- | --- | --- |
| Mobile app | Maintainer on-call via the repository's issue and PR flow | Regression in a released build |
| API / server health | Service owner through the configured support channel | Health check fails or error rate spikes |
| Stellar / payments | Network/RPC operator through the service owner | Transaction or receipt state is uncertain |
| Security | Private reporting path in [SECURITY.md](./SECURITY.md) | Secrets or funds may be exposed |

Use named roles rather than personal contact details so the runbook stays
usable when people change.

## Mobile app release issue

1. Pause the rollout or store submission. Do not create a replacement release
   until the failure mode and affected build are understood.
2. Compare the failing version with the previous release, including changes to
   API configuration, signing/payment flows, and native dependencies.
3. If the issue is in the app, prepare a small fix on a new branch and use the
   normal PR checks. For an already shipped regression, follow the rollback
   guidance in [RELEASE.md](./RELEASE.md); revert the release commit through a
   PR rather than rewriting `main`.
4. Rebuild and verify the affected platforms before resuming distribution.
   Preview builds are test builds and must use the configured testnet
   environment; do not use production credentials to verify a preview.
5. Record the affected versions, mitigation, and release/build links in the
   incident record.

## API unavailable or degraded

1. Confirm the configured URL and reported health status in Settings. Determine
   whether the issue affects one custom API URL or the shared API.
2. Ask the API owner to check service health, recent deploys, logs, database
   availability, and upstream dependencies. The mobile app's diagnostics may
   help identify client version and connectivity, but must be reviewed for
   sensitive information before sharing.
3. Tell users that catalog browsing or publisher actions may be unavailable.
   Queued offline mutations are replayed when connectivity returns; do not
   instruct a user to repeat a publisher action until its state is confirmed.
4. After the API owner restores service, refresh the affected screen and confirm
   that pending actions have either completed or report an actionable error.

## Stellar / payment incident

1. Stop the affected transaction or payment flow. Do not ask users to retry a
   payment when the server response or receipt state is uncertain.
2. Confirm the configured network and network passphrase. Check the API,
   Horizon/RPC, and contract status with their operators.
3. Reconcile the transaction on the appropriate network using its public
   transaction hash. Never request or transmit a user's secret key.
4. Resume only after the transaction outcome and server-side resource/receipt
   state are understood. Document the network, transaction hash, and result;
   never include signed payloads or credentials.

## Recovery and closure

- Confirm service health and the user-visible workflow, not only a green
  infrastructure check.
- Notify affected users when the impact is material and send a final update
  when the incident is resolved.
- Record impact, timeline, root cause, mitigation, follow-up owner, and
  prevention work in a post-incident review. Link the review to relevant PRs or
  issues without including secrets.
