import { Keypair, Server, Transaction } from 'stellar-sdk';

/**
 * Testnet funding helper using Friendbot and USDC trustline
 */

const FRIENDBOT_URL = 'https://friendbot.stellar.org';
const TESTNET_USDC = 'CBBD034Z3GTSXWJGESRXTSJE7ZB2QG4VNZVVLLNGW2FCBLJN7FLDLN7E';
const TESTNET_ISSUER = 'GBUQWP3BOUZX34ULNQG23RQ6F4BVWCIYU2IAMRU5MPJUJJZI7DNVMD56';

export async function fundAccountWithFriendbot(publicKey: string): Promise<boolean> {
  try {
    const response = await fetch(`${FRIENDBOT_URL}?addr=${encodeURIComponent(publicKey)}`);
    return response.ok;
  } catch {
    return false;
  }
}

export async function addUSDCTrustline(
  keypair: Keypair,
  server: Server
): Promise<string> {
  const account = await server.loadAccount(keypair.publicKey());

  const transaction = new Transaction(
    {
      fee: 100,
      account,
      networkPassphrase: 'Test SDF Network ; September 2015',
      timebounds: {
        minTime: 0,
        maxTime: Math.floor(Date.now() / 1000) + 300,
      },
    },
    null
  ).addOperation({
    type: 'changeTrust',
    asset: {
      code: 'USDC',
      issuer: TESTNET_ISSUER,
    },
  }).build();

  transaction.sign(keypair);
  const result = await server.submitTransaction(transaction);
  return result.id;
}

export async function fundTestnetAccount(
  keypair: Keypair,
  server: Server
): Promise<{ friendbotSuccess: boolean; trustlineHash?: string }> {
  const friendbotSuccess = await fundAccountWithFriendbot(keypair.publicKey());

  if (!friendbotSuccess) {
    return { friendbotSuccess: false };
  }

  try {
    const trustlineHash = await addUSDCTrustline(keypair, server);
    return { friendbotSuccess: true, trustlineHash };
  } catch {
    return { friendbotSuccess: true };
  }
}
