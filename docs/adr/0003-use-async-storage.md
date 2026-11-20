# ADR 0003: Store Sensitive Data with Expo Secure Store

**Status:** Accepted  
**Date:** 2026-11-20  
**Author(s):** DeborahOlaboye

## Context

The app needs to store sensitive information across sessions:
- Publisher API keys
- Authentication tokens
- Wallet configuration

Storing these in plain text (via AsyncStorage) or on the filesystem is a security risk. We need a solution that:
- Uses platform-native secure storage (Keychain on iOS, Keystore on Android)
- Survives app restarts and updates
- Fails gracefully if the device is compromised

## Decision

Use **Expo Secure Store** (`expo-secure-store`) for all sensitive data, and **AsyncStorage** for non-sensitive app state only.

**Storage policy:**
- **Expo Secure Store:** API keys, auth tokens, biometric settings
- **AsyncStorage:** Search history, filter preferences, cached data
- **Never stored:** Secret keys, PINs (except temporarily during signing)

## Rationale

### Pros
- **Platform-native security:** Uses iOS Keychain and Android Keystore under the hood.
- **Abstracted complexity:** Expo handles platform differences; we write one line of code.
- **Survived app upgrades:** Data persists through reinstalls and OS updates.
- **Biometric protection possible:** Can enforce biometric auth before read (future).

### Cons
- **Expo dependency:** Breaks if Expo's implementation has bugs or is discontinued.
- **No fallback:** If secure storage fails, we can't degrade gracefully.
- **Platform-specific edge cases:** Android KitKat and older have weaker Keystore.

### Alternatives Considered
- **AsyncStorage only:** Fast but insecure for sensitive data.
- **SQLite + encryption:** Too much complexity; unnecessary for this app.
- **Manual key derivation:** Reinventing the wheel; crypto is easy to get wrong.

## Consequences

1. **API keys and tokens go in Secure Store** via `src/services/secureStorage.ts`.
2. **Secure Store is queried on app startup** to restore credentials.
3. **Logout clears Secure Store** to remove credentials on sign-out.
4. **Code reviews check storage decisions:** Any new sensitive data needs ADR review.
5. **Error handling:** When Secure Store is unavailable (rooted device, etc.), the app degrades gracefully.

## Related Issues & PRs

- Issue #273: Offline mutation queue, receipt sync, secret redaction (enforces no-secret-logging)

## See Also

- [ADR 0002: Sign Payments with Stellar Keypair](0002-sign-with-keypair.md)
- [docs/PAYMENTS.md](../PAYMENTS.md) for payment flow including token refresh
