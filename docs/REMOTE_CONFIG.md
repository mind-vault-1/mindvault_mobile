# Remote config and feature flags

The app can change its API host, pagination limit, request timeout and feature
flags at runtime, so an incident response does not need a new release. The code
is in `src/config/remoteConfig.ts`.

## Setup

The app reads two compiled-in values:

```sh
EXPO_PUBLIC_REMOTE_CONFIG_URL=https://config.example.com/mindvault.json
EXPO_PUBLIC_REMOTE_CONFIG_PUBLIC_KEY=G...
```

Both can also be supplied under `expo.extra.remoteConfigUrl` and
`expo.extra.remoteConfigPublicKey`. Without a URL, the app runs on its compiled
defaults and never fetches config. Without a public key, a fetched document is
rejected.

## Document shape

The endpoint returns an envelope signed with the Stellar key whose public key is
compiled into the app:

```json
{
  "config": {
    "apiBaseUrl": "https://api.example.com",
    "limits": { "requestTimeoutMs": 15000, "pageSize": 20 },
    "flags": { "newScanner": 25, "wallet": true, "beta": false }
  },
  "signature": "base64-ed25519-signature"
}
```

The signature covers `canonicalizeRemoteConfigValue(config)`: object keys are
sorted recursively and arrays keep their order. Use the same canonicalization
on the server before calling `Keypair.sign()`.

- `apiBaseUrl` is used only when the user has not saved their own host in
  Settings. It must pass the same checks as a saved host: `https://`, or
  `http://` for localhost and private LAN addresses.
- `limits.requestTimeoutMs` must be an integer from 1000 to 60000.
- `limits.pageSize` must be an integer from 1 to 100.
- A flag is `true`/`false` for everyone, or a number 0–100 for a percentage
  rollout. A rollout uses a random bucket stored once per install, so the same
  installs stay in it across launches.
- Only known flag names are kept: `newScanner`, `wallet` and `beta`. Unknown
  names are ignored and calling `isFeatureEnabled()` with an unknown name is a
  typecheck error.
- Invalid values are dropped and the compiled default is used in their place.

Build-specific overrides can be supplied as JSON under
`EXPO_PUBLIC_FEATURE_FLAGS` or `expo.extra.featureFlags`. They win over remote
values, so a build can force a flag on or off.

## Fallback behaviour

- **Boot:** the last cached document is applied before the first request. The
  app does not wait on the network.
- **Refresh:** after boot the app fetches the envelope (3 s timeout), verifies
  the signature, caches the parsed config and applies it. A failed or tampered
  fetch keeps the config already in effect.
- **Replacement:** each fetched document replaces the previous one as a whole.
  Fields it leaves out revert to their defaults.

The config URL serves public, non-personal data. The request sends no install
identifiers.
