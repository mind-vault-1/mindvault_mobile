# Contributing to MindVault Mobile

Before diving into the code, read the [architecture guide](docs/ARCHITECTURE.md) for a map of the app. New contributors should also check the [good first issues guide](docs/GOOD_FIRST_ISSUES.md).

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

## Branch Naming

Create branches with descriptive names following the pattern:
- Features: `feat/<feature-name>` (e.g., `feat/saved-searches`)
- Bug fixes: `fix/<bug-name>` (e.g., `fix/payment-timeout`)
- Documentation: `docs/<doc-name>` (e.g., `docs/adr-decisions`)
- Batch work: `batch-<number>/<description>` (e.g., `batch-seven/features`)

Avoid adding numbers to batch branch names; use descriptive names instead.

## Review Expectations

- **Code reviews** focus on correctness, maintainability, and alignment with the architecture.
- **Testing** is mandatory—all changes must include appropriate test coverage.
- **Type safety** is required—no TypeScript errors or warnings in new code.
- **Performance** matters—avoid unnecessary renders or blocking operations.
- **Accessibility** is non-negotiable—ensure your UI is usable by everyone.

## Issue Workflow

1. **Wait for assignment** via the GitHub UI or the Drips Wave app. PRs from unassigned contributors will be closed.
2. **Post a plan or draft PR within 48 hours** of assignment to show you're making progress.
3. **Timebox your work** according to the issue's complexity—most issues target 7-day delivery.
4. **Link every related issue** in your PR with `Closes #N` lines.
5. **One commit per issue** when batching work, so each issue can be reviewed and reverted independently.
6. **Include test output** in your PR description—run and paste the results of `npm run typecheck && npm run lint && npm test`.

## Troubleshooting

### "Cannot find module" or "Cannot use import syntax"
Ensure you've run `npm ci` and that your TypeScript configuration (`tsconfig.json`) includes the files you're editing. Check that imports match the actual file structure in `src/`.

### Type errors after setup
Run `npm run typecheck` to see exact line numbers and error details. Most errors are fixed by ensuring imports use correct paths or by adding missing type annotations.

### Tests failing locally but passing in CI
The CI uses `npm ci` (clean install) instead of `npm install`, which respects the lockfile exactly. Run `npm ci` locally to replicate CI conditions.

### "Command not found: npm"
Ensure Node.js 18+ is installed (`node --version`). If using a version manager like `nvm`, activate the correct Node version: `nvm use`. If you have multiple shells open, restart your terminal.

### iOS simulator missing Expo Go
Install Xcode from the App Store, then run `xcode-select --install` in the terminal. Launch the iOS simulator with `open -a Simulator`.

### Android emulator not connecting
Ensure Android Studio is installed and the emulator is running. Run `adb devices` to check connection. If not listed, restart the emulator and reload your app in Expo.

## Submitting a PR

1. Fork the repo and create a branch off `main` with a descriptive name (e.g. `feat/search-filters` or `fix/refresh-crash`).
2. Make your changes, keeping commits focused and atomic.
3. Run `npm run typecheck && npm run lint && npm test` and confirm everything passes. Paste the output in your PR description.
4. Open a pull request against `main` with a clear description of what changed and why.
5. Link any relevant issues in the PR description using `Closes #N` format.
6. Respond to review feedback promptly and push updates to the same branch.
