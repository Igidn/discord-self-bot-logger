# Bug: Message logging silently stops after ~1,065 messages

## Investigation Findings

The message logger stops processing new messages after approximately 1,065 messages without crashing.

### Suspect #1 — LRU Caches with maxSize 1000

`src/services/enricher.ts` has three LRU caches:

```ts
const userCache = new SimpleLRU<boolean>(1000);
const channelCache = new SimpleLRU<boolean>(1000);
const guildCache = new SimpleLRU<'placeholder' | 'full'>(1000);
```

When the cache fills (maxSize 1000), the eviction loop (`for (const [k, v] of this.cache)`) scans **all entries** to find the oldest — O(n) per insert across 3 caches. This performance degradation combined with synchronous SQLite writes may starve the event loop around ~1,000 unique entities.

### Suspect #2 — Unused AsyncQueue rate limiter

`src/utils/rateLimit.ts` exports an `AsyncQueue` class but it is **never imported or used** anywhere in the codebase. Message writes fire synchronously with zero throttling.

### Suspect #3 — Event loop starvation

Each `messageCreate` event triggers synchronous `better-sqlite3` writes (message insert + user/channel/guild upserts) plus Socket.IO broadcasts. These block the event loop, causing the Discord websocket buffer to fill and events to be silently dropped.

### Recommended Fixes

1. **Add rate limiting** — Wire the existing `AsyncQueue` into `messageCreate.ts` to serialize writes with a small delay (e.g., 100-200ms between batches)
2. **Improve LRU eviction** — Replace O(n) eviction scan with a proper linked-list LRU or use `Map` insertion-order behavior (delete+set for promotion)
3. **Consider async DB writes** — Switch to `better-sqlite3` asynchronous mode or batch inserts with thresholds
