import { sqlite } from '../../database/index.js';
import { broadcaster } from '../../dashboard/socket/broadcaster.js';

/**
 * Record a presence change to the history table, upsert the latest
 * snapshot, and broadcast to connected dashboard clients.
 */
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
