# Universal Links Configuration

This document describes how to configure your server to support universal links (iOS) and App Links (Android) for the MindVault mobile app.

## Overview

The app is configured to handle HTTPS links in the format `https://<your-api-host>/resources/*` in addition to the custom `mindvault://` scheme. This allows users to open resource links directly in the app from the web, emails, or other apps.

## iOS: Associated Domains

For iOS universal links to work, your server must host an `apple-app-site-association` file at:

```
https://<your-api-host>/.well-known/apple-app-site-association
```

or at the root:

```
https://<your-api-host>/apple-app-site-association
```

### File Content

The file must be served with `Content-Type: application/json` (no file extension required) and should contain:

```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appID": "<TEAM_ID>.app.mindvault.mobile",
        "paths": ["/resources/*"]
      }
    ]
  }
}
```

**Important**: Replace `<TEAM_ID>` with your Apple Developer Team ID (found in your Apple Developer account). The bundle identifier `app.mindvault.mobile` is defined in `app.json`.

### Requirements

- The file must be served over HTTPS with a valid SSL certificate
- The file must be accessible without redirects
- No authentication required to access the file

## Android: App Links

For Android App Links, your server must host a `assetlinks.json` file at:

```
https://<your-api-host>/.well-known/assetlinks.json
```

### File Content

The file must be served with `Content-Type: application/json` and should contain:

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "app.mindvault.mobile",
      "sha256_cert_fingerprints": ["<YOUR_SHA256_FINGERPRINT>"]
    }
  }
]
```

**Important**:

- Replace `<YOUR_SHA256_FINGERPRINT>` with the SHA-256 fingerprint of your app signing certificate
- The package name `app.mindvault.mobile` is defined in `app.json`
- For debug builds, use the debug keystore fingerprint
- For production builds, use your release keystore fingerprint

### Getting Your SHA-256 Fingerprint

For debug builds:

```bash
keytool -list -v -keystore android/app/debug.keystore -alias androiddebugkey -storepass android -keypass android
```

For release builds:

```bash
keytool -list -v -keystore <path-to-your-release-keystore> -alias <your-key-alias>
```

Look for the `SHA256:` line in the output.

### Requirements

- The file must be served over HTTPS with a valid SSL certificate
- The file must be accessible without redirects
- No authentication required to access the file

## Testing

### iOS

1. Build and install the app on a device (universal links don't work in the simulator)
2. Open Safari and navigate to a resource URL: `https://<your-api-host>/resources/<resource-id>`
3. The app should open automatically

### Android

1. Build and install the app on a device or emulator
2. Use `adb` to test a link:
   ```bash
   adb shell am start -a android.intent.action.VIEW -d "https://<your-api-host>/resources/<resource-id>"
   ```
3. The app should open and navigate to the resource detail screen

## Build Profiles

The app configuration in `app.config.js` automatically derives the link host from `EXPO_PUBLIC_API_URL`:

- Development: localhost URLs are skipped (no universal links configured)
- Preview/Production: HTTPS URLs enable universal links

To verify the configuration for a specific profile:

```bash
npx expo config --type public
```

Look for `ios.associatedDomains` and `android.intentFilters` in the output.

## Troubleshooting

### iOS

- Verify the `apple-app-site-association` file is accessible and valid: https://branch.io/resources/aasa-validator/
- Check that your Team ID is correct
- Universal links require a fresh install or toggling Associated Domains in Settings > Safari > Advanced > Website Data

### Android

- Verify the `assetlinks.json` file is accessible and valid: https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://<your-domain>&relation=delegate_permission/common.handle_all_urls
- Verify the SHA-256 fingerprint matches your signing certificate
- Clear app data and reinstall if needed
- Check Android Studio logcat for App Links verification errors

## References

- [iOS Universal Links](https://developer.apple.com/ios/universal-links/)
- [Android App Links](https://developer.android.com/training/app-links)
- [Expo Linking](https://docs.expo.dev/guides/linking/)
