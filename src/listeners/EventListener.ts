// Feature 9: Event Listener System - Listen to on-chain events

export type EventHandler = (event: ContractEvent) => void;
export type EventFilter = (event: ContractEvent) => boolean;

export interface ContractEvent {
  type: string;
  contractId: string;
  ledger: number;
  timestamp: number;
  data: Record<string, any>;
}

export class EventListener {
  private contractId: string;
  private rpcUrl: string;
  private handlers: Map<string, EventHandler[]> = new Map();
  private filters: EventFilter[] = [];
  private isListening: boolean = false;
  private pollIntervalMs: number = 1000;
  private lastLedger: number = 0;

  constructor(contractId: string, rpcUrl: string, pollIntervalMs: number = 1000) {
    this.contractId = contractId;
    this.rpcUrl = rpcUrl;
    this.pollIntervalMs = pollIntervalMs;
  }

  on(eventType: string, handler: EventHandler): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, []);
    }
    this.handlers.get(eventType)!.push(handler);
  }

  off(eventType: string, handler: EventHandler): void {
    const handlers = this.handlers.get(eventType);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  addFilter(filter: EventFilter): void {
    this.filters.push(filter);
  }

  removeFilter(filter: EventFilter): void {
    const index = this.filters.indexOf(filter);
    if (index > -1) {
      this.filters.splice(index, 1);
    }
  }

  async start(): Promise<void> {
    if (this.isListening) return;
    this.isListening = true;

    this.poll();
  }

  stop(): void {
    this.isListening = false;
  }

  private async poll(): Promise<void> {
    while (this.isListening) {
      try {
        await this.fetchAndProcessEvents();
      } catch (error) {
        console.error('Error polling events:', error);
      }

      await new Promise(resolve => setTimeout(resolve, this.pollIntervalMs));
    }
  }

  private async fetchAndProcessEvents(): Promise<void> {
    const events = await this.fetchEvents();

    for (const event of events) {
      // Apply filters
      if (!this.filters.every(filter => filter(event))) {
        continue;
      }

      // Emit to handlers
      const handlers = this.handlers.get(event.type) || [];
      handlers.forEach(handler => {
        try {
          handler(event);
        } catch (error) {
          console.error(`Error in event handler for ${event.type}:`, error);
        }
      });

      // Emit to wildcard handlers
      const wildcardHandlers = this.handlers.get('*') || [];
      wildcardHandlers.forEach(handler => {
        try {
          handler(event);
        } catch (error) {
          console.error('Error in wildcard event handler:', error);
        }
      });
    }
  }

  private async fetchEvents(): Promise<ContractEvent[]> {
    const response = await fetch(this.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getEvents',
        params: {
          startLedger: this.lastLedger || 0,
          filters: [{ contractIds: [this.contractId] }],
        },
      }),
    });

    const data = await response.json();
    if (data.error) {
      throw new Error(data.error.message);
    }

    const events: ContractEvent[] = data.result?.events || [];
    if (events.length > 0) {
      this.lastLedger = Math.max(...events.map(e => e.ledger));
    }

    return events;
  }

  getHandlerCount(eventType: string): number {
    return this.handlers.get(eventType)?.length || 0;
  }

  isActive(): boolean {
    return this.isListening;
  }

  clearHandlers(eventType?: string): void {
    if (eventType) {
      this.handlers.delete(eventType);
    } else {
      this.handlers.clear();
    }
  }
}

export function createEventListener(contractId: string, rpcUrl: string): EventListener {
  return new EventListener(contractId, rpcUrl);
}
