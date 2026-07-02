export class Poller {
  async poll<T>(
    fn: () => Promise<T | null>,
    maxAttempts: number = 100,
    intervalMs: number = 1000
  ): Promise<T> {
    for (let i = 0; i < maxAttempts; i++) {
      const result = await fn();
      if (result) return result;
      await new Promise(r => setTimeout(r, intervalMs));
    }
    throw new Error('Polling timeout');
  }
}
