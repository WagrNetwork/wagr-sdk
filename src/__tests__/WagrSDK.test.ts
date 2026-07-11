import { describe, expect, it, vi, beforeEach } from 'vitest';

type MockCall = { method: string; args: Record<string, unknown> };

const calls: MockCall[] = [];
let nextResult: unknown;
let nextSigned = false;

vi.mock('@stellar/stellar-sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@stellar/stellar-sdk')>();

  class MockAssembledTransaction {
    constructor(public result: unknown) {}
    async signAndSend() {
      nextSigned = true;
      return { result: this.result };
    }
  }

  function makeClient() {
    return new Proxy(
      {} as Record<string, unknown>,
      {
        get(target, prop) {
          if (prop in target) return target[prop as string];
          // Exclude `then`/symbols so this Proxy isn't mistaken for a thenable
          // when returned from an async function (it would hang forever).
          if (prop === 'then' || typeof prop === 'symbol') return undefined;
          return async (args: Record<string, unknown>) => {
            calls.push({ method: prop as string, args });
            return new MockAssembledTransaction(nextResult);
          };
        },
      },
    );
  }

  return {
    ...actual,
    contract: {
      ...actual.contract,
      Client: {
        from: vi.fn(async () => makeClient()),
      },
      basicNodeSigner: vi.fn(() => ({
        signTransaction: vi.fn(),
        signAuthEntry: vi.fn(),
      })),
    },
  };
});

const { WagrSDK } = await import('../core/WagrSDK');
const { ConfigError } = await import('../utils/errors');
const { Keypair } = await import('@stellar/stellar-sdk');

const baseConfig = {
  escrowContractId: 'CESCROW',
  resolverContractId: 'CRESOLVER',
  payoutContractId: 'CPAYOUT',
  rpcUrl: 'https://rpc.example.test',
  networkPassphrase: 'Test SDF Network ; September 2015',
};

beforeEach(() => {
  calls.length = 0;
  nextResult = undefined;
  nextSigned = false;
});

describe('WagrSDK config validation', () => {
  it('throws ConfigError when contract ids are missing', () => {
    expect(
      () =>
        new WagrSDK({
          ...baseConfig,
          escrowContractId: '',
        }),
    ).toThrow(ConfigError);
  });

  it('throws ConfigError when rpcUrl is missing', () => {
    expect(
      () =>
        new WagrSDK({
          ...baseConfig,
          rpcUrl: '',
        }),
    ).toThrow(ConfigError);
  });

  it('constructs successfully with valid config', () => {
    expect(() => new WagrSDK(baseConfig)).not.toThrow();
  });
});

describe('WagrSDK match lifecycle', () => {
  it('createMatch stakes player1 into escrow and returns a pending match', async () => {
    const sdk = new WagrSDK(baseConfig);
    const player1 = Keypair.random();

    const result = await sdk.createMatch(
      {
        player1: player1.publicKey(),
        player2: 'GPLAYER2',
        amount: '10000000',
        asset: 'CASSET',
        gameType: 'lichess',
        gameId: 'abc123',
      },
      player1,
    );

    expect(result.status).toBe('success');
    expect(result.data?.players).toEqual([player1.publicKey()]);
    expect(result.data?.status).toBe('pending');
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('stake');
    expect(calls[0].args.amount).toBe(10000000n);
    expect(nextSigned).toBe(true);
  });

  it('createMatch returns a failed TransactionResult on contract error', async () => {
    calls.length = 0;
    const sdk = new WagrSDK(baseConfig);
    const player1 = Keypair.random();

    // Force the mocked client to throw by making signAndSend reject.
    const client = await sdk.getClient('escrow', player1);
    (client as any).stake = async () => {
      throw new Error('simulation failed');
    };

    const result = await sdk.createMatch(
      {
        player1: player1.publicKey(),
        player2: 'GPLAYER2',
        amount: '10000000',
        asset: 'CASSET',
        gameType: 'lichess',
        gameId: 'abc123',
      },
      player1,
    );

    expect(result.status).toBe('failed');
    expect(result.error).toBeTruthy();
  });

  it('getFeeBalance performs a read-only call (no signAndSend)', async () => {
    nextResult = 5_000_000n;
    const sdk = new WagrSDK(baseConfig);

    const balance = await sdk.getFeeBalance('CASSET');

    expect(balance).toBe('5000000');
    expect(nextSigned).toBe(false);
    expect(calls[0].method).toBe('get_fee_balance');
  });

  it('getMatch reports pending status when no result has been submitted yet', async () => {
    const sdk = new WagrSDK(baseConfig);
    nextResult = undefined;

    // First call: get_match_players. Second: query_stake_balance. Third: query_result_status (should fail).
    const escrowClient = await sdk.getClient('escrow');
    (escrowClient as any).get_match_players = async () => ({ result: ['GPLAYER1'] });
    (escrowClient as any).query_stake_balance = async () => ({ result: 10_000_000n });
    const resolverClient = await sdk.getClient('resolver');
    (resolverClient as any).query_result_status = async () => {
      throw new Error('no result');
    };

    const match = await sdk.getMatch('match1');

    expect(match.players).toEqual(['GPLAYER1']);
    expect(match.stakes.GPLAYER1).toBe('10000000');
    expect(match.status).toBe('pending');
  });

  it('accepts a wallet-style signer (no private key) for browser wallet flows', async () => {
    const sdk = new WagrSDK(baseConfig);
    const walletSignTransaction = vi.fn(async (xdr: string) => xdr);

    const result = await sdk.createMatch(
      {
        player1: 'GWALLETUSER',
        player2: 'GPLAYER2',
        amount: '10000000',
        asset: 'CASSET',
        gameType: 'lichess',
        gameId: 'abc123',
      },
      { publicKey: 'GWALLETUSER', signTransaction: walletSignTransaction },
    );

    expect(result.status).toBe('success');
    expect(calls[0].method).toBe('stake');
    expect(nextSigned).toBe(true);
  });
});
