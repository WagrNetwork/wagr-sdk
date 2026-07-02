// Core exports
export { WagrSDK, type WagrSDKConfig } from './core/WagrSDK';
export {
  type GameAdapter,
  type GameOutcome,
  type DisputeEvidence,
  type TransactionResult,
} from './core/GameAdapter';

// Types
export type {
  CreateMatchOptions,
  Match,
  MatchOutcome,
  DisputeStatus,
} from './core/WagrSDK';

// Adapters
export { LichessAdapter } from './adapters/lichess';

// Re-export Stellar SDK types for convenience
export { Keypair, Networks } from '@stellar/stellar-sdk';
