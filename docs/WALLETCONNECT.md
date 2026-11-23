# WalletConnect v2

MindVault connects to Stellar wallets (e.g. LOBSTR) through WalletConnect v2, so
a publisher never has to paste a secret key into the app. See
[SIGNING_STRATEGY.md](../SIGNING_STRATEGY.md) for why this is the production
signing approach.

## Project ID (required)

Create a project at <https://cloud.reown.com> (WalletConnect Cloud) and set its
project ID. It is **never hard-coded**; it is read from config:

| Source | Notes |
| --- | --- |
| `EXPO_PUBLIC_WALLETCONNECT_PROJECT_ID` env var | Wins when set. Use it in `.env` and EAS build profiles. |
| `expo.extra.walletConnectProjectId` in `app.json` | Ships empty; fill it for local builds. |

Without a project ID the Wallet screen shows "WalletConnect is not configured"
and no network request is made.

## How it works

`src/services/walletconnect.ts` wraps `@walletconnect/sign-client`:

- `startConnection()` proposes a session for the configured network
  (`stellar:testnet` or `stellar:pubnet`, from `expo.extra.network`) and the
  `stellar_signXDR` method. The returned `wc:` URI is opened in the wallet app
  or shown as a QR code.
- `getConnectedAccount()` restores the session after an app restart.
  WalletConnect persists sessions in AsyncStorage (via
  `@walletconnect/react-native-compat`), so no extra storage code is needed.
- `disconnectWallet()` ends the session on both sides.
- `signXdrWithWallet(xdr)` sends `stellar_signXDR` and returns the signed XDR.

The Wallet screen (Settings → Manage Wallet) shows the connected account and
the Connect / Disconnect actions.

## Testing

Unit tests mock `@walletconnect/sign-client`; no relay or wallet is needed. A
real connection needs a dev build (not Expo Go) and a wallet app on the device.
