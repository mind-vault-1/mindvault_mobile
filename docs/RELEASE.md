# Release guide

## Versioning

The app version is the `expo.version` value in `app.json`. Increment it for each
release. The production EAS profile uses remote app-version management and
automatically increments the platform build numbers.

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
