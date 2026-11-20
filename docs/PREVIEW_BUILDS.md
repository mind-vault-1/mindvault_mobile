# Preview builds

Every pull request can have an installable build without anyone touching a
laptop. Label a PR `preview` and CI builds it with the EAS `preview` profile,
then posts the install link as a comment on the PR. Pushing more commits to the
labelled PR rebuilds and updates the same comment.

## What you get

| Platform | Artifact | Install |
| --- | --- | --- |
| Android | APK (`android.buildType: "apk"`) | Open the APK link on the device and allow installs from the browser. |
| iOS | Simulator `.app` archive (`ios.simulator: true`) | Extract it, boot a simulator, then `xcrun simctl install booted <path>.app`. |

Preview builds use internal distribution, are signed for testing, and pin
`EXPO_PUBLIC_NETWORK=testnet`. They are not store builds and cannot be
submitted to Google Play or the App Store.

## Requesting a build

1. Push the branch and open the pull request **from a branch in
   `mind-vault-1/mindvault_mobile`**. Forks are skipped: they never receive the
   `EXPO_TOKEN` secret.
2. A maintainer adds the `preview` label. The label is the approval gate, so do
   not add it yourself unless you are a maintainer.
3. Wait for the `Preview builds` workflow. Two comments appear: one for Android
   (`<!-- preview-android -->`) and one for iOS (`<!-- preview-ios -->`). Each
   links the artifact and the EAS build page, including the commit SHA.
4. Pushing to the PR rebuilds automatically while the label is present. The
   workflow's concurrency group cancels a superseded run for the same PR.

The workflow only runs on the upstream repository, only for PRs whose head is a
branch of that repository, and only when the `preview` label is present.

## One-time setup

### EAS token

Create a token with access to the project and store it as the repository secret
`EXPO_TOKEN`. The workflows pass it through `env`; it is never echoed. Do not
turn on shell tracing (`set -x`) in build steps.

### Preview environment

The `preview` profile uses the EAS `preview` environment (see
`eas.json`), so build-time configuration lives in Expo, not in the repository:

```sh
npx eas-cli env:create --name EXPO_PUBLIC_API_URL \
  --value https://preview.example.com --environment preview --visibility plaintext
npx eas-cli env:create --name EXPO_PUBLIC_NETWORK \
  --value testnet --environment preview --visibility plaintext
```

`EXPO_PUBLIC_API_URL` must point at a reachable, seeded **testnet** server.
`eas.json` also sets `EXPO_PUBLIC_NETWORK=testnet` for the profile; keep both
consistent so a misconfigured environment cannot point a preview build at
mainnet. Never store secrets, signing keys, or API keys in `eas.json` or
`app.json`. `app.config.js` maps these variables into the runtime `extra`
config.

### Build retention

Preview builds are deleted 14 days after they are created. The cleanup step
lists the 100 most recent builds per platform and deletes older `preview`
builds; it is best-effort and never fails the job. The comments remain, but
their artifact links stop working after the build is deleted.

## Running the same profile locally

```sh
npx eas-cli build --profile preview --platform android
npx eas-cli build --profile preview --platform ios
```

For a local Android build that does not upload to EAS, follow the Docker and
Android SDK setup in `docs/RELEASE.md` and add `--local`.

## Troubleshooting

- **Comments are missing**: the job was skipped. Check the label, that the
  branch lives in the upstream repository, and that `EXPO_TOKEN` is set.
- **Build succeeds but the app cannot reach the server**: `EXPO_PUBLIC_API_URL`
  in the EAS `preview` environment is missing or points at localhost. Rebuild
  after fixing it; the value is inlined at bundle time.
- **Android install is blocked**: allow installs from unknown sources for the
  browser or file manager used to download the APK.
- **iOS artifact will not install on a device**: it is a simulator build. Use a
  simulator, or look at the production/TestFlight path in `docs/RELEASE.md`.
