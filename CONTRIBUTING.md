# Contributing to MindVault Mobile

Before diving into the code, read the [architecture guide](docs/ARCHITECTURE.md) for a map of the app.

## Prerequisites

- Node.js 18+
- npm or pnpm
- One of the following to run the app:
  - [Expo Go](https://expo.dev/go) on a physical iOS or Android device
  - Xcode (iOS simulator, macOS only)
  - Android Studio (Android emulator)

## Setup

```bash
npm install
```

## API URL Configuration

The app reads its API base URL from `app.json` under `extra.apiUrl`:

```json
"extra": {
  "apiUrl": "http://localhost:4021"
}
```

### Local Development Network Configuration
- **iOS Simulator / Android Emulator**: `localhost` works fine, as they share the host machine's network stack
- **Physical iOS/Android Devices**: Use your machine's LAN IP instead of `localhost` (e.g. `http://192.168.1.10:4021`), since the device can't reach the host's `localhost` directly over Wi-Fi

Find your LAN IP with:
- **Windows**: `ipconfig` (look for "IPv4 Address" under your active network adapter, typically Wi-Fi or Ethernet)
- **macOS/Linux**: `ifconfig` or `ip a` (look for "inet" address under your active network interface)

The MindVault API server defaults to port `4021`.

## Publisher API Key Setup

To access publisher features (e.g., editing prices, transferring ownership), you need to configure a publisher API key in the app:

### Obtaining an API Key
1. Ensure you have a MindVault server running locally or access to a remote instance
2. Create an API key through the MindVault web app or server CLI (follow instructions in the main MindVault monorepo)

### Configuring in the Mobile App
1. Launch the mobile app and navigate to **Settings**
2. Tap **Publisher Settings**
3. Enter your API key in the "API Key (x-api-key)" field
4. Tap **Save API Key** to store it securely using Expo Secure Store

### Troubleshooting
- **401 Unauthorized**: Your API key is invalid or expired. Double-check that you copied it correctly and that it's still active.
- **403 Forbidden**: Your API key is valid, but you don't have permission to access the requested resource. Ensure your account has publisher privileges.

## Running the App

```bash
npm start
```

Then:
- Press `i` — iOS simulator
- Press `a` — Android emulator
- Scan the QR code with Expo Go on your device

## Type Checking

```bash
npm run typecheck
```

This runs `tsc --noEmit` and reports any TypeScript errors without emitting output files. Fix all type errors before opening a PR.

## Dependency Validation

```bash
npm run validate-deps
```

This runs `expo-doctor`, which checks that your installed Expo and native module versions are compatible with the project's Expo SDK and validates `app.json`/config. It requires no native build credentials (no Xcode signing, no Android keystore, no EAS token), so it runs anywhere `npm` does, including CI. Run it after changing dependencies and before opening a PR.

## Linting

```bash
npm run lint
```

Runs ESLint with Expo's recommended config (`.eslintrc.js`), including the React hooks rules. Errors fail the build, and the number of allowed warnings is capped (`--max-warnings`), so fix any new warnings you introduce. The cap only ever goes down.

## Tests

```bash
npm test
```

Runs the Jest suite (`jest-expo` preset). Add or update tests alongside your change.

## Continuous Integration

Every pull request (and every push to `main`) runs the `CI` workflow (`.github/workflows/ci.yml`):

- **`typecheck`**: `npm ci`, `npm run validate-deps`, `npm run typecheck`
- **`ci`**: `npm ci`, `npm run lint`, `npm test -- --ci`
- **`bundle`**: `npm ci`, `npx expo export --platform android --platform ios --platform web`

All three jobs are required checks on `main`: a PR can only merge when all are green and the branch is up to date with `main`. The `bundle` job name is stable and can be referenced in branch protection rules.

## Submitting a PR

1. Fork the repo and create a branch off `main` with a descriptive name (e.g. `feat/search-filters` or `fix/refresh-crash`).
2. Make your changes, keeping commits focused and atomic.
3. Run `npm run typecheck && npm run lint && npm test` and confirm everything passes. Paste the output in your PR description.
4. Open a pull request against `main` with a clear description of what changed and why.
5. Link any relevant issues in the PR description.
