# Privacy and data handling

This page lists everything MindVault Mobile stores on your device, how long
each value is kept and how to delete it. It also lists what the app sends off
the device and what it never sends. It describes the app's code, not the
policies of the MindVault server you connect to. Ask that server's operator
how it keeps the requests the app sends.

In short:

- The app has no analytics, advertising or crash-reporting SDK. Errors are
  logged to the developer console in development builds only.
- Registering as a publisher sends your name, email and wallet address to the
  MindVault server, which creates your publisher account there.
- Secrets (the publisher API key and any wallet key) are kept in the
  platform's secure storage. Other data is plain app storage on the device.
- The app talks to the MindVault API you configure, to the Stellar network,
  and to a few platform services listed below. A Stellar secret key is never
  sent anywhere.
- **Settings → Local Data** clears most stored data group by group. The rest
  is covered in [Deleting your data](#deleting-your-data).

## What is stored on the device

### Secure storage (iOS Keychain, Android Keystore)

| Value | Key | Kept until | How to delete |
| --- | --- | --- | --- |
| Publisher API key | `x-api-key` | You log out or replace it | **Publisher Profile → Log out** |
| Biometric unlock preference for the API key | `biometric-lock-enabled` | Turned off | No screen sets it in this version, so the key is absent. The app lock under **Settings** is a separate setting (below). |
| Wallet secret key and public address | `mindvault_wallet_secret`, `mindvault_wallet_public` | Wiped by the wallet module | No screen in this version creates or imports a wallet, so these keys are absent. A Stellar secret typed into the signing sheet is never saved (see [In memory only](#in-memory-only)). |

### App storage (AsyncStorage, not encrypted)

"Local Data" is the group under **Settings → Local Data** that clears the
value.

| Value | Key | Kept until | Local Data group |
| --- | --- | --- | --- |
| Catalog search, sort and filters | `@mindvault_catalog_filters` | Replaced by your next choice | Filters |
| Onboarding completed flag | `@mindvault_catalog_filters:onboarding` | Cleared | Filters (also reset by **Reopen onboarding**) |
| Publisher resource filters | `@mindvault_catalog_filters:publisher` | Replaced by your next choice | Not covered |
| Saved searches (name and filters) | `@mindvault_saved_searches` | You delete them (no limit) | Saved Searches |
| Favourites | `@mindvault_favourites` | Cleared | Favourites (nothing writes this key in this version) |
| Recently viewed resources (id, title, price) | `@mindvault_recent_resources` | Newest 20 kept | History |
| Recent search terms | `@mindvault_search_history` | Newest 10 kept, each up to 100 characters | History |
| Disposable cache entries | keys starting `@mindvault_cache:` | Cleared | Cache |
| Payment receipts: resource id, title, amount, asset, network, transaction hash, payer address, paid-at time | `@mindvault_receipts` | Newest 200 kept, one per transaction hash | Receipts |
| Audit log: action, time, outcome, shortened wallet address, error message | `mindvault:auditLog` | Cleared (no limit) | Audit Log |
| Receipt sync retry counts per transaction hash (counting stops at 5) | `@mindvault_receipt_sync` | The receipt appears on the server | Not covered |
| Offline queue of publish, lease and delist actions, including a signed payment for a queued publish | `@mindvault_mutation_queue` | The action succeeds on replay. Failed actions stay until a retry succeeds | Not covered |
| Thumbnail cache index (thumbnail URLs) | `mindvault_image_cache_v1` | Newest 200 kept | Not covered |
| API base URL you entered | `mindvault_api_base_url` | You reset it to the default | Not covered (a setting) |
| Theme | `@mindvault_theme_mode` | You change it | Not covered (a setting) |
| Haptics on or off | `@mindvault_haptics_enabled` | You change it | Not covered (a setting) |
| App lock: enabled, timeout, last time in background, lock pending | `@mindvault_app_lock_*` | You change it. The background time is cleared on unlock | Not covered (a setting) |

Notes from the code review:

- **Receipts** are public settlement data only. Unknown fields are dropped
  before saving (`src/services/receipts.ts`). They contain no keys and no
  signed transactions.
- **Receipt sync** runs in the background: on start, on return to the
  foreground and after each payment, at most every 30 seconds. It downloads
  `GET /receipts` and adds receipts that are missing locally. It never uploads
  the local store. After you clear receipts, the next sync downloads the
  receipts the server returns again.
- **The audit log** is meant for sensitive actions (key rotation, wallet wipe,
  signing). Wallet addresses in it are shortened to their first and last four
  characters. Error messages are stored as given. Nothing in this version
  writes entries, so the log stays empty. You can view, share and clear it in
  Settings.

### In memory only

These values are never written to storage and are gone when the app closes:

- A Stellar secret key typed into the signing sheet. It is used for one
  signature and cleared on success, error, cancel and close.
- The error log: the last 100 errors, with secrets redacted. It leaves the
  device only inside diagnostics you choose to share.

### Managed by the operating system

- Thumbnail image files sit in the platform's image cache. The OS manages
  them, and they are removed with the app's cache or the app.
- Once EAS Update is set up (see [UPDATES.md](UPDATES.md)), downloaded update
  bundles and a random install ID (`EAS-Client-ID`) are kept by `expo-updates`
  until the app is uninstalled.

## What leaves the device

### To the MindVault API you configure

The API URL is set in the build or under **Settings**. Requests go to that
server only.

| Data sent | When |
| --- | --- |
| Catalog search terms, filters, sort and page | Browsing and searching the catalog |
| Resource ids | Opening a resource, its thumbnail, verification or lease details |
| Your wallet public address, if a wallet is set up (no screen sets one up in this version) | Checking lease status, loading purchase history (`/buyers/:address/payments`) |
| A publisher's wallet address | Opening that publisher's profile |
| Signed payment transactions (the `PAYMENT-SIGNATURE` header) | Paying for a resource, paying a publish fee, sending a tip |
| Publisher API key (`x-api-key` header) | Publisher screens: profile, analytics, your resources, publishing, price edits, transfers, delisting, key rotation |
| Name, email and wallet address | Registering as a publisher |
| Link, title, price and other publish fields | Publishing a resource |
| Nothing identifying | Receipt sync (`GET /receipts`), health check (`GET /health`), registry status |

### To other services

| Service | Data | When |
| --- | --- | --- |
| Stellar Soroban RPC (testnet by default, or the configured `sorobanRpcUrl`) | Ledger queries and transactions to simulate payments, plus signed lease and transfer transactions to submit. These hold public addresses and amounts, never a secret key | Paying, leasing |
| Google connectivity check (`https://clients3.google.com/generate_204`) | An empty `HEAD` request from the NetInfo library | When the OS does not report internet reachability itself |
| EAS Update (`u.expo.dev`), once configured | Runtime version, platform, channel and the random `EAS-Client-ID` | On app launch, to check for an update |
| Your browser | The resource, account or transaction URL | You open a resource or a Stellar Expert link |
| The share sheet | The text you chose to share | You share receipts, the audit log or diagnostics |

Diagnostics hold the app version, platform and OS version, device model,
environment, API URL, network, whether an API key is stored (yes or no) and
the redacted error log. They never include the key itself.

### What never leaves the device

- A Stellar secret key. Signing happens on the device.
- Biometric data. The OS checks it and the app only learns success or failure.
- The receipt store, audit log, search history, saved searches, recently
  viewed items, filters and settings, unless you share receipts, the audit log
  or diagnostics yourself.

## Deleting your data

1. **Settings → Local Data** lists each group with its size and a **Clear**
   button: Filters, Saved Searches, Favourites, History, Cache, Receipts and
   Audit Log. Each clear asks for confirmation. Clearing never touches secure
   storage.
2. **Publisher Profile → Log out** removes the publisher API key.
3. Settings in the "Not covered" rows above change from their own controls in
   **Settings**.
4. Uninstalling the app removes app storage. Clearing the app's storage on
   Android does the same. iOS does not promise to remove Keychain items on
   uninstall, so log out of the publisher profile first.

Data that lives elsewhere is not removed by the app:

- Payments, receipts, publisher accounts and resources on the MindVault
  server. Contact the server's operator.
- Transactions on the Stellar network. They are public and permanent.

## Review

Last checked on 2026-11-21 against `src/services/storage.ts`,
`src/services/receipts.ts`, `src/services/receiptSync.ts`,
`src/services/auditLog.ts`, `src/services/secureStorage.ts`,
`src/services/wallet.ts`, `src/services/mutationQueue.ts`,
`src/services/diagnostics.ts`, `src/utils/errorLogger.ts`,
`src/utils/imageCache.ts` and the `src/api/` clients. Update this page in the
same PR as any change that stores a new value or sends data to a new place.
