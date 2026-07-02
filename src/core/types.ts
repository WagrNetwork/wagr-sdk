export interface MatchDetails {
  matchId: string;
  player1: string;
  player2: string;
  amount: string;
  asset: string;
  gameType: string;
  gameId: string;
  createdAt: number;
}

export interface ResultData {
  gameId: string;
  winner: string;
  loser: string;
  reason: string;
  timestamp: number;
}

export interface PayoutDetails {
  matchId: string;
  winner: string;
  amount: string;
  fee: string;
}
