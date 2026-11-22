/**
 * Network switcher with mainnet safeguard
 */

export type StellarNetwork = 'testnet' | 'mainnet';

interface NetworkConfig {
  name: string;
  rpcUrl: string;
  chainId: string;
  passphrase: string;
  isMainnet: boolean;
}

const NETWORKS: Record<StellarNetwork, NetworkConfig> = {
  testnet: {
    name: 'Stellar Testnet',
    rpcUrl: 'https://horizon-testnet.stellar.org',
    chainId: 'testnet',
    passphrase: 'Test SDF Network ; September 2015',
    isMainnet: false,
  },
  mainnet: {
    name: 'Stellar Mainnet',
    rpcUrl: 'https://horizon.stellar.org',
    chainId: 'mainnet',
    passphrase: 'Public Global Stellar Network ; September 2015',
    isMainnet: true,
  },
};

let currentNetwork: StellarNetwork = 'testnet';
let mainnetConfirmationTime = 0;

export function getCurrentNetwork(): StellarNetwork {
  return currentNetwork;
}

export function getNetworkConfig(network: StellarNetwork = currentNetwork): NetworkConfig {
  return NETWORKS[network];
}

export function switchNetwork(network: StellarNetwork, confirmed: boolean = false): boolean {
  if (network === 'mainnet' && !confirmed) {
    return false;
  }

  if (network === 'mainnet' && !isMainnetConfirmationValid()) {
    return false;
  }

  currentNetwork = network;
  return true;
}

export function requestMainnetAccess(): { confirmationRequired: boolean; timeRemaining?: number } {
  if (mainnetConfirmationTime > Date.now()) {
    return {
      confirmationRequired: false,
      timeRemaining: Math.ceil((mainnetConfirmationTime - Date.now()) / 1000),
    };
  }

  return { confirmationRequired: true };
}

export function confirmMainnetAccess(adminPassword: string): boolean {
  // In production, verify against secure backend
  const isValid = adminPassword && adminPassword.length > 0;

  if (isValid) {
    // Grant 1 hour of mainnet access
    mainnetConfirmationTime = Date.now() + 3600000;
    return true;
  }

  return false;
}

export function isMainnetConfirmationValid(): boolean {
  return mainnetConfirmationTime > Date.now();
}

export function isCurrentNetworkMainnet(): boolean {
  return currentNetwork === 'mainnet';
}

export function getNetworkList(): Array<{ id: StellarNetwork; name: string }> {
  return [
    { id: 'testnet', name: NETWORKS.testnet.name },
    { id: 'mainnet', name: NETWORKS.mainnet.name },
  ];
}

export async function validateNetworkConnection(network: StellarNetwork): Promise<boolean> {
  try {
    const config = NETWORKS[network];
    const response = await fetch(`${config.rpcUrl}/health`);
    return response.ok;
  } catch {
    return false;
  }
}
