import { Keypair } from '@stellar/stellar-sdk';
import { GameAdapter, GameOutcome, DisputeEvidence, TransactionResult } from '../../core/GameAdapter.js';
import { WagrSDK } from '../../core/WagrSDK.js';

interface LichessPlayer {
  user?: { name: string; id: string };
  id?: string;
  rating?: number;
}

interface LichessGame {
  id: string;
  status: string;
  winner?: 'white' | 'black';
  pgn: string;
  fen?: string;
  moves?: string;
  clock?: unknown;
  players: {
    white: LichessPlayer;
    black: LichessPlayer;
  };
}

export interface LichessAdapterConfig {
  lichessApiUrl?: string;
  pollInterval?: number;
}

/**
 * Lichess adapter for chess games.
 * Fetches game results from Lichess API and submits to Wagr resolver.
 */
export class LichessAdapter implements GameAdapter {
  private sdk: WagrSDK;
  private lichessApiUrl: string;
  private pollInterval: number;

  constructor(sdk: WagrSDK, config: LichessAdapterConfig = {}) {
    this.sdk = sdk;
    this.lichessApiUrl = config.lichessApiUrl || 'https://lichess.org/api';
    this.pollInterval = config.pollInterval || 5000;
  }

  /**
   * Fetch a game result from Lichess API.
   */
  async getGameResult(gameId: string): Promise<GameOutcome> {
    try {
      const response = await fetch(`${this.lichessApiUrl}/games/${gameId}`, {
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`Game not found: ${gameId}`);
      }

      const game = (await response.json()) as LichessGame;

      // Map Lichess game to GameOutcome
      const winner = game.players.white.user?.name || game.players.white.id || '';
      const loser = game.players.black.user?.name || game.players.black.id || '';
      const reason = this.getWinReason(game);

      return {
        gameId,
        winner: game.status === 'mate' && game.winner === 'white' ? winner : loser,
        loser: game.status === 'mate' && game.winner === 'white' ? loser : winner,
        reason,
        timestamp: Math.floor(Date.now() / 1000),
        proof: {
          pgn: game.pgn,
          elo: {
            white: game.players.white.rating,
            black: game.players.black.rating,
          },
          timeControl: game.clock,
        },
      };
    } catch (err: any) {
      throw new Error(`Failed to fetch Lichess game: ${err.message}`);
    }
  }

  /**
   * Sign and submit result to resolver contract.
   */
  async submitResult(
    outcome: GameOutcome,
    keypair: Keypair,
  ): Promise<TransactionResult> {
    try {
      // Sign the outcome
      const signature = this.signOutcome(outcome, keypair);

      // Submit via SDK
      const result = await this.sdk.submitResult(
        outcome.gameId,
        {
          ...outcome,
          proof: {
            ...outcome.proof,
            signature,
          },
        },
        keypair,
      );

      return result;
    } catch (err: any) {
      return {
        status: 'failed',
        error: err.message,
      };
    }
  }

  /**
   * Provide evidence for dispute (full game PGN and metadata).
   */
  async handleDispute(gameId: string): Promise<DisputeEvidence> {
    try {
      const response = await fetch(`${this.lichessApiUrl}/games/${gameId}`, {
        headers: { Accept: 'application/x-ndjson' },
      });

      if (!response.ok) {
        throw new Error(`Game not found: ${gameId}`);
      }

      const game = (await response.json()) as LichessGame;

      return {
        gameState: {
          finalFen: game.fen,
          moves: game.moves,
          status: game.status,
        },
        moveLog: game.pgn.split('\n').filter((line: string) => line && !line.startsWith('[')),
        verification: {
          lichessUrl: `https://lichess.org/${gameId}`,
          apiTimestamp: Math.floor(Date.now() / 1000),
        },
      };
    } catch (err: any) {
      throw new Error(`Failed to fetch dispute evidence: ${err.message}`);
    }
  }

  /**
   * Poll for a game result until available.
   */
  async pollForResult(gameId: string, maxAttempts: number = 360): Promise<GameOutcome> {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const result = await this.getGameResult(gameId);
        if (result && result.winner) {
          return result;
        }
      } catch (err) {
        // Game not finished yet
      }

      if (i < maxAttempts - 1) {
        await new Promise(resolve => setTimeout(resolve, this.pollInterval));
      }
    }

    throw new Error(`Game ${gameId} did not finish within timeout`);
  }

  private getWinReason(game: LichessGame): string {
    if (game.status === 'mate') {
      return 'checkmate';
    } else if (game.status === 'resign') {
      return 'resignation';
    } else if (game.status === 'timeout') {
      return 'timeout';
    } else if (game.status === 'draw') {
      return 'draw';
    }
    return 'unknown';
  }

  /** Ed25519-sign the canonical outcome data; returns a base64-encoded signature. */
  private signOutcome(outcome: GameOutcome, keypair: Keypair): string {
    const data = JSON.stringify({
      gameId: outcome.gameId,
      winner: outcome.winner,
      loser: outcome.loser,
      reason: outcome.reason,
      timestamp: outcome.timestamp,
    });

    return keypair.sign(Buffer.from(data)).toString('base64');
  }
}
