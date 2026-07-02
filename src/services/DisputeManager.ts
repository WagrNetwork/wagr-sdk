// Feature 3: Dispute Submission Flow - Submit and track disputes

export interface Dispute {
  disputeId: string;
  matchId: string;
  challenger: string;
  evidence: DisputeEvidence;
  status: 'pending' | 'accepted' | 'rejected' | 'resolved';
  createdAt: number;
  resolvedAt?: number;
}

export interface DisputeEvidence {
  type: 'screenshot' | 'video' | 'move_log' | 'signature';
  data: string;
  explanation: string;
  timestamp: number;
}

export class DisputeManager {
  private disputes: Map<string, Dispute> = new Map();
  private eventHandlers: Map<string, Function[]> = new Map();

  fileDispute(
    disputeId: string,
    matchId: string,
    challenger: string,
    evidence: DisputeEvidence,
  ): Dispute {
    if (!this.validateEvidence(evidence)) {
      throw new Error('Invalid dispute evidence');
    }

    const dispute: Dispute = {
      disputeId,
      matchId,
      challenger,
      evidence,
      status: 'pending',
      createdAt: Date.now() / 1000,
    };

    this.disputes.set(disputeId, dispute);
    this.emit('dispute:filed', dispute);

    return dispute;
  }

  getDispute(disputeId: string): Dispute | undefined {
    return this.disputes.get(disputeId);
  }

  updateDisputeStatus(disputeId: string, status: Dispute['status']): void {
    const dispute = this.disputes.get(disputeId);
    if (!dispute) {
      throw new Error(`Dispute ${disputeId} not found`);
    }

    dispute.status = status;

    if (status === 'resolved') {
      dispute.resolvedAt = Date.now() / 1000;
    }

    this.emit(`dispute:${status}`, dispute);
  }

  getDisputesForMatch(matchId: string): Dispute[] {
    return Array.from(this.disputes.values()).filter(d => d.matchId === matchId);
  }

  getDisputesForPlayer(playerAddress: string): Dispute[] {
    return Array.from(this.disputes.values()).filter(d => d.challenger === playerAddress);
  }

  private validateEvidence(evidence: DisputeEvidence): boolean {
    if (!evidence.type || !evidence.data || !evidence.explanation) {
      return false;
    }

    if (evidence.type === 'screenshot') {
      return evidence.data.startsWith('ipfs://') || evidence.data.startsWith('https://');
    }

    return true;
  }

  on(event: string, handler: Function): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
  }

  private emit(event: string, data: any): void {
    const handlers = this.eventHandlers.get(event) || [];
    handlers.forEach(handler => handler(data));
  }

  exportDisputes(): Dispute[] {
    return Array.from(this.disputes.values());
  }

  clearResolved(): number {
    let count = 0;
    for (const [id, dispute] of this.disputes) {
      if (dispute.status === 'resolved') {
        this.disputes.delete(id);
        count++;
      }
    }
    return count;
  }
}

export function createDisputeManager(): DisputeManager {
  return new DisputeManager();
}
