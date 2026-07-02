import { Address } from '@stellar/stellar-sdk';

export class ContractClient {
  constructor(private contractId: string, private rpcUrl: string) {}

  async call(method: string, args: any[]) {
    // RPC call placeholder
    return { status: 'pending' };
  }

  async query(method: string, args: any[]) {
    // Query placeholder
    return {};
  }

  getContractId(): string {
    return this.contractId;
  }
}
