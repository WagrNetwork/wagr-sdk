// Feature 1: Match Creation Builder - Fluent API for creating matches

import { Keypair } from '@stellar/stellar-sdk';

export interface MatchConfig {
  player1: string;
  player2: string;
  amount: string;
  asset: string;
  gameType: 'lichess' | 'chesscom' | 'manual';
  gameId: string;
  maxDisputes?: number;
  disputeWindowSecs?: number;
  feeBps?: number;
}

export class MatchBuilder {
  private config: Partial<MatchConfig> = {};

  withPlayer1(address: string): this {
    this.config.player1 = address;
    return this;
  }

  withPlayer2(address: string): this {
    this.config.player2 = address;
    return this;
  }

  withAmount(amount: string): this {
    this.config.amount = amount;
    return this;
  }

  withAsset(asset: string): this {
    this.config.asset = asset;
    return this;
  }

  withGameType(gameType: 'lichess' | 'chesscom' | 'manual'): this {
    this.config.gameType = gameType;
    return this;
  }

  withGameId(gameId: string): this {
    this.config.gameId = gameId;
    return this;
  }

  withMaxDisputes(count: number): this {
    this.config.maxDisputes = count;
    return this;
  }

  withDisputeWindow(secs: number): this {
    this.config.disputeWindowSecs = secs;
    return this;
  }

  withFeeBps(bps: number): this {
    this.config.feeBps = bps;
    return this;
  }

  validate(): boolean {
    const required = ['player1', 'player2', 'amount', 'asset', 'gameType', 'gameId'];
    return required.every(field => this.config[field as keyof MatchConfig] !== undefined);
  }

  build(): MatchConfig {
    if (!this.validate()) {
      throw new Error('Missing required match configuration');
    }

    return {
      player1: this.config.player1!,
      player2: this.config.player2!,
      amount: this.config.amount!,
      asset: this.config.asset!,
      gameType: this.config.gameType!,
      gameId: this.config.gameId!,
      maxDisputes: this.config.maxDisputes || 1,
      disputeWindowSecs: this.config.disputeWindowSecs || 86400, // 24 hours
      feeBps: this.config.feeBps || 50,
    };
  }
}

export function createMatchBuilder(): MatchBuilder {
  return new MatchBuilder();
}
