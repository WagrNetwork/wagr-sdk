export interface WagrConfig {
  escrowContractId: string;
  resolverContractId: string;
  payoutContractId: string;
  rpcUrl: string;
  networkPassphrase: string;
  timeout?: number;
}

export class Config {
  constructor(private cfg: WagrConfig) {}

  get<K extends keyof WagrConfig>(key: K): WagrConfig[K] {
    return this.cfg[key];
  }

  getAll(): WagrConfig {
    return { ...this.cfg };
  }
}
