# OTA releases: staged rollout and rollback

Production over-the-air (OTA) updates ship through the **OTA rollout** workflow
(`.github/workflows/ota.yml`), never from a laptop. The workflow releases to
10% of production users, then 50%, then everyone, with a reviewer approving
each stage and a server health check after the first two.

What can ship as an OTA update, and the one-time EAS link, are in
[UPDATES.md](UPDATES.md). Store builds and versioning are in
[RELEASE.md](RELEASE.md).

## Channels

A build only receives updates published to its own channel. The channels come
from the build profiles in `eas.json`.

| Channel | Builds | Who has them | How updates are published |
| --- | --- | --- | --- |
| `development` | `development` profile (dev client) | Developers | By hand: `npx eas-cli update --channel development` |
| `preview` | `preview` profile (APK / simulator) | Testers, PR preview builds | By hand: `npx eas-cli update --channel preview` |
| `production` | `production` profile (store) | Store users | Only through the OTA rollout workflow |

The canary is not a separate channel. It is an EAS Update
[percentage rollout](https://docs.expo.dev/eas-update/rollouts/) on
`production`. Devices inside the rollout get the new update. The rest keep the
previous update on the channel's branch.

`eas update` does not read the `env` of build profiles, so the workflow exports
`build.production.env` from `eas.json` before it bundles. The update then
points at the same API and Stellar network as the production builds.

## Releasing an update

1. Merge the change to `main` and wait for CI to pass. Try it on the `preview`
   channel first (see [UPDATES.md](UPDATES.md#publishing-an-update)).
2. In GitHub, open **Actions → OTA rollout → Run workflow**. Pick `main` and
   enter the update message, for example `fix: catalog price filter`.
3. **preflight** stops the run unless the `ota-production` environment has
   required reviewers.
4. **canary** waits for approval. It then checks the server, publishes the
   update to **10%** of `production`, and watches the server for 15 minutes.
5. **promote-50** waits for approval. It then raises the rollout to **50%** and
   watches the server for another 15 minutes.
6. **promote-100** waits for approval. It then raises the rollout to **100%**,
   which finishes the rollout.

Approve or reject each stage from the run page (**Review deployments**). Every
job that changes what production users get runs on the `ota-production`
environment, so none of them can start, or read `EXPO_TOKEN`, without a
reviewer's approval.

Users get an update on their second launch after it reaches them: the first
launch downloads it.

## Health check

The workflow judges the rollout from the API server that production builds use
(`EXPO_PUBLIC_API_URL` in the `production` profile).

- **Before publishing:** `GET /health/ready` must return 200 and `GET /metrics`
  must be readable with `METRICS_TOKEN`. If either fails, nothing is published.
- **During each watch** (`HEALTH_WATCH_MINUTES`, 15 by default):
  `/health/ready` is probed every minute, and any failure stops the watch.
- **At the end of each watch,** the workflow compares two samples of the
  server's `http_request_duration_seconds_count` metric, taken at the start and
  the end of the window. If more than `MAX_5XX_PERCENT` (2% by default) of the
  requests in the window returned a 5xx status, that counts as an error spike.
  A counter that goes backwards (a server restart) also fails, because the
  window can't be judged.

When the watch fails, the job runs `eas update:revert-update-rollout` for the
rollout's update group, and later stages never run. The revert deletes the
rollout and republishes the update that users outside the rollout already had.
If there was no earlier update on the branch, it publishes a roll back to the
build's embedded bundle instead.

Limits to keep in mind:

- The signal comes from the server only. The app has no crash reporting, so a
  client-side crash that never reaches the API is not detected. Check the
  stores' crash reports before approving the next stage.
- With little traffic, a few 5xx responses can cross the threshold. A false
  alarm reverts a good update, which is the safe direction. Re-run the
  workflow after you check the server.
- The thresholds are the `env` block at the top of `ota.yml`.

## Rolling back

Rollbacks, like updates, reach users on their next launch after the download.
Run these commands from a checkout of `main`, using eas-cli 16.14 or later (the
workflow pins 16.32.0):

```sh
npx eas-cli@16.32.0 login
npx eas-cli@16.32.0 update:list --branch production   # find the update group IDs
```

**Rollout still at 10% or 50%.** This covers a problem found while watching,
or a stage you rejected. Revert the rollout:

```sh
npx eas-cli@16.32.0 update:revert-update-rollout --group <rollout-group-id> \
  --message "Revert: <reason>"
```

A rejected or expired approval leaves the rollout at its current percentage.
EAS allows only one rollout at a time per branch, platform and runtime version,
so revert it (or finish it with `update:edit --rollout-percentage 100`) before
the next release.

**Rollout finished (100%).** Republish the last known-good update group:

```sh
npx eas-cli@16.32.0 update:republish --group <known-good-group-id> \
  --message "Roll back to <group>"
```

If no earlier update is safe, roll the channel back to the bundle embedded in
the store build:

```sh
npx eas-cli@16.32.0 update:roll-back-to-embedded --channel production \
  --message "Roll back to embedded"
```

After any rollback, confirm the fix on one iOS and one Android device (see
[RUNBOOK.md](RUNBOOK.md#ota-channels)). Then fix the problem on `main` with a
normal PR and release again through the workflow.

## One-time setup (maintainer)

1. Link the project to EAS Update and make production builds, as described in
   [UPDATES.md](UPDATES.md#one-time-setup-maintainer).
2. Replace the placeholder `EXPO_PUBLIC_API_URL` in the `production` profile of
   `eas.json` with the real API URL. Until it resolves, the pre-publish check
   fails and nothing is published.
3. Under **Settings → Environments**, create `ota-production`:
   - **Required reviewers:** at least one maintainer. Turn on **Prevent
     self-review** so the person who starts the run can't approve it.
   - **Deployment branches:** `main` only.
   - **Environment secrets:**
     - `EXPO_TOKEN`: an EAS access token allowed to publish updates.
     - `METRICS_TOKEN`: the same value as the API server's `METRICS_TOKEN`. The
       server disables `/metrics` when this is unset.
