import { MatchDetails } from './types';

export class MatchBuilder {
  private details: Partial<MatchDetails> = {};

  setPlayers(player1: string, player2: string): this {
    this.details.player1 = player1;
    this.details.player2 = player2;
    return this;
  }

  setAmount(amount: string): this {
    this.details.amount = amount;
    return this;
  }

  setGameInfo(gameType: string, gameId: string): this {
    this.details.gameType = gameType;
    this.details.gameId = gameId;
    return this;
  }

  build(): MatchDetails {
    return this.details as MatchDetails;
  }
}
