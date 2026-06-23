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

For a physical device, use your machine's LAN IP instead of `localhost` (e.g. `http://192.168.1.10:4021`).

## Run

```bash
npm start
```

Then press `i` for iOS simulator, `a` for Android emulator, or scan the QR code with Expo Go.

## Related

The main MindVault monorepo lives at `../mindvault` and includes the server, web app, MCP server, and Soroban contracts.
