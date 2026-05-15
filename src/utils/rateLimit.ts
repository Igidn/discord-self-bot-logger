/**
 * Serialized async queue with configurable delay between tasks.
 * Prevents parallel API calls, which is critical for self-bot safety.
 */
export class AsyncQueue {
  private pending: Promise<unknown> = Promise.resolve();

  async add<T>(fn: () => Promise<T>, delayMs = 1000): Promise<T> {
    const next = this.pending.then(() => fn()).then(async (result) => {
      await new Promise((r) => setTimeout(r, delayMs));
      return result;
    });
    this.pending = next.catch(() => {});
    return next;
  }
}
