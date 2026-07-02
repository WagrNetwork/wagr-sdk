import { Keypair } from '@stellar/stellar-sdk';

/**
 * Standard interface for game result adapters.
 * Implement this interface to add support for any game platform.
 */
export interface GameAdapter {
  /**
   * Fetch game result from platform API.
   * Throw if game not found or result is ambiguous.
   */
  getGameResult(gameId: string): Promise<GameOutcome>;

  /**
   * Sign and submit result to resolver contract.
   */
  submitResult(outcome: GameOutcome, keypair: Keypair): Promise<TransactionResult>;

  /**
   * Provide evidence for dispute resolution.
   * Called if a player disputes the result.
   */
  handleDispute(gameId: string): Promise<DisputeEvidence>;
}

export interface GameOutcome {
  gameId: string;
  winner: string; // G-address or username
  loser: string;
  reason: string; // 'checkmate', 'resignation', 'timeout', etc
  timestamp: number;
  proof?: Record<string, unknown>; // adapter-specific metadata
}

export interface DisputeEvidence {
  gameState: Record<string, unknown>; // final board state, move log, etc
  moveLog: string[]; // PGN or similar
  verification: Record<string, unknown>; // any additional proof
}

export interface TransactionResult {
  status: 'pending' | 'failed' | 'success';
  hash?: string;
  error?: string;
  data?: unknown;
}
