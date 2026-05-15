/**
 * Serialized async queue with configurable delay between tasks.
 * Prevents parallel API calls, which is critical for self-bot safety.
 */
export class AsyncQueue {
  private pending = Promise.resolve();

  async add<T>(fn: () => Promise<T>, delayMs = 1000): Promise<T> {
    this.pending = this.pending.then(() => fn()).then(async (result) => {
      await new Promise((r) => setTimeout(r, delayMs));
      return result;
    });
    return this.pending as Promise<T>;
  }
}
