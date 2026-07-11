# Wagr SDK

[![npm](https://img.shields.io/npm/v/@wagrnetwork/wagr-sdk)](https://www.npmjs.com/package/@wagrnetwork/wagr-sdk)
[![TypeScript](https://img.shields.io/badge/typescript-5.0-blue)](https://www.typescriptlang.org/)
[![Soroban](https://img.shields.io/badge/soroban-protocol-purple)](https://soroban.stellar.org/)

TypeScript SDK for Wagr Protocol — orchestrate matches, submit results via game adapters, and settle outcomes on Soroban.

## Overview

Wagr SDK provides:

1. **WagrSDK** — Core client wrapping the escrow, resolver, and payout contracts
2. **GameAdapter interface** — Standardized pattern for result ingestion from any game platform
3. **Lichess adapter** — Built-in adapter for chess games played on Lichess

`WagrSDK` uses `@stellar/stellar-sdk`'s `contract.Client`, which reads each
contract's method spec directly from the chain. There is no separate
code-generation step to keep in sync with the deployed contracts.

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
npm install @wagrnetwork/wagr-sdk @stellar/stellar-sdk
```

## Quick Start

### Basic Setup

```ts
import { WagrSDK } from '@wagrnetwork/wagr-sdk';
import { Networks } from '@stellar/stellar-sdk';

const sdk = new WagrSDK({
  escrowContractId: 'CA...',
  resolverContractId: 'CB...',
  payoutContractId: 'CC...',
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: Networks.TESTNET,
});
```

### Create and join a match

Matches don't have a separate "create" step on-chain — a match exists once
its first player stakes into escrow (2–8 players per match are supported).

```ts
import { Keypair } from '@stellar/stellar-sdk';

const player1 = Keypair.fromSecret(process.env.PLAYER1_SECRET!);
const player2 = Keypair.fromSecret(process.env.PLAYER2_SECRET!);

const created = await sdk.createMatch(
  {
    player1: player1.publicKey(),
    player2: player2.publicKey(),
    amount: '10000000', // stroops (1 XLM = 10,000,000 stroops)
    asset: 'CD...', // token contract id
    gameType: 'lichess',
    gameId: 'abc123def456',
  },
  player1,
);

if (created.status === 'failed') throw new Error(created.error);
const matchId = created.data!.matchId;

await sdk.joinMatch(matchId, player2.publicKey(), '10000000', 'CD...', player2);
```

### Submit a result via the Lichess adapter

```ts
import { LichessAdapter } from '@wagrnetwork/wagr-sdk';

const adapter = new LichessAdapter(sdk);
const outcome = await adapter.getGameResult('abc123def456');
const result = await adapter.submitResult(outcome, oracleKeypair);

if (result.status === 'failed') throw new Error(result.error);
```

### Dispute and finalize

```ts
// The recorded loser can dispute during the 24h window. The resolver
// contract requires the loser's own signature — `signer` must be them.
await sdk.disputeResult(
  { matchId, evidence: 'Invalid move accepted on turn 15' },
  player2,
);

// After the dispute window closes, anyone can finalize (they just pay the tx fee).
const final = await sdk.finalizeMatch(matchId, player1);
console.log('Winner:', final.winner);

// Settlement is a separate step, gated to the payout contract's arbiter.
await sdk.settleWinnerTakeAll(matchId, final.winner, '20000000', 'CD...', arbiterKeypair);
```

### Withdraw winnings

```ts
const withdrawal = await sdk.withdrawWinnings(
  { matchId, player: player1.publicKey(), asset: 'CD...' },
  player1,
);
console.log('Withdrawn (stroops):', withdrawal.data);
```

## Adapter interface

Implement this interface to add support for any game platform:

```ts
interface GameAdapter {
  /** Fetch game result from the platform API. Throw if not found/ambiguous. */
  getGameResult(gameId: string): Promise<GameOutcome>;

  /** Sign and submit the result via the SDK. */
  submitResult(outcome: GameOutcome, keypair: Keypair): Promise<TransactionResult>;

  /** Provide evidence for dispute resolution. */
  handleDispute(gameId: string): Promise<DisputeEvidence>;
}
```

### Lichess adapter

```ts
import { LichessAdapter } from '@wagrnetwork/wagr-sdk';

const adapter = new LichessAdapter(sdk, {
  lichessApiUrl: 'https://lichess.org/api',
  pollInterval: 5000, // ms, used by pollForResult()
});

const outcome = await adapter.getGameResult('abc123def456');
// → { gameId, winner, loser, reason: 'checkmate' | 'resignation' | ..., proof: { pgn, elo, timeControl } }

await adapter.submitResult(outcome, oracleKeypair);
```

Only Lichess is implemented today. To support another platform (Chess.com,
manual self-report, etc.), implement `GameAdapter` yourself — see the
example below.

## API reference

All mutating `WagrSDK` methods return a `TransactionResult` and never throw —
check `status` instead:

```ts
interface TransactionResult<T = unknown> {
  status: 'success' | 'failed';
  hash?: string;
  error?: string;
  data?: T;
}
```

Read-only queries (`getMatch`, `getFeeBalance`, `getTotalEscrow`,
`getDisputeStatus`) throw a `ContractCallError` on RPC/contract failure.

| Method | Contract | Notes |
|---|---|---|
| `createMatch(options, signer)` | escrow | Generates a match ID, stakes player1 |
| `joinMatch(matchId, player, amount, asset, signer)` | escrow | Stakes an additional player (2–8 total) |
| `timeoutRefund(matchId, player, asset, signer)` | escrow | Refund after 24h if the match never finalized |
| `getMatch(matchId)` | escrow + resolver | Players, stakes, and result status |
| `getTotalEscrow()` | escrow | Total currently held across all matches |
| `submitResult(matchId, outcome, signer)` | resolver | Direct submission without an adapter |
| `disputeResult({matchId, evidence}, signer)` | resolver | `signer` must be the recorded loser |
| `finalizeMatch(matchId, submitter)` | resolver | Callable by anyone once the window closes |
| `getDisputeStatus(matchId)` | resolver | Status + latest evidence, if any |
| `settleWinnerTakeAll(...)` / `settleSplit(...)` | payout | Arbiter-only |
| `withdrawWinnings({matchId, player, asset}, signer)` | payout | |
| `withdrawFees(asset, signer)` | payout | Fee collector-only |
| `getFeeBalance(asset)` | payout | |
| `getClient(name, signer?)` | any | Raw `contract.Client` for admin ops (`pause`, `set_admin`, `upgrade`, …) not otherwise wrapped |
| `subscribeToEvents(options)` / `stopEventSubscription()` | all | Polls `getEvents` and emits `'event'` / `'error'` |

## Custom adapter example

```ts
import { GameAdapter, GameOutcome, DisputeEvidence } from '@wagrnetwork/wagr-sdk';
import { Keypair } from '@stellar/stellar-sdk';

class StreetFighterAdapter implements GameAdapter {
  constructor(private sdk: WagrSDK) {}

  async getGameResult(matchId: string): Promise<GameOutcome> {
    const result = await fetch(`https://sfapi.example.com/matches/${matchId}`).then(r => r.json());
    return {
      gameId: matchId,
      winner: result.winner,
      loser: result.loser,
      reason: result.winCondition,
      timestamp: result.endedAt,
      proof: { replayUrl: result.replayUrl, finalRound: result.finalRound },
    };
  }

  async submitResult(outcome: GameOutcome, keypair: Keypair) {
    return this.sdk.submitResult(outcome.gameId, outcome, keypair);
  }

  async handleDispute(gameId: string): Promise<DisputeEvidence> {
    const replay = await fetch(`https://sfapi.example.com/matches/${gameId}/replay`).then(r => r.json());
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

## Configuration

```
SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
NETWORK_PASSPHRASE=Test SDF Network ; September 2015
ESCROW_CONTRACT_ID=CA...
RESOLVER_CONTRACT_ID=CB...
PAYOUT_CONTRACT_ID=CC...
```

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

Issues and PRs welcome.

## License

MIT

## Related

- [wagr-contracts](https://github.com/WagrNetwork/wagr-contracts) — Core Soroban smart contracts
- [wagr-app](https://github.com/WagrNetwork/wagr-app) — Frontend for match lobby and UI
