# Contributing to MindVault Mobile

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

`localhost` works fine for simulators running on your machine. For a physical device connected over Wi-Fi, replace it with your machine's LAN IP:

```json
"extra": {
  "apiUrl": "http://192.168.1.10:4021"
}
```

Find your LAN IP with `ipconfig` (Windows) or `ifconfig` / `ip a` (macOS/Linux). The MindVault API server defaults to port `4021`.

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

Both `npm run validate-deps` and `npm run typecheck` run automatically on every pull request via the `Typecheck & Dependency Validation` workflow (`.github/workflows/typecheck.yml`).

## Submitting a PR

1. Fork the repo and create a branch off `main` with a descriptive name (e.g. `feat/search-filters` or `fix/refresh-crash`).
2. Make your changes, keeping commits focused and atomic.
3. Run `npm run typecheck` and confirm it passes with no errors.
4. Open a pull request against `main` with a clear description of what changed and why.
5. Link any relevant issues in the PR description.
