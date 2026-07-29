jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('@stellar/stellar-sdk', () => {
  // Deterministic fake ed25519 public key for testing
  const VALID_PUBLIC_KEY = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7';

  return {
    Keypair: {
      fromSecret: jest.fn(() => ({})),
      random: jest.fn(() => ({
        publicKey: jest.fn(() => VALID_PUBLIC_KEY),
      })),
    },
    StrKey: {
      isValidEd25519PublicKey: jest.fn((key) => {
        // Only accept the exact known-valid key to properly test checksum rejection
        return key === VALID_PUBLIC_KEY;
      }),
    },
    Transaction: jest.fn(),
  };
});
