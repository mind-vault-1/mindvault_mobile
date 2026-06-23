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

## Submitting a PR

1. Fork the repo and create a branch off `main` with a descriptive name (e.g. `feat/search-filters` or `fix/refresh-crash`).
2. Make your changes, keeping commits focused and atomic.
3. Run `npm run typecheck` and confirm it passes with no errors.
4. Open a pull request against `main` with a clear description of what changed and why.
5. Link any relevant issues in the PR description.
