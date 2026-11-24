# Remote config and feature flags

The app can change its API host, a request limit and feature flags at runtime,
so an incident response does not need a new release. The code is in
`src/config/remoteConfig.ts`.

## Setup

The app reads one compiled-in value, the config URL. Set it per build:

```sh
EXPO_PUBLIC_REMOTE_CONFIG_URL=https://config.example.com/mindvault.json
```

Without it, the app runs on its compiled-in defaults and never fetches config.

## Document shape

```json
{
  "apiBaseUrl": "https://api.example.com",
  "limits": { "requestTimeoutMs": 15000 },
  "flags": { "newScanner": 25, "wallet": true, "beta": false }
}
```

- `apiBaseUrl` is used only when the user has not saved their own host in
  Settings. It must pass the same checks as a saved host: `https://`, or
  `http://` for localhost and private LAN addresses.
- `limits.requestTimeoutMs` must be an integer from 1000 to 60000.
- A flag is `true`/`false` for everyone, or a number 0–100 for a percentage
  rollout. A rollout uses a random bucket stored once per install, so the same
  installs stay in it across launches.
- Unknown flags are off. Invalid values are dropped, and the compiled default is
  used in their place.

Check a flag in code with `isFeatureEnabled("newScanner")`.

## Fallback behaviour

- **Boot:** the last cached document is applied before the first request. The
  app does not wait on the network.
- **Refresh:** after boot the app fetches the document (3 s timeout), caches it
  and applies it. A failed fetch keeps the config already in effect.
- **Replacement:** each fetched document replaces the previous one as a whole.
  Fields it leaves out revert to their defaults.

The config URL serves public, non-personal data. The request sends no install
identifiers.
