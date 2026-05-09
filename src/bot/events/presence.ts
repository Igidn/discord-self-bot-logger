import { Client, Presence } from 'discord.js-selfbot-v13';
import { sqlite } from '../../database/index.js';
import { logger } from '../../utils/logger.js';
import { requireGuild } from '../guildFilter.js';
import { broadcaster } from '../../dashboard/socket/broadcaster.js';

const presenceThrottle = new Map<string, number>();
const PRESENCE_THROTTLE_MS = 30_000;

async function onPresenceUpdate(client: Client, _db: any, _oldPresence: Presence | null, newPresence: Presence) {
  try {
    const userId = newPresence.userId;
    const guildId = newPresence.guild?.id ?? null;
    const now = Date.now();

    // Throttle: 1 per user per 30s
    const last = presenceThrottle.get(userId) ?? 0;
    if (now - last < PRESENCE_THROTTLE_MS) {
      return;
    }
    presenceThrottle.set(userId, now);

    // Evict stale entries to prevent unbounded growth
    for (const [uid, ts] of presenceThrottle) {
      if (now - ts > PRESENCE_THROTTLE_MS * 2) {
        presenceThrottle.delete(uid);
      }
    }

    const status = newPresence.status;
    const clientStatus = newPresence.clientStatus ? JSON.stringify(newPresence.clientStatus) : null;
    const activities = newPresence.activities.length > 0 ? JSON.stringify(newPresence.activities) : null;
    const updatedAt = Math.floor(now / 1000);

    sqlite.prepare(`
      INSERT INTO presence_updates (guild_id, user_id, status, client_status, activities_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(guildId, userId, status, clientStatus, activities, updatedAt);

    const payload = { guildId, userId, status, clientStatus, activities, updatedAt };
    if (guildId) {
      broadcaster.toGuild(guildId, 'presence:update', payload);
    }
    broadcaster.toGlobal('presence:update', payload);
  } catch (err) {
    logger.error({ err }, 'Error in presenceUpdate handler');
  }
}

export const handlePresenceUpdate = requireGuild(onPresenceUpdate);
