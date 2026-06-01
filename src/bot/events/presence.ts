import { Client, Presence } from 'discord.js-selfbot-v13';
import { DrizzleDb, db } from '@/database/index.js';
import { presenceUpdates, latestPresences } from '@/database/schema.js';
import { eq, and } from 'drizzle-orm';
import { broadcaster } from '@/dashboard/socket/broadcaster.js';

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
  const updatedAt = new Date();

  db.insert(presenceUpdates).values({
    guildId,
    userId,
    status,
    clientStatus,
    activitiesJson: activities,
    updatedAt,
  }).run();

  if (guildId) {
    db.insert(latestPresences).values({
      guildId,
      userId,
      status,
      clientStatus,
      activitiesJson: activities,
      updatedAt,
    }).onConflictDoUpdate({
      target: [latestPresences.guildId, latestPresences.userId],
      set: {
        status,
        clientStatus,
        activitiesJson: activities,
        updatedAt,
      },
    }).run();
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
  _db: DrizzleDb,
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
      const latest = db
        .select()
        .from(latestPresences)
        .where(and(eq(latestPresences.guildId, guildId), eq(latestPresences.userId, userId)))
        .get();

      if (
        latest &&
        latest.status === status &&
        latest.clientStatus === clientStatus &&
        latest.activitiesJson === activities
      ) {
        return;
      }
    }

  recordPresenceChange(guildId, userId, status, clientStatus, activities);
}
