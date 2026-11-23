# Native Project Generation

The `android/` and `ios/` directories are generated at build time from `app.json`, EAS configuration, and `expo-updates` settings. They are **not committed** to version control.

## Why Continuous Native Generation?

- **Single source of truth**: Configuration lives in `app.json`, `eas.json`, and environment-specific EAS profiles, not in multiple places
- **No drift**: The generated native projects always match the configuration, preventing version mismatches
- **Cleaner diffs**: Pull requests don't include generated build artifacts
- **Smaller repository**: No need to track 43+ generated files, including keystores and build artifacts

## Building Locally

Most day-to-day work needs no native folders at all:

```bash
npx expo start            # Expo Go or a development build
```

To build and run native code locally, generate the projects from `app.json`,
then run them. Generated folders are gitignored; regenerate rather than edit them.

```bash
npx expo prebuild --clean          # (re)generate android/ and ios/ from app.json
npx expo run:android               # build and run on an emulator or device
npx expo run:ios                   # macOS with Xcode only
```

`--clean` deletes and regenerates the folders, so a stale native project never
drifts from the config. Release builds go through EAS, which runs prebuild for
you (see [RELEASE.md](RELEASE.md)):

```bash
npx eas-cli build --profile preview --platform android
```

## Configuration

All native settings come from:

1. **`app.json`** (and `app.config.js`): name, version, icons, splash, permissions, plugins and `updates`.
2. **`eas.json`**: build profiles, channels and distribution.
3. **Config plugins** listed in `app.json` `plugins`, e.g. `expo-camera` for the camera permission text.

## Changing native configuration

Never edit `android/` or `ios/` directly: the next `prebuild --clean` or EAS
build discards the change.

1. Change `app.json`, or add a plugin's options there.
2. Run `npx expo prebuild --clean` and check the generated result.
3. Build and test with `npx expo run:android` / `run:ios`.

If no existing option or plugin covers what you need, write a small local
[config plugin](https://docs.expo.dev/config-plugins/introduction/) and add it
to `plugins`.

## Publish notifications

`expo-notifications` (installed with `npx expo install expo-notifications`) sends a
local notification when a publish reaches `on-chain` or `rejected` status. Basic
local notifications need no config plugin, so there is no native change to
prebuild; rebuild the development client after changing native dependencies.

- **iOS:** permission is checked with `getPermissionsAsync()` and requested with
  `requestPermissionsAsync()` only when a publish starts. Alerts and sound are
  requested; badges are not. If the user denied access in Settings, no further
  prompt is shown and no notification is scheduled. A notification received in
  the foreground is displayed by the handler registered in
  `src/services/notifications.ts`.
- **Android:** `POST_NOTIFICATIONS` is requested at the same point on Android 13
  and newer. Older versions need no runtime prompt. The default Expo channel is
  used; users can disable alerts in system settings, which the permission check
  respects.
- **Deep link:** the notification payload carries the resource id and
  `mindvault://resources/<id>`. Tapping it runs the response listener registered
  by `App.tsx` and opens `ResourceDetail` through the same linking configuration
  used by QR codes. The `mindvault` scheme is declared in `app.json`.

To verify, publish a resource on a physical device or development build, leave
the app while verification is pending, and confirm the notification appears when
the status becomes terminal. Tapping it must open the published resource. Local
notifications do not require push credentials.

## Reference

- [Expo documentation on prebuild](https://docs.expo.dev/workflow/prebuild/)
- [EAS Build documentation](https://docs.expo.dev/build/introduction/)
- [Continuous Native Generation](https://docs.expo.dev/workflow/continuous-native-generation/)
