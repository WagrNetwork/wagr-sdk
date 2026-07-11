import { describe, expect, it, vi, beforeEach } from 'vitest';
import { LichessAdapter } from '../adapters/lichess';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body };
}

const sdkStub = { submitResult: vi.fn() } as any;

beforeEach(() => {
  fetchMock.mockReset();
  sdkStub.submitResult.mockReset();
});

describe('LichessAdapter', () => {
  it('maps a white-win game to a GameOutcome with the correct winner/loser', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        status: 'mate',
        winner: 'white',
        pgn: '1. e4 e5',
        clock: {},
        players: {
          white: { user: { name: 'alice' } },
          black: { user: { name: 'bob' } },
        },
      }),
    );

    const adapter = new LichessAdapter(sdkStub);
    const outcome = await adapter.getGameResult('abc123');

    expect(outcome.winner).toBe('alice');
    expect(outcome.loser).toBe('bob');
    expect(outcome.reason).toBe('checkmate');
  });

  it('throws a descriptive error when the game is not found', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, false));

    const adapter = new LichessAdapter(sdkStub);
    await expect(adapter.getGameResult('missing')).rejects.toThrow(/Failed to fetch Lichess game/);
  });

  it('submitResult signs the outcome and delegates to the SDK', async () => {
    sdkStub.submitResult.mockResolvedValue({ status: 'success' });
    const adapter = new LichessAdapter(sdkStub);

    const { Keypair } = await import('@stellar/stellar-sdk');
    const keypair = Keypair.random();

    const outcome = {
      gameId: 'abc123',
      winner: 'alice',
      loser: 'bob',
      reason: 'checkmate',
      timestamp: 1234,
    };

    const result = await adapter.submitResult(outcome, keypair);

    expect(result.status).toBe('success');
    expect(sdkStub.submitResult).toHaveBeenCalledWith(
      'abc123',
      expect.objectContaining({ winner: 'alice', loser: 'bob' }),
      keypair,
    );
  });
});
