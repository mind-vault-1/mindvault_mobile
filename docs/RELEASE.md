# Release guide

## Versioning

Versions are managed by [release-please](https://github.com/googleapis/release-please)
from [Conventional Commits](https://www.conventionalcommits.org/); don't bump
versions or edit `CHANGELOG.md` by hand. The production EAS profile uses remote
app-version management and automatically increments the platform build numbers.

1. Every push to `main` runs the `Release` workflow (`.github/workflows/release.yml`).
2. release-please opens or updates one release PR, `chore(main): release <version>`,
   which bumps `version` in `package.json`, `expo.version` in `app.json`, and
   `.release-please-manifest.json`, and adds the grouped entries to `CHANGELOG.md`.
3. Merging the release PR creates the `v<version>` tag and GitHub Release.

Squash-merged PR titles become the commit titles release-please reads, so keep
them conventional: `feat:` bumps the minor version, `fix:` the patch version,
and `feat!:` or a `BREAKING CHANGE:` footer the major version. Configuration
lives in `release-please-config.json`; `bootstrap-sha` is where history starts.

Two things to know:

- The workflow needs *Settings → Actions → General → "Allow GitHub Actions to
  create and approve pull requests"* enabled, or it can't open the release PR.
- PRs opened with `GITHUB_TOKEN` don't trigger other workflows, so the release
  PR's required checks won't start on their own. Close and reopen the PR (or push
  an empty commit to its branch) to run CI before merging.

To roll back a release, revert its merge commit on `main` with a PR. The tag
stays for reference, and store builds are rolled back through EAS (see below).

To preview the next release without opening a PR (needs a GitHub token):

```sh
npx release-please release-pr --dry-run --token="$(gh auth token)" \
  --repo-url=mind-vault-1/mindvault_mobile \
  --config-file=release-please-config.json \
  --manifest-file=.release-please-manifest.json
```

## Build profiles

Install the project dependencies with `npm ci`, then use the EAS CLI:

```sh
npx eas-cli build --profile development --platform ios
npx eas-cli build --profile preview --platform android
npx eas-cli build --profile production --platform all
```

The development profile creates an internal development-client build. Preview
creates an internal distribution, and production creates store builds. The
preview and production API URL values in `eas.json` are placeholders; replace
them with reachable deployment URLs before building. `app.config.js` maps
`EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_NETWORK` from the selected profile into
the runtime `extra` config. `app.json` supplies local-development defaults.
Never put API keys, signing credentials, or other secrets in `eas.json` or
`app.json`.

For a local Android preview build, install and run Docker, configure the Android
SDK, and use:

```sh
npx eas-cli build --profile preview --platform android --local
```

## Store submission

Create App Store Connect and Google Play credentials in EAS or provide them
through the secure local EAS credentials workflow. Do not commit credentials or
upload keys. After a successful production build, submit it with:

```sh
npx eas-cli submit --profile production --platform ios
npx eas-cli submit --profile production --platform android
```

## Safe logging

Use `logError` from `src/utils/errorLogger.ts` for errors. It redacts secret
seeds, API keys, authorization values, XDR, and signature headers before
returning or logging normalized messages. Do not log credentials, request
headers, signed payloads, or raw response bodies. Direct `console.*` calls are
reserved for the safe logger.

## Dynamic type

Keep React Native text scaling enabled. Avoid fixed-height text containers and
line counts that clip enlarged text. Set `lineHeight` in unscaled points: React
Native multiplies it by the system font scale itself, so multiplying by
`fontScale` again would scale it twice. Views do not scale on their own, so
skeleton placeholders use `useWindowDimensions().fontScale` to stay
representative of the enlarged text.
