import {
  Keypair,
  contract,
  rpc,
} from '@stellar/stellar-sdk';
import { ContractCallError, ConfigError } from '../utils/errors';
import { EventEmitter } from './event-emitter';
import { retry } from '../adapters/retry';
import type { GameOutcome } from './GameAdapter';

export type { GameOutcome };

const { Client, basicNodeSigner } = contract;

/**
 * A signer that isn't a raw `Keypair` — for browser wallets (Freighter,
 * xBull, …) that never expose the private key, only a `signTransaction`
 * callback. Shape matches `contract.ClientOptions`, so e.g. Freighter's
 * `signTransaction` (after adapting its `{ signedTxXdr }` return value down
 * to a bare string) can be passed straight through.
 */
export interface WalletSigner {
  publicKey: string;
  signTransaction: (
    tx: string,
    opts?: { network?: string; networkPassphrase?: string; accountToSign?: string },
  ) => Promise<string>;
  signAuthEntry?: (entryXdr: string, opts?: { accountToSign?: string }) => Promise<string>;
}

export type Signer = Keypair | WalletSigner;

function isKeypair(signer: Signer): signer is Keypair {
  return signer instanceof Keypair;
}

function signerPublicKey(signer: Signer): string {
  return isKeypair(signer) ? signer.publicKey() : signer.publicKey;
}

export interface CreateMatchOptions {
  player1: string;
  player2: string;
  /** Stake amount in stroops (1 XLM = 10,000,000 stroops), as a string u128. */
  amount: string;
  /** Contract ID of the asset (token) being staked. */
  asset: string;
  gameType: 'lichess' | 'chesscom' | 'manual';
  gameId: string;
}

export interface TransactionResult<T = unknown> {
  status: 'success' | 'failed';
  hash?: string;
  error?: string;
  data?: T;
}

export interface Match {
  matchId: string;
  players: string[];
  stakes: Record<string, string>;
  status: 'pending' | 'active' | 'disputed' | 'finalized';
  winner?: string;
}

export interface MatchOutcome {
  matchId: string;
  winner: string;
}

export interface DisputeStatus {
  status: 'pending' | 'disputed' | 'finalized' | 'none';
  disputeCount: number;
  latestEvidence?: Uint8Array;
}

export interface WagrSDKConfig {
  escrowContractId: string;
  resolverContractId: string;
  payoutContractId: string;
  rpcUrl: string;
  networkPassphrase: string;
  /** Transaction simulation/submission timeout, in seconds. Default 30. */
  timeout?: number;
  /** Allow plain-HTTP RPC endpoints (e.g. local dev). Default false. */
  allowHttp?: boolean;
}

export interface EventSubscriptionOptions {
  /** Ledger to start scanning from. Defaults to the latest ledger. */
  startLedger?: number;
  /** How often to poll for new events, in ms. Default 5000. */
  pollIntervalMs?: number;
}

type ContractName = 'escrow' | 'resolver' | 'payout';

/**
 * Core Wagr SDK: match orchestration and Soroban contract interaction.
 *
 * Wraps the three deployed Wagr contracts (escrow, resolver, payout) using
 * `@stellar/stellar-sdk`'s `contract.Client`, which fetches each contract's
 * on-chain spec and exposes its methods dynamically — there is no
 * hand-generated binding to fall out of sync with the deployed contracts.
 */
export class WagrSDK extends EventEmitter {
  private readonly config: Required<Omit<WagrSDKConfig, 'timeout' | 'allowHttp'>> &
    Pick<WagrSDKConfig, 'timeout' | 'allowHttp'>;
  private readonly clients = new Map<string, Promise<contract.Client>>();
  private server: rpc.Server | null = null;
  private eventPollHandle: ReturnType<typeof setInterval> | null = null;

  constructor(config: WagrSDKConfig) {
    super();

    if (!config.escrowContractId || !config.resolverContractId || !config.payoutContractId) {
      throw new ConfigError('escrowContractId, resolverContractId, and payoutContractId are required');
    }
    if (!config.rpcUrl || !config.networkPassphrase) {
      throw new ConfigError('rpcUrl and networkPassphrase are required');
    }

    this.config = config;
  }

