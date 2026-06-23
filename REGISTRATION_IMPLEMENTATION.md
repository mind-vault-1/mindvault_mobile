# Mobile On-Chain Registration Implementation

## Overview

This implementation ports the web on-chain registration modal to the mobile app, enabling resources to be registered on the Stellar blockchain.

## What's Implemented

### 1. API Integration (`src/api/resources.ts`)

Added two new API functions:

- **`prepareRegister(resourceId: string)`** - Calls `POST /resources/:id/register/prepare` and returns:
  - `xdr`: Unsigned transaction XDR
  - `networkPassphrase`: Stellar network identifier

- **`submitRegister(resourceId: string, signedXdr: string)`** - Calls `POST /resources/:id/register` and returns:
  - `txHash`: Transaction hash from the blockchain
  - `success`: Boolean indicating submission success

### 2. Registration Modal (`src/components/RegisterModal.tsx`)

A complete React Native modal component with the following features:

#### Registration Flow States:
1. **Idle** - Initial state showing resource info and Register/Cancel buttons
2. **Preparing** - Loading state while calling prepare endpoint
3. **Signing** - Displays unsigned XDR and waits for signature
4. **Submitting** - Loading state while submitting signed transaction
5. **Success** - Shows transaction hash with "View in Explorer" button
6. **Error** - Shows error message with Retry button

#### Features:
- Full error handling with user-friendly messages
- Transaction hash display with link to Stellar explorer
- Responsive modal design with proper loading indicators
- Toast notifications for success/error feedback
- Automatic data refresh after successful registration

### 3. UI Integration

- **ResourceCard** - Added "Register" button that only shows for resources with `onchainStatus === "none"`
- **App.tsx** - Integrated modal with state management and callbacks

## What Needs to Be Completed

### XDR Signing Implementation

The `signXdr()` function in `RegisterModal.tsx` is currently a placeholder. You need to implement one of these approaches:

#### Option 1: Stellar SDK with Local Keypair
```typescript
import * as StellarSdk from '@stellar/stellar-sdk';

async function signXdr(unsignedXdr: string, networkPassphrase: string): Promise<string> {
  const transaction = new StellarSdk.Transaction(unsignedXdr, networkPassphrase);
  
  // Get keypair from secure storage (implement this based on your auth system)
  const secretKey = await getSecureUserSecret();
  const keypair = StellarSdk.Keypair.fromSecret(secretKey);
  
  transaction.sign(keypair);
  return transaction.toXDR();
}
```

Required package:
```bash
npm install @stellar/stellar-sdk
```

#### Option 2: WalletConnect Integration
For connecting to external wallets like Freighter or LOBSTR Vault:

```typescript
import WalletConnect from '@walletconnect/client';
import { SEP7Handler } from 'stellar-walletconnect';

async function signXdr(unsignedXdr: string, networkPassphrase: string): Promise<string> {
  // Initialize WalletConnect
  const connector = new WalletConnect({
    bridge: "https://bridge.walletconnect.org",
    // ... other config
  });

  // Request signature through connected wallet
  const signedXdr = await connector.signTransaction(unsignedXdr);
  return signedXdr;
}
```

#### Option 3: React Native Keychain for Secure Storage
Store the user's secret key securely using device keychain:

```bash
npm install react-native-keychain
```

```typescript
import * as Keychain from 'react-native-keychain';
import * as StellarSdk from '@stellar/stellar-sdk';

async function signXdr(unsignedXdr: string, networkPassphrase: string): Promise<string> {
  // Retrieve secret from keychain
  const credentials = await Keychain.getGenericPassword({ service: 'stellar-secret' });
  if (!credentials) {
    throw new Error('No wallet credentials found');
  }

  const keypair = StellarSdk.Keypair.fromSecret(credentials.password);
  const transaction = new StellarSdk.Transaction(unsignedXdr, networkPassphrase);
  transaction.sign(keypair);
  
  return transaction.toXDR();
}
```

## Testing the Implementation

### 1. Install Dependencies

```bash
npm install
```

### 2. Add Stellar SDK (if using Option 1 or 3)

```bash
npm install @stellar/stellar-sdk
```

### 3. Run the App

```bash
npm start
# Then press 'i' for iOS or 'a' for Android
```

### 4. Test Flow

1. Browse resources in the catalog
2. Find a resource with "not on-chain" badge
3. Tap the "Register" button
4. Modal opens and calls prepare endpoint
5. XDR signing occurs (once implemented)
6. Transaction submits to blockchain
7. Success screen shows with explorer link
8. Resource card updates to show "registered" status

## Explorer URLs

The implementation uses Stellar testnet by default:
- **Testnet**: `https://stellar.expert/explorer/testnet/tx/{txHash}`

For mainnet, update the explorer URL in `RegisterModal.tsx`:
```typescript
const explorerUrl = `https://stellar.expert/explorer/public/tx/${txHash}`;
```

## API Contract

### POST /resources/:id/register/prepare
**Response:**
```json
{
  "xdr": "AAAAAgAAAAD...",
  "networkPassphrase": "Test SDF Network ; September 2015"
}
```

### POST /resources/:id/register
**Request:**
```json
{
  "signedXdr": "AAAAAgAAAAD..."
}
```

**Response:**
```json
{
  "txHash": "abc123...",
  "success": true
}
```

## Security Considerations

1. **Never log or expose secret keys** - Use secure storage only
2. **Validate XDR before signing** - Parse and verify transaction details
3. **Use network passphrase** - Prevents replay attacks across networks
4. **Implement biometric authentication** - Before accessing secret keys
5. **Clear sensitive data** - After signing operations complete

## Next Steps

1. Choose and implement a signing approach (Options 1-3 above)
2. Implement secure key storage/retrieval
3. Add biometric authentication before signing
4. Test with Stellar testnet
5. Add transaction details preview before signing
6. Implement proper error codes from API responses
7. Add analytics/logging for registration events

## Branch

This implementation is on branch: `feature/mobile-registration-modal`

## Resources

- [Stellar SDK Documentation](https://stellar.github.io/js-stellar-sdk/)
- [Stellar Expert Explorer](https://stellar.expert/)
- [React Native Keychain](https://github.com/oblador/react-native-keychain)
- [WalletConnect Stellar Integration](https://docs.walletconnect.com/)
