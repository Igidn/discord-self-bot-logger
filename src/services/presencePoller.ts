import { Client, Guild, GuildMember, Collection } from 'discord.js-selfbot-v13';
import { sqlite } from '../database/index.js';
import { logger } from '../utils/logger.js';
import { AsyncQueue } from '../utils/rateLimit.js';
import { broadcaster } from '../dashboard/socket/broadcaster.js';
import { config } from '../config/loader.js';

const queue = new AsyncQueue();

/* ------------------------------------------------------------------ */
/*  Priority cache (refreshed every ~10 min)                           */
/* ------------------------------------------------------------------ */

const priorityCache = new Map<string, string[]>();
const priorityCacheAt = new Map<string, number>();
const PRIORITY_CACHE_TTL_MS = 10 * 60 * 1000;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

function refreshPriorityCache(guildId: string, maxUsers: number): string[] {
  const authors: string[] = sqlite
    .prepare(`SELECT DISTINCT author_id FROM messages WHERE guild_id = ?`)
    .pluck()
    .all(guildId) as string[];

  const tracked: string[] = sqlite
    .prepare(`SELECT user_id FROM latest_presences WHERE guild_id = ?`)
    .pluck()
    .all(guildId) as string[];

  const combined = [...new Set([...authors, ...tracked])].slice(0, maxUsers);
  priorityCache.set(guildId, combined);
  priorityCacheAt.set(guildId, Date.now());
  return combined;
}

function getPriorityUsers(guildId: string, maxUsers: number): string[] {
  const cached = priorityCache.get(guildId);
  const cachedAt = priorityCacheAt.get(guildId) ?? 0;
  if (cached && Date.now() - cachedAt < PRIORITY_CACHE_TTL_MS) {
    return cached;
  }
  return refreshPriorityCache(guildId, maxUsers);
}

/* ------------------------------------------------------------------ */
/*  Presence serialization & diffing                                 */
/* ------------------------------------------------------------------ */

function serializePresence(member: GuildMember) {
  const p = member.presence;
  return {
    status: p?.status ?? null,
    clientStatus: p?.clientStatus ? JSON.stringify(p.clientStatus) : null,
    activities: p?.activities?.length ? JSON.stringify(p.activities) : null,
  };
}

interface LatestPresenceRow {
  status: string | null;
  client_status: string | null;
  activities_json: string | null;
}

function hasChanged(
  oldRow: LatestPresenceRow | undefined,
  current: { status: string | null; clientStatus: string | null; activities: string | null }
): boolean {
  if (!oldRow) return true;
  return (
    oldRow.status !== current.status ||
    oldRow.client_status !== current.clientStatus ||
    oldRow.activities_json !== current.activities
  );
}

/* ------------------------------------------------------------------ */
/*  Recording a change (history + latest + broadcast)                  */
/* ------------------------------------------------------------------ */

