# Mobile Transaction Signing Strategy

This document outlines the viable options for signing Stellar and Soroban transactions (XDRs) in the React Native mobile app, and specifies the recommended approach.

## Options

### 1. WalletConnect v2 (App-to-App)
WalletConnect allows the mobile app to securely request signatures from compatible installed Stellar mobile wallets (e.g., LOBSTR).
- **Pros**: The most secure and production-ready option. Users do not need to paste their secret keys into our app.
- **Cons**: Requires users to have a compatible wallet app installed on their mobile device. Integration overhead with `@walletconnect/universal-provider`.

### 2. SEP-0007 (Deep Linking)
Uses the `web+stellar:` URI scheme to deep-link the user into a wallet application to approve and sign the transaction.
- **Pros**: Native feel, easy to generate the URI. Supported by many wallets.
- **Cons**: The UX can be disjointed (user is pushed out of the app and must manually return after signing).

### 3. In-App Signer (Dev / Internal Only)
We prompt the user to input their Stellar Secret Key (starting with `S...`) directly into the app. The app creates a `Keypair` instance and signs the transaction locally using `@stellar/stellar-sdk`.
- **Pros**: Zero dependencies on third-party wallets. Self-contained and extremely easy to test during development.
- **Cons**: Severe security risks if used in production. Users are strongly advised never to paste secret keys into third-party apps.

## Chosen Strategy

For the **production** publisher flow, we will implement **Option 1: WalletConnect v2**. This aligns with best practices for mobile dApps.

### Implementation Steps (WalletConnect v2)
1. **Install Dependencies**: Add `@walletconnect/universal-provider` or the relevant WalletConnect SDK for React Native.
2. **Project Setup**: Register a new project on WalletConnect Cloud to obtain a `projectId`.
3. **Initialize Provider**: Instantiate the provider on app startup with the `projectId` and Stellar network parameters (e.g., `stellar:pubnet`).
4. **Session Proposal**: Implement a "Connect Wallet" flow that triggers a WalletConnect session proposal and deep-links or shows a QR for the user's wallet.
5. **Sign Request**: When a Soroban XDR needs signing, send a `stellar_signXDR` JSON-RPC request through the active session.
6. **Handle Response**: Await the user's approval in their wallet and process the returned signed XDR.

However, to enable rapid development and testing (as requested in Issue #16), we have implemented **Option 3: In-App Signer** as a Proof-of-Concept (PoC). This PoC is available on the `DevSignerScreen` (accessible via Settings) and allows developers to easily generate and sign dummy Soroban transactions using a provided secret key without needing external wallets on the simulator/device.