  private getRpcServer(): rpc.Server {
    if (!this.server) {
      this.server = new rpc.Server(this.config.rpcUrl, { allowHttp: this.config.allowHttp });
    }
    return this.server;
  }

  private contractId(name: ContractName): string {
    return {
      escrow: this.config.escrowContractId,
      resolver: this.config.resolverContractId,
      payout: this.config.payoutContractId,
    }[name];
  }

  /**
   * Get a raw `contract.Client` for one of the three Wagr contracts. Useful
   * for calling operational/admin methods (pause, set_admin, upgrade, …)
   * that this SDK doesn't wrap with a dedicated high-level method.
   */
  async getClient(name: ContractName, signer?: Signer): Promise<contract.Client> {
    const publicKey = signer ? signerPublicKey(signer) : undefined;
    const cacheKey = `${name}:${publicKey ?? 'readonly'}`;
    let clientPromise = this.clients.get(cacheKey);
    if (!clientPromise) {
      const signerFields = !signer
        ? {}
        : isKeypair(signer)
          ? basicNodeSigner(signer, this.config.networkPassphrase)
          : { signTransaction: signer.signTransaction, signAuthEntry: signer.signAuthEntry };

      clientPromise = Client.from({
        contractId: this.contractId(name),
        networkPassphrase: this.config.networkPassphrase,
        rpcUrl: this.config.rpcUrl,
        allowHttp: this.config.allowHttp,
        publicKey,
        ...signerFields,
      });
      this.clients.set(cacheKey, clientPromise);
    }
    return clientPromise;
  }

  private async invoke<T>(
    name: ContractName,
    method: string,
    args: Record<string, unknown>,
    signer?: Signer,
  ): Promise<T> {
    const client = (await this.getClient(name, signer)) as unknown as Record<
      string,
      (args: Record<string, unknown>) => Promise<contract.AssembledTransaction<T>>
    >;

    try {
      return await retry(async () => {
        const tx = await client[method](args);
        if (!signer) {
          return tx.result;
        }
        const sent = await tx.signAndSend();
        return sent.result;
      }, 3, 1000);
    } catch (err) {
      throw new ContractCallError(
        err instanceof Error ? err.message : String(err),
        this.contractId(name),
        method,
      );
    }
  }

