import { GameAdapter, GameOutcome, DisputeEvidence } from './interface';
import { Keypair } from '@stellar/stellar-sdk';

export abstract class BaseAdapter implements GameAdapter {
  protected name: string;

  constructor(name: string) {
    this.name = name;
  }

  abstract getGameResult(gameId: string): Promise<GameOutcome>;
  abstract submitResult(outcome: GameOutcome, keypair: Keypair): Promise<any>;
  abstract handleDispute(gameId: string): Promise<DisputeEvidence>;

  getName(): string {
    return this.name;
  }
}
