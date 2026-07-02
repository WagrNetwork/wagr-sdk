// Feature 8: SDK Configuration - Flexible SDK initialization

export interface SDKConfig {
  escrowContractId: string;
  resolverContractId: string;
  payoutContractId: string;
  rpcUrl: string;
  networkPassphrase: string;
  timeout?: number;
  cacheEnabled?: boolean;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  maxRetries?: number;
  retryDelayMs?: number;
  pollIntervalMs?: number;
  maxPollAttempts?: number;
}

export interface SDKDefaults {
  timeout: number;
  cacheEnabled: boolean;
  logLevel: 'info';
  maxRetries: number;
  retryDelayMs: number;
  pollIntervalMs: number;
  maxPollAttempts: number;
}

export const DEFAULT_CONFIG: SDKDefaults = {
  timeout: 30000,
  cacheEnabled: true,
  logLevel: 'info',
  maxRetries: 3,
  retryDelayMs: 1000,
  pollIntervalMs: 1000,
  maxPollAttempts: 30,
};

export class SDKConfigManager {
  private config: SDKConfig;
  private validated: boolean = false;

  constructor(config: SDKConfig) {
    this.config = this.mergeWithDefaults(config);
  }

  private mergeWithDefaults(config: SDKConfig): SDKConfig {
    return {
      ...config,
      timeout: config.timeout || DEFAULT_CONFIG.timeout,
      cacheEnabled: config.cacheEnabled !== undefined ? config.cacheEnabled : DEFAULT_CONFIG.cacheEnabled,
      logLevel: config.logLevel || (DEFAULT_CONFIG.logLevel as any),
      maxRetries: config.maxRetries || DEFAULT_CONFIG.maxRetries,
      retryDelayMs: config.retryDelayMs || DEFAULT_CONFIG.retryDelayMs,
      pollIntervalMs: config.pollIntervalMs || DEFAULT_CONFIG.pollIntervalMs,
      maxPollAttempts: config.maxPollAttempts || DEFAULT_CONFIG.maxPollAttempts,
    };
  }

  validate(): boolean {
    if (this.validated) return true;

    if (!this.config.escrowContractId?.startsWith('C')) {
      throw new Error('Invalid escrow contract ID');
    }

    if (!this.config.resolverContractId?.startsWith('C')) {
      throw new Error('Invalid resolver contract ID');
    }

    if (!this.config.payoutContractId?.startsWith('C')) {
      throw new Error('Invalid payout contract ID');
    }

    if (!this.config.rpcUrl?.startsWith('http')) {
      throw new Error('Invalid RPC URL');
    }

    if (this.config.timeout! < 1000) {
      throw new Error('Timeout must be at least 1000ms');
    }

    if (this.config.maxRetries! < 1) {
      throw new Error('Max retries must be at least 1');
    }

    this.validated = true;
    return true;
  }

  get(): SDKConfig {
    this.validate();
    return this.config;
  }

  update(partial: Partial<SDKConfig>): void {
    this.config = { ...this.config, ...partial };
    this.validated = false;
  }

  getContractIds(): { escrow: string; resolver: string; payout: string } {
    return {
      escrow: this.config.escrowContractId,
      resolver: this.config.resolverContractId,
      payout: this.config.payoutContractId,
    };
  }

  getRpcUrl(): string {
    return this.config.rpcUrl;
  }

  getTimeout(): number {
    return this.config.timeout || DEFAULT_CONFIG.timeout;
  }

  isLogLevelEnabled(level: string): boolean {
    const levels = ['debug', 'info', 'warn', 'error'];
    const currentIndex = levels.indexOf(this.config.logLevel || 'info');
    const requestedIndex = levels.indexOf(level);
    return requestedIndex >= currentIndex;
  }

  clone(): SDKConfigManager {
    return new SDKConfigManager({ ...this.config });
  }
}

export function createSDKConfig(config: SDKConfig): SDKConfigManager {
  return new SDKConfigManager(config);
}
