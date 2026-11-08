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
} from './core/WagrSDK.js';

export {
  type GameAdapter,
  type DisputeEvidence,
} from './core/GameAdapter.js';

export { EventEmitter } from './core/event-emitter.js';

// Adapters
export { LichessAdapter, type LichessAdapterConfig } from './adapters/lichess/index.js';
export { retry } from './adapters/retry.js';

// Builders
export { MatchBuilder, createMatchBuilder, type MatchConfig } from './builders/MatchBuilder.js';

// Errors
export { WagrError, ContractCallError, ConfigError } from './utils/errors.js';

// Formatting/parsing helpers
export { formatAddress } from './utils/formatters.js';
export { parseXLM } from './utils/parsing.js';

// Re-export Stellar SDK types for convenience
export { Keypair, Networks } from '@stellar/stellar-sdk';
