// Feature 6: Adapter Registry - Register and manage game adapters

import { GameAdapter } from '../core/GameAdapter';

export type AdapterType = 'lichess' | 'chesscom' | 'manual';

export interface RegisteredAdapter {
  type: AdapterType;
  adapter: GameAdapter;
  enabled: boolean;
  priority: number;
}

export class AdapterRegistry {
  private adapters: Map<AdapterType, RegisteredAdapter> = new Map();
  private defaultAdapter: AdapterType = 'lichess';

  register(type: AdapterType, adapter: GameAdapter, priority: number = 100): void {
    if (this.adapters.has(type)) {
      throw new Error(`Adapter ${type} already registered`);
    }

    this.adapters.set(type, {
      type,
      adapter,
      enabled: true,
      priority,
    });
  }

  unregister(type: AdapterType): void {
    this.adapters.delete(type);
    if (this.defaultAdapter === type) {
      this.defaultAdapter = this.getHighestPriorityAdapter();
    }
  }

  get(type: AdapterType): GameAdapter {
    const entry = this.adapters.get(type);
    if (!entry || !entry.enabled) {
      throw new Error(`Adapter ${type} not found or disabled`);
    }
    return entry.adapter;
  }

  getAll(): GameAdapter[] {
    return Array.from(this.adapters.values())
      .filter(entry => entry.enabled)
      .sort((a, b) => b.priority - a.priority)
      .map(entry => entry.adapter);
  }

  setDefault(type: AdapterType): void {
    if (!this.adapters.has(type)) {
      throw new Error(`Adapter ${type} not registered`);
    }
    this.defaultAdapter = type;
  }

  getDefault(): GameAdapter {
    return this.get(this.defaultAdapter);
  }

  enable(type: AdapterType): void {
    const entry = this.adapters.get(type);
    if (!entry) {
      throw new Error(`Adapter ${type} not found`);
    }
    entry.enabled = true;
  }

  disable(type: AdapterType): void {
    const entry = this.adapters.get(type);
    if (!entry) {
      throw new Error(`Adapter ${type} not found`);
    }
    entry.enabled = false;
  }

  isRegistered(type: AdapterType): boolean {
    return this.adapters.has(type);
  }

  isEnabled(type: AdapterType): boolean {
    const entry = this.adapters.get(type);
    return entry?.enabled || false;
  }

  setPriority(type: AdapterType, priority: number): void {
    const entry = this.adapters.get(type);
    if (!entry) {
      throw new Error(`Adapter ${type} not found`);
    }
    entry.priority = priority;
  }

  getRegistry(): Record<AdapterType, RegisteredAdapter> {
    const result: any = {};
    this.adapters.forEach((entry, type) => {
      result[type] = entry;
    });
    return result;
  }

  private getHighestPriorityAdapter(): AdapterType {
    let highest: RegisteredAdapter | undefined;
    this.adapters.forEach(entry => {
      if (!highest || entry.priority > highest.priority) {
        highest = entry;
      }
    });
    return highest?.type || 'lichess';
  }
}

export function createAdapterRegistry(): AdapterRegistry {
  return new AdapterRegistry();
}
