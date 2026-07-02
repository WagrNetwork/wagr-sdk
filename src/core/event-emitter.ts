type EventHandler = (...args: any[]) => void;

export class EventEmitter {
  private handlers: Map<string, EventHandler[]> = new Map();

  on(event: string, handler: EventHandler): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }
    this.handlers.get(event)!.push(handler);
  }

  emit(event: string, ...args: any[]): void {
    const handlers = this.handlers.get(event) || [];
    handlers.forEach(h => h(...args));
  }

  off(event: string, handler: EventHandler): void {
    const handlers = this.handlers.get(event) || [];
    const idx = handlers.indexOf(handler);
    if (idx >= 0) handlers.splice(idx, 1);
  }
}
