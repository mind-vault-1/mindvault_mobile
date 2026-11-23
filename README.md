# MindVault Mobile

React Native companion app for [MindVault](https://github.com/mindvault) — browse payment-protected digital resources on Stellar.

## Features

- Browse the public resource catalog
- Search by title
- Pull to refresh
- Copy resource access URLs
- On-chain registry count in the header

## Architecture

New here? Read the [architecture guide](docs/ARCHITECTURE.md) for the layers, data flow, storage keys and the signing and payment flows.

## Privacy

The [privacy and data-handling notes](docs/PRIVACY.md) list every value the app stores, how long it is kept and how to delete it, plus what leaves the device and what never does. Settings links to them from the **Local Data** section. Update them in the same PR as any change that stores new data or sends data somewhere new.

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

### Local Development Network Configuration

- **Simulators/emulators (iOS/Android)**: `localhost` works fine, as they share the host machine's network stack
- **Physical devices**: Use your machine's LAN IP instead of `localhost` (e.g. `http://192.168.1.10:4021`), since the device can't reach the host's `localhost` directly

Find your LAN IP with:

- **Windows**: `ipconfig` (look for "IPv4 Address" under your active network adapter)
- **macOS/Linux**: `ifconfig` or `ip a` (look for "inet" address under your active network interface)

## Deep links

The app registers the `mindvault://` scheme (declared in `app.json`) and routes resource links to the detail screen — for example `mindvault://resources/abc` or `https://<your-api-host>/resources/abc`.

Try it from a terminal against a running simulator/emulator:

```bash
# iOS
npx uri-scheme open "mindvault://resources/abc" --ios

# Android
npx uri-scheme open "mindvault://resources/abc" --android
```

The linking config lives in `src/linking.ts` and reuses the same `parseResourceId` parser as the QR scanner.

## Publisher Authentication

Publisher resources require an API key for authentication:

- **API Key Origin:** Publisher API keys are issued by your MindVault backend server.
- **Server Configuration:** On self-hosted servers, configure your keys using the `PUBLISHER_API_KEYS` environment variable or generate one through your server's admin interface.
- **App Usage:** Enter the key in the **Publisher Resources** tab or Publisher Settings modal to view and manage your resources.

### Signed publisher writes

Authenticated publisher writes (`POST`/`DELETE`) are signed with HMAC-SHA256 when the server enables `REQUIRE_REQUEST_SIGNATURE`, including link publishes, API-key rotation, and API-key revocation. Publisher registration is public and is not signed because no key exists yet. The app sends:

- `X-Timestamp`: current Unix time in seconds
- `X-Signature`: hex HMAC of `METHOD\npath\nX-Timestamp\nSHA256(body)` using the publisher API key as the secret
- `Idempotency-Key`: only when the caller supplies one; it is appended as a fifth canonical line

The canonical string, body hash and signature are byte-for-byte compatible with `server/src/utils/requestSignature.ts`. The implementation in `src/utils/requestSignature.ts` is pure JavaScript (including SHA-256 and UTF-8 encoding) because Hermes has no `node:crypto`.

### Screen-capture protection

`expo-screen-capture` blocks screenshots and screen recording while the `SignTransactionSheet` signing sheet or the developer `DevSigner` screen is visible, and releases the block on close/blur. The block is keyed so the two screens cannot unlock each other prematurely.

Before a payment starts, the paywall reads the stored public key and checks Horizon for a USDC trustline and enough balance to cover the displayed price. A missing trustline or short balance stops the flow with an **Open Wallet** link; if Horizon cannot be reached, a warning is shown and the normal payment flow continues. No Horizon request is made until **Pay & Access** is pressed, and closing the sheet cancels any in-flight check. The classic USDC issuer defaults to the official issuer for the configured network; self-hosted deployments with a different issuer can set `expo.extra.usdcIssuer` in `app.json`.

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

## Theme Preferences

The app supports light, dark, and system-synced themes, selectable from the Settings screen.

**How persistence works:** When you pick a theme, it's written to `AsyncStorage` under the key `@mindvault_theme_mode` via `useTheme` in `src/theme/index.ts`. On the next launch, the hook reads that key during its initial `useEffect` and restores your selection before the first render completes — so the chosen theme is active immediately on startup, with no flash.

**Manual verification steps:**

1. Open the app and go to **Settings**.
2. Select **Dark** (or **Light**) theme — the UI updates immediately.
3. Close the app fully (remove from recents).
4. Reopen — the same theme should be active without any flicker.
5. Select **System** to confirm it follows the device's OS-level setting.

If the stored value is missing or unrecognized, the hook silently falls back to **System** mode.

## Run

```bash
npm start
```

Then press `i` for iOS simulator, `a` for Android emulator, or scan the QR code with Expo Go.

## Testing

See the [testing guide](docs/TESTING.md) for writing tests, mocking patterns, and test utilities.

```bash
npm test
npm test -- --watch
npm test -- --coverage
```

## Build and Release

See the [release guide](docs/RELEASE.md) for EAS build profiles, store submission,
and secret-handling guidance.

## Native Project Generation

The `android/` and `ios/` directories are generated at build time. See the [native guide](docs/NATIVE.md) for details.

## Available npm scripts

| Script              | Description                                                                 |
| ------------------- | --------------------------------------------------------------------------- |
| `npm start`         | Start the Expo development server (supports Android, iOS, and web)          |
| `npm run android`   | Run the app on an Android device or emulator using Expo's development build |
| `npm run ios`       | Run the app on an iOS device or simulator using Expo's development build    |
| `npm run web`       | Run the app in a web browser                                                |
| `npm run typecheck` | Run TypeScript type checking without emitting files                         |
| `npm test`          | Run tests with Jest                                                         |

## Related

The main MindVault monorepo lives at `../mindvault` and includes the server, web app, MCP server, and Soroban contracts.
