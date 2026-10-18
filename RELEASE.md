# Release automation

Releases are automated by [release-please](https://github.com/googleapis/release-please), driven by [Conventional Commits](https://www.conventionalcommits.org/). There is no manual version bumping or changelog editing.

## How it works

1. Every push to `main` runs the `Release` workflow (`.github/workflows/release.yml`).
2. release-please opens or updates a single "release PR" titled `chore(main): release <next-version>`. That PR:
   - Bumps `version` in `package.json`.
   - Bumps `expo.version` in `app.json`.
   - Updates `CHANGELOG.md` with grouped entries from conventional commits since the last release.
3. Merging the release PR creates a GitHub Release, a `v<version>` tag, and commits the versioned changes to `main`.

## Required conventions

- Commit titles must follow Conventional Commits: `feat:`, `fix:`, `chore:`, `docs:`, `ci:`, `refactor:`, `test:`, `perf:`, `build:`. Scopes are optional, e.g. `feat(catalog): paginate with infinite scroll`.
- Only commits merged to `main` are considered. Commits on feature branches that get squash-merged carry their title through, so keep PR titles conventional.

## Configuration

- `release-please-config.json` at the repo root sets `release-type: node`, bumps `app.json` alongside `package.json`, and disables component-in-tag (single-package repo).
- The workflow uses only the default `GITHUB_TOKEN`. No extra secrets are required.
- `bootstrap-sha` in the workflow pins the first commit release-please starts tracking from, so only new conventional commits from that point produce a release.

## Dry run

To verify the release flow without cutting a real release:

```sh
npx release-please release --repo-url=https://github.com/mind-vault-1/mindvault_mobile \
  --config-file=release-please-config.json \
  --manifest-file=.release-please-manifest.json \
  --dry-run
```

`--dry-run` prints the release PR diff and the candidate version without opening a PR or creating a release. Run it from a clean checkout of `main`.

## Rollback

A release is a GitHub Release plus a git tag, not a store deployment, so rollback is simply reverting the merge commit on `main`:

```sh
git revert -m 1 <merge-commit-sha>
git push origin main
```

The reverted version's tag remains for reference. Store builds are still managed with EAS as described in `docs/RELEASE.md`.
