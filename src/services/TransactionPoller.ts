// Feature 4: Transaction Polling - Poll for transaction confirmation

export interface PollConfig {
  maxRetries?: number;
  intervalMs?: number;
  timeoutMs?: number;
}

export interface TransactionStatus {
  hash: string;
  status: 'pending' | 'confirmed' | 'failed';
  confirmations: number;
  timestamp: number;
  error?: string;
}

export class TransactionPoller {
  private rpcUrl: string;
  private polls: Map<string, TransactionStatus> = new Map();
  private config: Required<PollConfig>;

  constructor(rpcUrl: string, config: PollConfig = {}) {
    this.rpcUrl = rpcUrl;
    this.config = {
      maxRetries: config.maxRetries || 30,
      intervalMs: config.intervalMs || 1000,
      timeoutMs: config.timeoutMs || 60000,
    };
  }

  async poll(txHash: string): Promise<TransactionStatus> {
    const startTime = Date.now();

    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        const status = await this.checkTransactionStatus(txHash);
        this.polls.set(txHash, status);

        if (status.status !== 'pending') {
          return status;
        }

        if (Date.now() - startTime > this.config.timeoutMs) {
          return {
            hash: txHash,
            status: 'pending',
            confirmations: 0,
            timestamp: Date.now() / 1000,
            error: 'Polling timeout',
          };
        }

        await this.sleep(this.config.intervalMs);
      } catch (error) {
        if (attempt === this.config.maxRetries - 1) {
          return {
            hash: txHash,
            status: 'failed',
            confirmations: 0,
            timestamp: Date.now() / 1000,
            error: String(error),
          };
        }
      }
    }

    throw new Error(`Failed to poll transaction after ${this.config.maxRetries} attempts`);
  }

  private async checkTransactionStatus(txHash: string): Promise<TransactionStatus> {
    const response = await fetch(this.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getTransactionStatus',
        params: { transactionHash: txHash },
      }),
    });

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error.message);
    }

    return {
      hash: txHash,
      status: data.result.status,
      confirmations: data.result.confirmations || 0,
      timestamp: Date.now() / 1000,
    };
  }

  getStatus(txHash: string): TransactionStatus | undefined {
    return this.polls.get(txHash);
  }

  isConfirmed(txHash: string, requiredConfirmations: number = 1): boolean {
    const status = this.polls.get(txHash);
    return status?.status === 'confirmed' && (status?.confirmations || 0) >= requiredConfirmations;
  }

  isFailed(txHash: string): boolean {
    const status = this.polls.get(txHash);
    return status?.status === 'failed';
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  clearPolls(): void {
    this.polls.clear();
  }
}

export function createTransactionPoller(rpcUrl: string, config?: PollConfig): TransactionPoller {
  return new TransactionPoller(rpcUrl, config);
}
