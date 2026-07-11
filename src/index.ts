// Core exports
export {
  WagrSDK,
  type WagrSDKConfig,
  type CreateMatchOptions,
  type TransactionResult,
  type Match,
  type MatchOutcome,
  type DisputeStatus,
  type EventSubscriptionOptions,
  type GameOutcome,
  type Signer,
  type WalletSigner,
} from './core/WagrSDK';

export {
  type GameAdapter,
  type DisputeEvidence,
} from './core/GameAdapter';

export { EventEmitter } from './core/event-emitter';

// Adapters
export { LichessAdapter, type LichessAdapterConfig } from './adapters/lichess';
export { retry } from './adapters/retry';

// Builders
export { MatchBuilder, createMatchBuilder, type MatchConfig } from './builders/MatchBuilder';

// Errors
export { WagrError, ContractCallError, ConfigError } from './utils/errors';

// Formatting/parsing helpers
export { formatAddress } from './utils/formatters';
export { parseXLM } from './utils/parsing';

// Re-export Stellar SDK types for convenience
export { Keypair, Networks } from '@stellar/stellar-sdk';
