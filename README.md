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
  "apiUrl": "http://localhost:4021",
  "networkPassphrase": "Test SDF Network ; September 2015"
}
```

For a physical device, use your machine's LAN IP instead of `localhost` (e.g. `http://192.168.1.10:4021`).

## Stellar Network Configuration

The app defaults to the Stellar **Testnet**. The passphrase `Test SDF Network ; September 2015` isn't a stale date — it's Stellar's official, fixed identifier for the public testnet, defined by the Stellar Development Foundation and unchanged since the network's launch. It's the same value as `Networks.TESTNET` in `@stellar/stellar-base`.

**Where it's configured:**

- `app.json` → `expo.extra.networkPassphrase` is the client-side default. It's read via `Constants.expoConfig.extra.networkPassphrase` in `src/api/resources.ts` and `src/utils/stellarExpert.ts`. To point the app at a different Stellar network, use one of the SDK's official passphrase strings (from `@stellar/stellar-base`'s `Networks` constant):
  - `Public Global Stellar Network ; September 2015` — mainnet
  - `Test SDF Network ; September 2015` — testnet (current default)
  - `Test SDF Future Network ; October 2022` — futurenet
- If this key is removed or left unset, the same value is still used as a hardcoded fallback in code — so the app always ends up on Testnet either way unless this key is explicitly changed.

**One important exception:** for transactions built through the register and price-edit flows (`prepareRegister` / `prepareEditPrice` in `src/api/resources.ts`), the passphrase used to sign is whatever the **backend API returns** in its response — the client's `app.json` value is only a fallback if the backend omits it. In practice, this means the network for those specific flows is ultimately a backend decision, not purely a client config one.

`src/screens/DevSignerScreen.tsx` is a developer-only debug screen and intentionally hardcodes `Networks.TESTNET` regardless of any config — it's not affected by the `app.json` value and always targets testnet.

## Run

```bash
npm start
```

Then press `i` for iOS simulator, `a` for Android emulator, or scan the QR code with Expo Go.

## Related

The main MindVault monorepo lives at `../mindvault` and includes the server, web app, MCP server, and Soroban contracts.
