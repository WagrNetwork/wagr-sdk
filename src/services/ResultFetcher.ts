// Feature 2: Result Fetching Pipeline - Fetch results from game platforms

export interface GameResult {
  gameId: string;
  winner: string;
  loser: string;
  reason: string;
  timestamp: number;
  proof?: Record<string, unknown>;
}

export interface FetchOptions {
  timeout?: number;
  retries?: number;
  backoffMs?: number;
}

export class ResultFetcher {
  private apiUrl: string;
  private gameType: string;

  constructor(apiUrl: string, gameType: string) {
    this.apiUrl = apiUrl;
    this.gameType = gameType;
  }

  async fetchResult(gameId: string, options: FetchOptions = {}): Promise<GameResult> {
    const { timeout = 5000, retries = 3 } = options;

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const result = await this.executeWithTimeout(
          this.fetchFromAPI(gameId),
          timeout,
        );
        return result;
      } catch (error) {
        if (attempt === retries - 1) throw error;
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }

    throw new Error(`Failed to fetch result for game ${gameId}`);
  }

  private async fetchFromAPI(gameId: string): Promise<GameResult> {
    const endpoint = `${this.apiUrl}/api/games/${gameId}`;
    const response = await fetch(endpoint);

    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }

    const data = await response.json();
    return this.parseResult(data);
  }

  private parseResult(data: any): GameResult {
    const winner = data.winner || data.players?.[0];
    const loser = data.loser || data.players?.[1];

    return {
      gameId: data.id,
      winner,
      loser,
      reason: data.terminationReason || 'completed',
      timestamp: data.endTime || Date.now() / 1000,
      proof: data.moves ? { moves: data.moves } : undefined,
    };
  }

  private executeWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('Fetch timeout')), timeoutMs),
      ),
    ]);
  }

  async validateResult(result: GameResult): Promise<boolean> {
    // Verify result integrity
    if (!result.gameId || !result.winner || !result.loser) {
      return false;
    }

    if (result.winner === result.loser) {
      return false;
    }

    return true;
  }

  async fetchBatch(gameIds: string[]): Promise<GameResult[]> {
    return Promise.all(gameIds.map(id => this.fetchResult(id)));
  }
}

export function createResultFetcher(apiUrl: string, gameType: string): ResultFetcher {
  return new ResultFetcher(apiUrl, gameType);
}
