# Presence System Rewrite Plan

> **Context:** This project uses `discord.js-selfbot-v13` (a user-account/self-bot library). The current `presenceUpdate` event handler does **not** work for arbitrary guild members on user accounts — it only fires for friends / group DMs. This plan rewrites presence tracking to use proactive member fetching with diff detection.

---

## Phase 1 — Foundation & Cleanup

### 1.1 Remove Invite Event Handlers
**Files:** `src/bot/events/guildAudit.ts`, `src/bot/events/index.ts`, `src/config/schema.ts`, `config.example.yaml`

- Delete `onInviteCreate` and `onInviteDelete` functions from `guildAudit.ts`
- Delete `handleInviteCreate` and `handleInviteDelete` exports
- In `events/index.ts`, remove the `inviteCreate` and `inviteDelete` listener registrations
- In `config/schema.ts`, remove `invites: z.boolean()` from the `events` object
- In `config.example.yaml`, remove the `invites: true` line

**Rationale:** `inviteCreate` / `inviteDelete` gateway events are not reliably dispatched to regular user clients.

---

### 1.2 Clean Up Client Intents
**File:** `src/bot/client.ts`

- Replace the `intents` array with an empty array `[]` or the minimal set `discord.js-selfbot-v13` requires to connect.

**Rationale:** Intents are bot-gateway concepts. User accounts ignore most of them, and `GUILD_PRESENCES` / `GUILD_MEMBERS` do nothing for self-bots.

---

## Phase 2 — Presence System Rewrite (The Core Change)

### 2.1 Database Schema — Presence Snapshots
**File:** `src/database/schema.ts`

- Keep `presenceUpdates` as the **history** table (append-only log of changes).
- Add a new `latestPresences` table for fast lookups during polling diffs:

```typescript
export const latestPresences = sqliteTable('latest_presences', {
  guildId: text('guild_id').notNull(),
  userId: text('user_id').notNull(),
  status: text('status'),
  clientStatus: text('client_status'),
  activitiesJson: text('activities_json'),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
}, (table) => ({
  pk: primaryKey({ columns: [table.guildId, table.userId] }),
}));
```

- Add a Drizzle migration file for the new table.

---

### 2.2 Rate-Limit Queue Utility
**File:** `src/utils/rateLimit.ts` (new)

Create a simple serialized queue with back-off:

```typescript
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
```

This prevents parallel `guild.members.fetch()` calls, which is critical for self-bot safety.

---

### 2.3 Presence Polling Service
**File:** `src/services/presencePoller.ts` (new)

Responsibilities:
1. On a configurable interval (default 60s), iterate whitelisted guilds
2. For each guild, determine fetch strategy based on `largeGuildThreshold`
3. Compare each member's `member.presence` against `latestPresences` DB row
4. If changed (status, clientStatus, or activities differ):
   - Insert into `presenceUpdates` (history)
   - Upsert `latestPresences`
   - Call `broadcaster.toGuild(...)` with the diff payload

#### Fetch Strategy

`largeGuildThreshold` is a **mode switch**, not an on/off switch:

| Guild Size | Behavior |
|---|---|
| **≤ threshold** (e.g. 1,000) | Full fetch: `guild.members.fetch({ withPresences: true })` |
| **> threshold** | **Priority-only fetch**: only query users in the priority list |

**Why?** On a 50,000-member server, fetching all members with a user token will take dozens of paginated API requests, hit aggressive rate limits, and potentially flag the account. The threshold prevents that while still tracking the users that matter.

#### Priority System

When a guild exceeds the threshold, the poller builds a **priority user list** and fetches only those members in batches:

