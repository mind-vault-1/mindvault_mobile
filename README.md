# MindVault Mobile

React Native companion app for [MindVault](https://github.com/mindvault) — browse payment-protected digital resources on Stellar.

## Features

- Browse the public resource catalog
- Search by title
- Pull to refresh
- Copy resource access URLs
- On-chain registry count in the header

## Prerequisites

- Node.js 18+
- npm or pnpm
- [Expo Go](https://expo.dev/go) on your phone, or Xcode / Android Studio for simulators

## Setup

```bash
npm install
```

Point the app at your MindVault API server by editing `app.json`:

```json
"extra": {
  "apiUrl": "http://localhost:4021"
}
```

### Local Development Network Configuration
- **Simulators/emulators (iOS/Android)**: `localhost` works fine, as they share the host machine's network stack
- **Physical devices**: Use your machine's LAN IP instead of `localhost` (e.g. `http://192.168.1.10:4021`), since the device can't reach the host's `localhost` directly

Find your LAN IP with:
- **Windows**: `ipconfig` (look for "IPv4 Address" under your active network adapter)
- **macOS/Linux**: `ifconfig` or `ip a` (look for "inet" address under your active network interface)

## Run

```bash
npm start
```

Then press `i` for iOS simulator, `a` for Android emulator, or scan the QR code with Expo Go.

## Available npm scripts

| Script          | Description                                                                 |
|-----------------|-----------------------------------------------------------------------------|
| `npm start`     | Start the Expo development server (supports Android, iOS, and web)          |
| `npm run android` | Run the app on an Android device or emulator using Expo's development build |
| `npm run ios`   | Run the app on an iOS device or simulator using Expo's development build    |
| `npm run web`   | Run the app in a web browser                                                |
| `npm run typecheck` | Run TypeScript type checking without emitting files                         |

## Related

The main MindVault monorepo lives at `../mindvault` and includes the server, web app, MCP server, and Soroban contracts.
