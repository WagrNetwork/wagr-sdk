import { describe, expect, it } from 'vitest';
import { retry } from '../adapters/retry';
import { createMatchBuilder } from '../builders/MatchBuilder';
import { formatAddress } from '../utils/formatters';
import { parseXLM } from '../utils/parsing';

describe('retry', () => {
  it('returns the result on first success', async () => {
    const result = await retry(async () => 'ok', 3, 1);
    expect(result).toBe('ok');
  });

  it('retries until success and then returns the result', async () => {
    let attempts = 0;
    const result = await retry(
      async () => {
        attempts += 1;
        if (attempts < 3) throw new Error('transient');
        return 'ok';
      },
      5,
      1,
    );
    expect(result).toBe('ok');
    expect(attempts).toBe(3);
  });

  it('throws the last error after exhausting attempts', async () => {
    await expect(
      retry(
        async () => {
          throw new Error('permanent');
        },
        2,
        1,
      ),
    ).rejects.toThrow('permanent');
  });
});

describe('MatchBuilder', () => {
  it('builds a match config with defaults applied', () => {
    const config = createMatchBuilder()
      .withPlayer1('G1')
      .withPlayer2('G2')
      .withAmount('10000000')
      .withAsset('CASSET')
      .withGameType('lichess')
      .withGameId('abc123')
      .build();

    expect(config.maxDisputes).toBe(1);
    expect(config.disputeWindowSecs).toBe(86400);
    expect(config.feeBps).toBe(50);
  });

  it('throws when required fields are missing', () => {
    expect(() => createMatchBuilder().withPlayer1('G1').build()).toThrow(
      /Missing required match configuration/,
    );
  });
});

describe('formatters/parsing', () => {
  it('formatAddress truncates the middle of an address', () => {
    expect(formatAddress('GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890')).toBe(
      'GABCDEFGHI...567890',
    );
  });

  it('parseXLM converts XLM to stroops', () => {
    expect(parseXLM(1)).toBe('10000000');
    expect(parseXLM(0.5)).toBe('5000000');
  });
});