  private generateMatchId(): string {
    // Soroban Symbol: max 32 chars, [A-Za-z0-9_] only.
    return `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  }

  /**
   * Create a match: player1 stakes into escrow. The match becomes active once
   * player2 (or further players, for N-way matches) calls `joinMatch`.
   */
  async createMatch(
    options: CreateMatchOptions,
    signer: Signer,
  ): Promise<TransactionResult<Match>> {
    try {
      const matchId = this.generateMatchId();
      await this.invoke('escrow', 'stake', {
        match_id: matchId,
        player: options.player1,
        amount: BigInt(options.amount),
        asset: options.asset,
      }, signer);

      return {
        status: 'success',
        data: {
          matchId,
          players: [options.player1],
          stakes: { [options.player1]: options.amount },
          status: 'pending',
        },
      };
    } catch (err) {
      return { status: 'failed', error: err instanceof Error ? err.message : String(err) };
    }
  }

  /** Join an existing match by staking (player2 and beyond, up to 8 players). */
  async joinMatch(
    matchId: string,
    player: string,
    amount: string,
    asset: string,
    signer: Signer,
  ): Promise<TransactionResult> {
    try {
      await this.invoke('escrow', 'stake', {
        match_id: matchId,
        player,
        amount: BigInt(amount),
        asset,
      }, signer);
      return { status: 'success' };
    } catch (err) {
      return { status: 'failed', error: err instanceof Error ? err.message : String(err) };
    }
  }

  /** Refund a player's stake once the match has timed out (24h+ since staking). */
  async timeoutRefund(
    matchId: string,
    player: string,
    asset: string,
    signer: Signer,
  ): Promise<TransactionResult> {
    try {
      await this.invoke('escrow', 'timeout_refund', {
        match_id: matchId,
        player,
        caller: signerPublicKey(signer),
        asset,
      }, signer);
      return { status: 'success' };
    } catch (err) {
      return { status: 'failed', error: err instanceof Error ? err.message : String(err) };
    }
  }

  /** Submit a game result to the resolver. `signer` is the authorized submitter (e.g. adapter oracle). */
  async submitResult(matchId: string, outcome: GameOutcome, signer: Signer): Promise<TransactionResult> {
    try {
      const proofBytes = new TextEncoder().encode(JSON.stringify(outcome.proof ?? {}));
      await this.invoke('resolver', 'submit_result', {
        match_id: matchId,
        winner: outcome.winner,
        loser: outcome.loser,
        reason: outcome.reason,
        proof: proofBytes,
        submitter: signerPublicKey(signer),
      }, signer);
      return { status: 'success' };
    } catch (err) {
      return { status: 'failed', error: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * File a dispute during the 24h window. `signer` must be the recorded
   * loser — the resolver contract requires the loser's own authorization.
   */
  async disputeResult(
    options: { matchId: string; evidence: Uint8Array | string },
    signer: Signer,
  ): Promise<TransactionResult> {
    try {
      const evidenceBytes =
        typeof options.evidence === 'string'
          ? new TextEncoder().encode(options.evidence)
          : options.evidence;
      await this.invoke('resolver', 'dispute', {
        match_id: options.matchId,
        evidence: evidenceBytes,
      }, signer);
      return { status: 'success' };
    } catch (err) {
      return { status: 'failed', error: err instanceof Error ? err.message : String(err) };
    }
  }

  /** Finalize a match's result once the dispute window has closed. Callable by anyone. */
  async finalizeMatch(matchId: string, submitter: Signer): Promise<MatchOutcome> {
    const winner = await this.invoke<string>('resolver', 'finalize', { match_id: matchId }, submitter);
    return { matchId, winner };
  }

  /** Settle a finalized match winner-take-all. Only the payout contract's arbiter may call this. */
  async settleWinnerTakeAll(
    matchId: string,
    winner: string,
    totalPot: string,
    asset: string,
    arbiterSigner: Signer,
  ): Promise<TransactionResult> {
    try {
      await this.invoke('payout', 'resolve_winner_take_all', {
        match_id: matchId,
        winner,
        total_pot: BigInt(totalPot),
        asset,
      }, arbiterSigner);
      return { status: 'success' };
    } catch (err) {
      return { status: 'failed', error: err instanceof Error ? err.message : String(err) };
    }
  }

  /** Settle a finalized match with a custom winner/loser split. Only the payout contract's arbiter may call this. */
  async settleSplit(
    matchId: string,
    winner: string,
    loser: string,
    totalPot: string,
    winnerSplitBps: number,
    asset: string,
    arbiterSigner: Signer,
  ): Promise<TransactionResult> {
    try {
      await this.invoke('payout', 'resolve_split', {
        match_id: matchId,
        winner,
        loser,
        total_pot: BigInt(totalPot),
        winner_split_bps: winnerSplitBps,
        asset,
      }, arbiterSigner);
      return { status: 'success' };
    } catch (err) {
      return { status: 'failed', error: err instanceof Error ? err.message : String(err) };
    }
  }

  /** Withdraw settled winnings for a player. */
  async withdrawWinnings(
    options: { matchId: string; player: string; asset: string },
    signer: Signer,
  ): Promise<TransactionResult<string>> {
    try {
      const amount = await this.invoke<bigint>('payout', 'withdraw_winnings', {
        match_id: options.matchId,
        player: options.player,
        asset: options.asset,
      }, signer);
      return { status: 'success', data: amount.toString() };
    } catch (err) {
      return { status: 'failed', error: err instanceof Error ? err.message : String(err) };
    }
  }

  /** Withdraw accumulated protocol fees. `signer` must be the payout contract's fee collector. */
  async withdrawFees(asset: string, signer: Signer): Promise<TransactionResult<string>> {
    try {
      const amount = await this.invoke<bigint>('payout', 'withdraw_fees', { asset }, signer);
      return { status: 'success', data: amount.toString() };
    } catch (err) {
      return { status: 'failed', error: err instanceof Error ? err.message : String(err) };
    }
  }

  /** Query accumulated (not yet withdrawn) protocol fees for an asset. */
  async getFeeBalance(asset: string): Promise<string> {
    const balance = await this.invoke<bigint>('payout', 'get_fee_balance', { asset });
    return balance.toString();
  }

  /** Query the players who have staked into a match, and their stake amounts. */
  async getMatch(matchId: string): Promise<Match> {
    const players = await this.invoke<string[]>('escrow', 'get_match_players', { match_id: matchId });

    const stakes: Record<string, string> = {};
    for (const player of players) {
      const balance = await this.invoke<bigint>('escrow', 'query_stake_balance', {
        match_id: matchId,
        player,
      });
      stakes[player] = balance.toString();
    }

    let status: Match['status'] = players.length < 2 ? 'pending' : 'active';
    let winner: string | undefined;
    try {
      const [resultWinner, resultStatus] = await this.invoke<[string, { tag: string }]>(
        'resolver',
        'query_result_status',
        { match_id: matchId },
      );
      winner = resultWinner;
      status = resultStatus.tag === 'Disputed' ? 'disputed' : resultStatus.tag === 'Finalized' ? 'finalized' : status;
    } catch {
      // No result submitted yet; leave status as pending/active.
    }

    return { matchId, players, stakes, status, winner };
  }

  /** Query the total amount currently held in escrow across all matches. */
  async getTotalEscrow(): Promise<string> {
    const total = await this.invoke<bigint>('escrow', 'get_total_escrow', {});
    return total.toString();
  }

  /** Query dispute status for a match. */
  async getDisputeStatus(matchId: string): Promise<DisputeStatus> {
    const disputeCount = await this.invoke<number>('resolver', 'get_dispute_count', { match_id: matchId });

    let status: DisputeStatus['status'] = 'none';
    try {
      const [, resultStatus] = await this.invoke<[string, { tag: string }]>(
        'resolver',
        'query_result_status',
        { match_id: matchId },
      );
      status =
        resultStatus.tag === 'Disputed' ? 'disputed' : resultStatus.tag === 'Finalized' ? 'finalized' : 'pending';
    } catch {
      // No result submitted yet.
    }

    let latestEvidence: Uint8Array | undefined;
    if (disputeCount > 0) {
      latestEvidence = await this.invoke<Uint8Array>('resolver', 'get_dispute_evidence', {
        match_id: matchId,
        index: disputeCount - 1,
      });
    }

    return { status, disputeCount, latestEvidence };
  }

  /**
   * Poll for on-chain events emitted by any of the three Wagr contracts and
   * emit them locally via `.on('event', handler)`. Soroban RPC has no push
   * subscription, so this polls `getEvents` on an interval.
   */
  async subscribeToEvents(options: EventSubscriptionOptions = {}): Promise<void> {
    const server = this.getRpcServer();
    const pollIntervalMs = options.pollIntervalMs ?? 5000;

    let cursor = options.startLedger;
    if (cursor === undefined) {
      const latest = await server.getLatestLedger();
      cursor = latest.sequence;
    }

    const contractIds = [
      this.config.escrowContractId,
      this.config.resolverContractId,
      this.config.payoutContractId,
    ];

    this.stopEventSubscription();
    this.eventPollHandle = setInterval(async () => {
      try {
        const response = await server.getEvents({
          startLedger: cursor,
          filters: [{ type: 'contract', contractIds }],
          limit: 100,
        });
        for (const event of response.events) {
          this.emit('event', event);
        }
        cursor = response.latestLedger + 1;
      } catch (err) {
        this.emit('error', err);
      }
    }, pollIntervalMs);
  }

  /** Stop polling for on-chain events started by `subscribeToEvents`. */
  stopEventSubscription(): void {
    if (this.eventPollHandle) {
      clearInterval(this.eventPollHandle);
      this.eventPollHandle = null;
    }
  }
}
