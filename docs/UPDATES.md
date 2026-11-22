# Over-the-air updates

JS and asset changes can ship to installed apps with
[EAS Update](https://docs.expo.dev/eas-update/introduction/) instead of a full
store release. Native changes (new native modules, permissions, `app.json`
plugin or native config changes, an Expo SDK upgrade) still need a new build.

## How it is configured

- **`expo-updates`** is installed, and `app.json` sets
  `"updates": { "checkAutomatically": "ON_LOAD", "fallbackToCacheTimeout": 0 }`.
  On every launch the app checks for an update in the background **without
  blocking startup**: it starts immediately on the bundle it already has, and a
  downloaded update is applied the next time the app starts.
- **Runtime version:** `"runtimeVersion": { "policy": "appVersion" }`. An update
  only reaches builds with the same `expo.version`, so a JS update can never land
  on a binary with different native code. release-please bumps `expo.version`
  (see [RELEASE.md](RELEASE.md)), so every new version needs a new build before
  it can receive updates.
- **Channels** come from the build profiles in `eas.json`: `development`,
  `preview` and `production`. A build only receives updates published to its own
  channel.

## One-time setup (maintainer)

The project isn't linked to an EAS project yet, so updates stay disabled in
builds until a maintainer runs:

```sh
npx eas-cli login
npx eas-cli update:configure
```

This adds `extra.eas.projectId` and `updates.url` (`https://u.expo.dev/<projectId>`)
to `app.json`. Commit that change, then make new builds for each channel.

## Publishing an update

```sh
# Test on internal preview builds first
npx eas-cli update --channel preview --message "fix: catalog price filter"

# Then ship the same change to store builds
npx eas-cli update --channel production --message "fix: catalog price filter"
```

Only publish from a commit that is on `main` with CI green. Users get the update
on their second launch after publishing: the first launch downloads it.

## Rolling back

If an update misbehaves, roll the channel back to the previous update:

```sh
npx eas-cli update:rollback
```

Pick the channel and choose the previous update group (or roll back to the
embedded build bundle). To redeploy a specific known-good update instead:

```sh
npx eas-cli update:list --branch production
npx eas-cli update:republish --group <update-group-id>
```

Then fix the problem on `main` with a normal PR and publish a new update. Like
publishing, a rollback reaches users on their next launch after the download.

## What never goes in an update

Secrets. Update bundles are public to anyone with the app. Never put API keys or
signing secrets in code, `app.json` or `EXPO_PUBLIC_*` variables (see
[RELEASE.md](RELEASE.md#safe-logging)).