**Priority tier list** (in order of importance):
1. **Message authors** — `SELECT DISTINCT author_id FROM messages WHERE guild_id = ?`
2. **Currently tracked users** — anyone already in `latest_presences` for this guild (so we don't drop someone mid-tracking)
3. *(Optional future)* **Friends list** — `client.user.friends.cache`

**Batch fetching:**
```typescript
const batches = chunk(priorityIds, 100); // Discord bulk limit
for (const batch of batches) {
  await queue.add(() => 
    guild.members.fetch({ user: batch, withPresences: true })
  );
}
```

**Priority cache refresh:** Rebuild the priority list every ~10 minutes (not every poll cycle) to avoid repeated DB scans:
```typescript
function refreshPriorityCache(guildId: string) {
  const rows = sqlite.prepare(`
    SELECT DISTINCT author_id FROM messages WHERE guild_id = ?
  `).all(guildId);
  
  const tracked = sqlite.prepare(`
    SELECT user_id FROM latest_presences WHERE guild_id = ?
  `).all(guildId);
  
  priorityCache.set(guildId, [...new Set([...rows, ...tracked])]);
}
```

#### Key behaviors
- Use the `AsyncQueue` from 2.2 — never run fetches in parallel
- On `client.ready`, run one initial hydration pass before starting the interval
- Gracefully handle `DiscordAPIError` / 429 by pausing the queue
- `maxUsersPerGuild` acts as a hard cap on the priority list size (safety valve)

---

### 2.4 Rewrite Presence Event Handler
**File:** `src/bot/events/presence.ts`

- Delete the `client.on('presenceUpdate', ...)` handler entirely
- Export a thin helper `recordPresenceChange(guildId, userId, presence)` that the poller service calls
- This keeps the DB/broadcast logic in one place

---

### 2.5 Register Poller in Event System
**File:** `src/bot/events/index.ts`

- Remove:
  ```typescript
  import { handlePresenceUpdate } from './presence.js';
  // ...
  client.on('presenceUpdate', ...)
  ```
- Instead, export a `startPresencePoller(client)` function that `main.ts` calls after login

---

## Phase 3 — Startup & Integration

### 3.1 Boot Sequence
**File:** `src/main.ts`

Change startup order:

```typescript
await startBot(db);

// NEW: Hydrate presence data immediately on first ready
client.once('ready', async () => {
  await startPresencePoller(client, { immediate: true });
});

logger.info("Startup complete...");
```

The poller's `immediate: true` flag does one full fetch cycle before setting the interval timer.

---

### 3.2 Config Schema Update
**File:** `src/config/schema.ts`

Replace the simple `presence: boolean` toggle with:

```typescript
presence: z.object({
  enabled: z.boolean().default(true),
  intervalSeconds: z.number().int().min(10).default(60),
  largeGuildThreshold: z.number().int().min(0).default(1000),
  priority: z.object({
    messageAuthors: z.boolean().default(true),
    trackedUsers: z.boolean().default(true),
    maxUsersPerGuild: z.number().int().min(0).default(500),
  }).default({}),
}).default({}),
```

And remove `invites` from the `events` object.

---

### 3.3 Config Example Update
**File:** `config.example.yaml`

```yaml
events:
  messages: true
  messageEdits: true
  messageDeletes: true
  reactions: true
  members: true
  voice: true
  guildChanges: true
  channelChanges: true
  roleChanges: true
  threads: true
  attachments: true

presence:
  enabled: true
  intervalSeconds: 60
  largeGuildThreshold: 1000
  priority:
    messageAuthors: true
    trackedUsers: true
    maxUsersPerGuild: 500
```

---

## Phase 4 — Dashboard & Broadcaster (Minimal Changes)

### 4.1 Broadcaster
**File:** `src/dashboard/socket/broadcaster.ts`

- No structural changes needed
- The poller service will call `broadcaster.toGuild(guildId, 'presence:update', payload)` exactly as the old event handler did
- Remove or keep `presenceThrottle` in the broadcaster depending on desired burst behavior (recommended: keep it)

---

## Phase 5 — Guild Audit Caveat (Documentation Only)

### 5.1 Keep Channel/Role/Thread Events
**File:** `src/bot/events/guildAudit.ts`

- Leave `channelCreate/Update/Delete`, `roleCreate/Update/Delete`, `threadCreate/Update/Delete`, `guildUpdate` as-is
- **Document limitation:** `userId` in audit records will always be `null` because self-bots cannot view the audit log to know *who* performed the action

No code changes required here beyond removing invites (done in 1.1).

---

## Behavior Matrix

| Scenario | What happens |
|---|---|
| Small guild (500 members) | Fetches all 500 members every 60s |
| Large guild (10k members) | Builds priority list from message DB, fetches only active chatters (~200 users) every 60s |
| New user sends a message | Added to priority cache on next refresh (~10 min) |
| User was being tracked, then goes quiet | Kept in priority list if `trackedUsers: true` |
| Threshold = 0 | Always priority mode (never full fetch) |
| Threshold = 999999 | Always full fetch |

---

## Execution Order

| Step | Task | File(s) |
|------|------|---------|
| 1 | Remove invite handlers | `guildAudit.ts`, `events/index.ts` |
| 2 | Clean intents | `client.ts` |
| 3 | Update config schema | `schema.ts`, `config.example.yaml` |
| 4 | Add DB table for latest presence | `schema.ts`, migration |
| 5 | Build rate-limit queue | `utils/rateLimit.ts` |
| 6 | Build presence poller service | `services/presencePoller.ts` |
| 7 | Rewrite presence handler to helper | `events/presence.ts` |
| 8 | Wire poller into startup | `main.ts`, `events/index.ts` |
| 9 | Test on a small guild first | — |

---

## Summary of Impact

| System | Change |
|--------|--------|
| **Presence tracking** | Full rewrite: event-driven → polling + diff + priority queue |
| **Client intents** | Removed (bot-only concept) |
| **Invite events** | Removed (unreliable on user accounts) |
| **Message events** | No changes (but now feed into presence priority cache) |
| **Reaction events** | No changes |
| **Voice events** | No changes |
| **Member events** | No changes (event-driven still works) |
| **Guild audit** | Kept, documented limitation on actor tracking |
| **Dashboard / broadcaster** | No structural changes |
| **Config** | New `presence` object with `priority` sub-object, removed `invites` |
| **Database** | New `latest_presences` table |

**Estimated scope:** ~400–500 lines of new code (poller + queue + priority cache), ~50 lines of deletions (invites + intents), and minor config edits.
