# Wagr SDK

[![npm](https://img.shields.io/npm/v/@stellar/wagr-sdk)](https://www.npmjs.com/package/@stellar/wagr-sdk)
[![TypeScript](https://img.shields.io/badge/typescript-5.0-blue)](https://www.typescriptlang.org/)
[![Soroban](https://img.shields.io/badge/soroban-protocol-purple)](https://soroban.stellar.org/)

TypeScript SDK for Wagr Protocol — orchestrate matches, submit results via game adapters, and settle outcomes on Soroban.

## Overview

Wagr SDK provides:

1. **WagrSDK** — Core client for creating matches, querying state, and managing settlements
2. **Adapter Interface** — Standardized pattern for result ingestion from any game platform
3. **Built-in Adapters** — Lichess (M1), Chess.com (M2), Manual (M2)

### Architecture

```
Your App
    ↓
WagrSDK + GameAdapter
    ↓
Soroban Contracts (escrow, resolver, payout)
    ↓
Stellar Blockchain
```

## Installation

```bash
npm install @stellar/wagr-sdk @stellar/stellar-sdk
```

## Quick Start

### Basic Setup

```ts
import { WagrSDK } from '@stellar/wagr-sdk';
import { Networks } from '@stellar/stellar-sdk';

const sdk = new WagrSDK({
  escrowContractId: 'CA...',
  resolverContractId: 'CB...',
  payoutContractId: 'CC...',
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: Networks.TESTNET_NETWORK_PASSPHRASE,
});
```

### Create a Match

```ts
import { Keypair } from '@stellar/stellar-sdk';

const player1 = Keypair.fromSecret(process.env.PLAYER1_SECRET!);
const player2Address = 'G...';

const match = await sdk.createMatch(
  {
    player1: player1.publicKey(),
    player2: player2Address,
    amount: '10000000', // 1 XLM (7 decimals)
    asset: 'CD...', // XLM asset contract
    gameType: 'lichess',
    gameId: 'abc123def456',
  },
  player1,
);

console.log('Match ID:', match.matchId);
console.log('Status:', match.status); // 'pending' | 'failed'
```

### Submit Result (Auto)

```ts
import { LichessAdapter } from '@stellar/wagr-sdk/adapters/lichess';

const adapter = new LichessAdapter(sdk);

// Auto-fetches from Lichess API and submits to resolver
const result = await adapter.submitResult(
  { gameId: 'abc123def456' },
  oracleKeypair,
);

console.log('Result submitted:', result.txHash);
```

### Dispute & Finalize

```ts
// Player 2 can dispute during 24h window
const dispute = await sdk.disputeResult(
  {
    matchId: match.matchId,
    evidence: {
      screenshotUrl: 'https://...',
      explanation: 'Invalid move on turn 15',
    },
  },
  player2Keypair,
);

// After dispute window (or if no dispute), finalize
const final = await sdk.finalizeMatch(match.matchId);
console.log('Winner:', final.winner);
console.log('Amount:', final.amount);
```

### Withdraw Winnings

```ts
const withdrawal = await sdk.withdrawWinnings(
  {
    matchId: match.matchId,
    winner: player1.publicKey(),
  },
  player1,
);

console.log('Withdrawn:', withdrawal.txHash);
```

## Adapter Interface

Implement this interface to add support for any game platform:

```ts
interface GameAdapter {
  /**
   * Fetch game result from platform API.
   * Throw if game not found or result is ambiguous.
   */
  getGameResult(gameId: string): Promise<GameOutcome>;

  /**
   * Sign and submit result to resolver contract.
   */
  submitResult(
    outcome: GameOutcome,
    keypair: Keypair,
  ): Promise<TransactionResult>;

  /**
   * Provide evidence for dispute resolution.
   * Called if a player disputes the result.
   */
  handleDispute(gameId: string): Promise<DisputeEvidence>;
}

interface GameOutcome {
  gameId: string;
  winner: string; // G-address or username
  loser: string;
  reason: string; // 'checkmate', 'resignation', 'timeout', etc
  timestamp: number;
  proof?: Record<string, unknown>; // adapter-specific metadata
}

interface DisputeEvidence {
  gameState: Record<string, unknown>; // final board state, move log, etc
  moveLog: string[]; // PGN or similar
  verification: Record<string, unknown>; // any additional proof
}
```

## Built-in Adapters

### Lichess Adapter

```ts
import { LichessAdapter } from '@stellar/wagr-sdk/adapters/lichess';

const adapter = new LichessAdapter(sdk, {
  lichessApiUrl: 'https://lichess.org/api',
  pollInterval: 5000, // poll every 5s
});

const result = await adapter.getGameResult('abc123def456');
// → { winner: 'player1', loser: 'player2', reason: 'checkmate' }

const txResult = await adapter.submitResult(result, oracleKeypair);
```

**Coverage:** Chess, public API, no auth required. Status: M1 (stable).

### Chess.com Adapter

```ts
import { ChesscomAdapter } from '@stellar/wagr-sdk/adapters/chesscom';

const adapter = new ChesscomAdapter(sdk, {
  chesscomApiUrl: 'https://www.chess.com/api',
});

const result = await adapter.getGameResult('player1-vs-player2-uuid');
```

**Coverage:** Chess, public API, requires manual account linking. Status: M2 (planned).

### Manual Adapter

```ts
import { ManualAdapter } from '@stellar/wagr-sdk/adapters/manual';

const adapter = new ManualAdapter(sdk);

// For games with no API (COD, Fortnite, Street Fighter, etc)
const result = await adapter.submitResult(
  {
    gameId: 'match-123',
    winner: 'player1',
    loser: 'player2',
    evidence: {
      screenshotUrl: 'https://...',
      description: 'Victory screen shows player1 as winner',
    },
  },
  submitterKeypair,
);

// Player 2 can dispute with their own evidence
```

**Coverage:** Any game, self-report + 24h dispute window. Status: M2 (planned).

## API Reference

### WagrSDK

#### createMatch

```ts
createMatch(
  options: CreateMatchOptions,
  signer: Keypair,
): Promise<TransactionResult<Match>>
```

Creates a new match. Player 1 stakes and awaits Player 2 stake. Returns match ID or error.

#### submitResult

```ts
submitResult(
  matchId: string,
  outcome: GameOutcome,
  signer: Keypair,
): Promise<TransactionResult>
```

Direct result submission (without adapter). Used by oracles or custom logic.

#### disputeResult

```ts
disputeResult(
  options: DisputeOptions,
  signer: Keypair,
): Promise<TransactionResult>
```

File a dispute during the 24h window. Must include evidence.

#### finalizeMatch

```ts
finalizeMatch(matchId: string): Promise<MatchOutcome>
```

Query whether dispute window has closed and result is final. Throws if not finalized.

#### withdrawWinnings

```ts
withdrawWinnings(
  options: WithdrawalOptions,
  signer: Keypair,
): Promise<TransactionResult>
```

Transfer winner's payout to their account.

#### getMatch

```ts
getMatch(matchId: string): Promise<Match>
```

Query match details (players, amount, status, created_at).

#### getPlayerMatches

```ts
getPlayerMatches(
  playerAddress: string,
  filter?: { status: 'active' | 'completed' | 'disputed' },
): Promise<Match[]>
```

List all matches for a player.

#### getDisputeStatus

```ts
getDisputeStatus(matchId: string): Promise<DisputeStatus>
```

Query dispute details (status, evidence, resolution).

### Error Handling

All mutating methods return `TransactionResult`:

```ts
interface TransactionResult<T = unknown> {
  status: 'pending' | 'failed' | 'success';
  hash?: string;
  error?: string;
  data?: T;
}
```

Never throws. Always check `status`:

```ts
const result = await sdk.createMatch(options, player1);

if (result.status === 'failed') {
  console.error('Match creation failed:', result.error);
} else if (result.status === 'pending') {
  console.log('Submitted, poll for confirmation:', result.hash);
} else {
  console.log('Match created:', result.data.matchId);
}
```

Read-only methods throw on RPC/contract error:

```ts
try {
  const match = await sdk.getMatch('match-uuid');
} catch (err) {
  console.error('Query failed:', err);
}
```

## Examples

### End-to-End Match (Lichess)

```ts
import { WagrSDK, LichessAdapter } from '@stellar/wagr-sdk';
import { Keypair } from '@stellar/stellar-sdk';

const sdk = new WagrSDK({ /* config */ });
const player1 = Keypair.fromSecret(process.env.PLAYER1_SECRET!);
const player2Addr = 'G...';

// 1. Create match
const match = await sdk.createMatch(
  {
    player1: player1.publicKey(),
    player2: player2Addr,
    amount: '10000000',
    asset: 'CD...',
    gameType: 'lichess',
    gameId: 'abc123def456',
  },
  player1,
);
console.log('✓ Match created:', match.matchId);

// 2. Players play on Lichess (off-chain)
console.log('→ Players play game...');
await new Promise(resolve => setTimeout(resolve, 5000));

// 3. Submit result
const adapter = new LichessAdapter(sdk);
const result = await adapter.submitResult(
  { gameId: 'abc123def456' },
  player1, // oracle keypair
);
console.log('✓ Result submitted:', result.txHash);

// 4. Wait for finalization (or dispute window)
await new Promise(resolve => setTimeout(resolve, 2000));
const final = await sdk.finalizeMatch(match.matchId);
console.log('✓ Match finalized, winner:', final.winner);

// 5. Withdraw
const withdrawal = await sdk.withdrawWinnings(
  { matchId: match.matchId, winner: player1.publicKey() },
  player1,
);
console.log('✓ Winnings withdrawn:', withdrawal.txHash);
```

### Custom Adapter (Street Fighter Tournament)

```ts
import { GameAdapter, GameOutcome } from '@stellar/wagr-sdk';

class StreetFighterAdapter implements GameAdapter {
  async getGameResult(matchId: string): Promise<GameOutcome> {
    const result = await fetch(
      `https://sfapi.example.com/matches/${matchId}`,
    ).then(r => r.json());

    return {
      gameId: matchId,
      winner: result.winner,
      loser: result.loser,
      reason: result.winCondition,
      timestamp: result.endedAt,
      proof: {
        replayUrl: result.replayUrl,
        finalRound: result.finalRound,
      },
    };
  }

  async submitResult(outcome: GameOutcome, keypair: Keypair) {
    // Sign and submit to resolver
    return this.sdk.submitResult(outcome.gameId, outcome, keypair);
  }

  async handleDispute(gameId: string): Promise<DisputeEvidence> {
    const replay = await fetch(
      `https://sfapi.example.com/matches/${gameId}/replay`,
    ).then(r => r.json());

    return {
      gameState: replay.finalState,
      moveLog: replay.inputLog,
      verification: { replayHash: replay.hash },
    };
  }
}
```

## Testing

```bash
npm test
```

Run specific test suite:
```bash
npm test -- adapter.lichess
npm test -- match-lifecycle
```

## Configuration

Set environment variables in `.env`:

```
SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
NETWORK_PASSPHRASE=Test SDF Network ; September 2015
ESCROW_CONTRACT_ID=CA...
RESOLVER_CONTRACT_ID=CB...
PAYOUT_CONTRACT_ID=CC...
```

Or pass to constructor:

```ts
const sdk = new WagrSDK({
  escrowContractId: process.env.ESCROW_CONTRACT_ID!,
  resolverContractId: process.env.RESOLVER_CONTRACT_ID!,
  payoutContractId: process.env.PAYOUT_CONTRACT_ID!,
  rpcUrl: process.env.SOROBAN_RPC_URL!,
  networkPassphrase: process.env.NETWORK_PASSPHRASE!,
});
```

## Contributing

Issues and PRs welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

MIT

## Related

- [wagr-contracts](https://github.com/stellar/wagr-contracts) — Core Soroban smart contracts
- [wagr-app](https://github.com/stellar/wagr-app) — Frontend for match lobby and UI
