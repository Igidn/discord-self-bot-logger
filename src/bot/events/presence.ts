import { Client, Presence } from 'discord.js-selfbot-v13';
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

/**
 * Handle discord.js-selfbot-v13 `presenceUpdate` events.
 * Discord pushes these after we subscribe to specific members
 * via GUILD_SUBSCRIPTIONS_BULK.
 */
export function handlePresenceUpdate(
  _client: Client,
  _db: any,
  _oldPresence: Presence | null,
  newPresence: Presence
) {
  if (!newPresence) return;

  const guildId = newPresence.guild?.id ?? null;
  const userId = newPresence.userId;
  const status = newPresence.status ?? null;
  const clientStatus = newPresence.clientStatus ? JSON.stringify(newPresence.clientStatus) : null;
  const activities = newPresence.activities?.length ? JSON.stringify(newPresence.activities) : null;

  // Lightweight deduplication: skip if state hasn't changed from our last record
  if (guildId) {
    const latest = sqlite
      .prepare(`
        SELECT status, client_status, activities_json
        FROM latest_presences
        WHERE guild_id = ? AND user_id = ?
      `)
      .get(guildId, userId) as
      | { status: string | null; client_status: string | null; activities_json: string | null }
      | undefined;

    if (
      latest &&
      latest.status === status &&
      latest.client_status === clientStatus &&
      latest.activities_json === activities
    ) {
      return;
    }
  }

  recordPresenceChange(guildId, userId, status, clientStatus, activities);
}
