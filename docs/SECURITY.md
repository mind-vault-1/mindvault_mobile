# Security scanning

`.github/workflows/security.yml` runs on every pull request, weekly (Mondays
08:00 UTC) and on demand.

| Check | When | What fails it |
|---|---|---|
| Dependency review | PRs | A new dependency with a high or critical advisory, or a licence outside the allowlist. Findings are annotated on the PR and summarised in a comment. |
| Secret scan (TruffleHog) | PRs, weekly | A verified, still-live credential in the scanned commits. |
| `npm audit` | PRs, weekly | A high or critical advisory in a production dependency. |
| Licence allowlist | PRs, weekly | A production dependency whose licence is not in `ALLOWED_LICENSES`. |

The weekly run writes the audit and licence results to the run's job summary;
that is the weekly report. Dependabot (`.github/dependabot.yml`) opens update
PRs for npm packages and GitHub Actions every Monday.

## Allowed licences

MIT, ISC, Apache-2.0, BSD-2-Clause, BSD-3-Clause, 0BSD, BlueOak-1.0.0, CC0-1.0,
CC-BY-4.0, Python-2.0, Unlicense. Anything else needs maintainer approval in the
PR that introduces it, and is then added to both lists in `security.yml`.

## Suppressing a false positive

Every suppression needs a line in the table below with a reason and a review date.

- **Advisory:** add the GHSA id to `allow-ghsas` in `security.yml`.
- **Secret:** the scan only fails on verified secrets, so a hit is a live
  credential. Rotate it first; never suppress a real secret. A test fixture
  that verifies must be replaced with a non-working value.
- **Licence:** add the package's licence to the allowlist with the approval link.

| Suppression | Reason | Added | Review by |
|---|---|---|---|
| _none yet_ | | | |

## Response expectations

- **Leaked secret:** rotate within 24 hours, then remove it from history.
- **Critical or high advisory:** a fix or documented suppression within 7 days.
- **Moderate or low:** handled through the normal Dependabot cycle.

Report a vulnerability privately through GitHub's "Report a vulnerability"
button on the repository's Security tab, not in a public issue.
