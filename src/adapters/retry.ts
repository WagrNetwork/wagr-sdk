export async function retry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  delayMs: number = 1000
): Promise<T> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === maxAttempts - 1) throw err;
      await new Promise(resolve => setTimeout(resolve, delayMs * (i + 1)));
    }
  }
  throw new Error('Max retries exceeded');
}