export function recordPresenceChange(
  guildId: string | null,
  userId: string,
  status: string | null,
  clientStatus: string | null,
  activities: string | null
) {
  const updatedAt = Math.floor(Date.now() / 1000);

  sqlite.prepare(`
    INSERT INTO presence_updates (guild_id, user_id, status, client_status, activities_json, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(guildId, userId, status, clientStatus, activities, updatedAt);

  if (guildId) {
    sqlite.prepare(`
      INSERT INTO latest_presences (guild_id, user_id, status, client_status, activities_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(guild_id, user_id) DO UPDATE SET
        status = excluded.status,
        client_status = excluded.client_status,
        activities_json = excluded.activities_json,
        updated_at = excluded.updated_at
    `).run(guildId, userId, status, clientStatus, activities, updatedAt);
  }

  const payload = { guildId, userId, status, clientStatus, activities, updatedAt };
  if (guildId) {
    broadcaster.toGuild(guildId, 'presence:update', payload);
  }
  broadcaster.toGlobal('presence:update', payload);
}

/* ------------------------------------------------------------------ */
/*  Fetch helpers (always via AsyncQueue)                              */
/* ------------------------------------------------------------------ */

async function safeFetch<T>(fn: () => Promise<T>, label: string, guildId: string): Promise<T | null> {
  try {
    return await fn();
  } catch (err: any) {
    if (err.status === 429) {
      const retryAfter = err.retryAfter || 5000;
      logger.warn({ guildId, retryAfter, label }, 'Rate limited, backing off');
      await new Promise((r) => setTimeout(r, retryAfter));
    } else {
      logger.error({ err, guildId, label }, 'Fetch failed');
    }
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Per-guild poll                                                     */
/* ------------------------------------------------------------------ */

async function pollGuild(guild: Guild) {
  const threshold = config.logging.presence.largeGuildThreshold;
  const maxUsers = config.logging.presence.priority.maxUsersPerGuild;
  const memberCount = guild.memberCount ?? 0;
  const isLarge = memberCount > threshold;

  let members: GuildMember[] = [];

  if (!isLarge) {
    const fetched = await queue.add(
      () => safeFetch(
        () => guild.members.fetch({ withPresences: true }),
        'full-fetch',
        guild.id
      ),
      1000
    );
    if (fetched) {
      members = Array.from((fetched as Collection<string, GuildMember>).values());
    }
  } else {
    const useAuthors = config.logging.presence.priority.messageAuthors;
    const useTracked = config.logging.presence.priority.trackedUsers;

    if (!useAuthors && !useTracked) {
      logger.warn({ guildId: guild.id }, 'Large guild with no priority sources enabled, skipping');
      return;
    }

    const priorityIds = getPriorityUsers(guild.id, maxUsers);
    if (priorityIds.length === 0) {
      logger.debug({ guildId: guild.id }, 'No priority users for large guild, skipping');
      return;
    }

    const batches = chunk(priorityIds, 100);
    for (const batch of batches) {
      const fetched = await queue.add(
        () => safeFetch(
          () => guild.members.fetch({ user: batch, withPresences: true }),
          'batch-fetch',
          guild.id
        ),
        1000
      );
      if (fetched) {
        members.push(...Array.from((fetched as Collection<string, GuildMember>).values()));
      }
    }
  }

  // Load current latest presences into memory for fast diffing
  const rows = sqlite
    .prepare(`SELECT user_id, status, client_status, activities_json FROM latest_presences WHERE guild_id = ?`)
    .all(guild.id) as Array<{ user_id: string; status: string | null; client_status: string | null; activities_json: string | null }>;

  const latestMap = new Map<string, LatestPresenceRow>();
  for (const r of rows) {
    latestMap.set(r.user_id, {
      status: r.status,
      client_status: r.client_status,
      activities_json: r.activities_json,
    });
  }

  for (const member of members) {
    const current = serializePresence(member);
    const old = latestMap.get(member.id);

    if (hasChanged(old, current)) {
      recordPresenceChange(guild.id, member.id, current.status, current.clientStatus, current.activities);
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export async function startPresencePoller(client: Client, options?: { immediate?: boolean }) {
  if (!config.logging.presence.enabled) {
    logger.info('Presence polling is disabled');
    return;
  }

  const intervalMs = config.logging.presence.intervalSeconds * 1000;

  async function tick() {
    const guildIds = config.logging.guilds;
    if (guildIds.length === 0) {
      logger.debug('No guilds configured, skipping presence poll');
      return;
    }

    for (const guildId of guildIds) {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) {
        logger.debug({ guildId }, 'Guild not in cache, skipping presence poll');
        continue;
      }

      try {
        await pollGuild(guild);
      } catch (err) {
        logger.error({ err, guildId }, 'Error polling guild presence');
      }
    }
  }

  if (options?.immediate) {
    logger.info('Running initial presence hydration...');
    await tick();
  }

  setInterval(() => {
    tick().catch((err) => logger.error({ err }, 'Presence poller tick failed'));
  }, intervalMs);

  logger.info(
    { intervalSeconds: config.logging.presence.intervalSeconds },
    'Presence poller started'
  );
}
