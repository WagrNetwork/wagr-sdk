export class WagrError extends Error {}

/** Thrown when a contract invocation fails on-chain or during simulation. */
export class ContractCallError extends WagrError {
  constructor(
    message: string,
    public readonly contractId: string,
    public readonly method: string,
  ) {
    super(message);
    this.name = 'ContractCallError';
  }
}

/** Thrown when SDK configuration is missing or invalid. */
export class ConfigError extends WagrError {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}
