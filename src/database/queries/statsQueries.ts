import { eq, sql } from 'drizzle-orm';
import { db } from '../index.js';
import * as schema from '../schema.js';
import type { GuildStats } from './types.js';

/* ------------------------------------------------------------------ */
/*  getGuildStats                                                      */
/* ------------------------------------------------------------------ */

export function getGuildStats(guildId: string): GuildStats {
  const totalMessages =
    db.get<{ count: number }>(sql`SELECT count(*) AS count FROM messages WHERE guild_id = ${guildId}`)?.count ?? 0;

  const deletedMessages =
    db.get<{ count: number }>(sql`SELECT count(*) AS count FROM messages WHERE guild_id = ${guildId} AND deleted_at IS NOT NULL`)?.count ?? 0;

  const totalEdits =
    db.get<{ count: number }>(sql`SELECT count(*) AS count FROM message_edits me JOIN messages m ON m.id = me.message_id WHERE m.guild_id = ${guildId}`)?.count ?? 0;

  const totalAttachments =
    db.get<{ count: number }>(sql`SELECT count(*) AS count FROM attachments a JOIN messages m ON m.id = a.message_id WHERE m.guild_id = ${guildId}`)?.count ?? 0;

  const totalReactions =
    db.get<{ count: number }>(sql`SELECT count(*) AS count FROM reactions WHERE guild_id = ${guildId}`)?.count ?? 0;

  const totalMemberEvents =
    db.get<{ count: number }>(sql`SELECT count(*) AS count FROM member_events WHERE guild_id = ${guildId}`)?.count ?? 0;

  const totalVoiceEvents =
    db.get<{ count: number }>(sql`SELECT count(*) AS count FROM voice_events WHERE guild_id = ${guildId}`)?.count ?? 0;

  const topChannels = db.all<{ channelId: string; channelName: string | null; guildIconUrl: string | null; count: number }>(sql`
    SELECT
      m.channel_id AS channelId,
      c.name AS channelName,
      g.icon_url AS guildIconUrl,
      count(*) AS count
    FROM messages m
    LEFT JOIN channels c ON c.id = m.channel_id
    LEFT JOIN guilds g ON g.id = m.guild_id
    WHERE m.guild_id = ${guildId}
    GROUP BY m.channel_id
    ORDER BY count DESC
    LIMIT 10
  `);

  const topUsers = db.all<{ userId: string; count: number }>(sql`
    SELECT author_id AS userId, count(*) AS count
    FROM messages
    WHERE guild_id = ${guildId}
    GROUP BY author_id
    ORDER BY count DESC
    LIMIT 10
  `);

  return {
    totalMessages,
    deletedMessages,
    totalEdits,
    totalAttachments,
    totalReactions,
    totalMemberEvents,
    totalVoiceEvents,
    topChannels,
    topUsers,
  };
}

/* ------------------------------------------------------------------ */
/*  getDailyMessageCounts / getTopChannels / getTopUsers               */
/* ------------------------------------------------------------------ */

export function getDailyMessageCounts(days: number = 30): { day: string; count: number }[] {
  const sinceSec = Math.floor((Date.now() - days * 24 * 60 * 60 * 1000) / 1000);
  return db.all<{ day: string; count: number }>(sql`
    SELECT date(created_at, 'unixepoch', 'localtime') AS day, count(*) AS count
    FROM messages
    WHERE created_at >= ${sinceSec}
    GROUP BY day
    ORDER BY day DESC
  `);
}

export function getTopChannels(days: number = 30): { channelId: string; channelName: string | null; guildIconUrl: string | null; count: number }[] {
  const sinceSec = Math.floor((Date.now() - days * 24 * 60 * 60 * 1000) / 1000);
  return db.all<{ channelId: string; channelName: string | null; guildIconUrl: string | null; count: number }>(sql`
    SELECT
      m.channel_id AS channelId,
      c.name AS channelName,
      g.icon_url AS guildIconUrl,
      count(*) AS count
    FROM messages m
    LEFT JOIN channels c ON c.id = m.channel_id
    LEFT JOIN guilds g ON g.id = m.guild_id
    WHERE m.created_at >= ${sinceSec}
    GROUP BY m.channel_id
    ORDER BY count DESC
    LIMIT 10
  `);
}

export function getTopUsers(days: number = 30): { userId: string; username: string | null; avatarUrl: string | null; count: number }[] {
  const sinceSec = Math.floor((Date.now() - days * 24 * 60 * 60 * 1000) / 1000);
  return db.all<{ userId: string; username: string | null; avatarUrl: string | null; count: number }>(sql`
    SELECT m.author_id AS userId, u.username AS username, u.avatar_url AS avatarUrl, count(*) AS count
    FROM messages m
    LEFT JOIN users u ON u.id = m.author_id
    WHERE m.created_at >= ${sinceSec}
    GROUP BY m.author_id
    ORDER BY count DESC
    LIMIT 10
  `);
}

/* ------------------------------------------------------------------ */
/*  getUserActivityHeatmap                                             */
/* ------------------------------------------------------------------ */

export interface ActivityHeatmapDay {
  day: string;
  count: number;
}

export function getUserActivityHeatmap(
  userId: string,
  days: number = 365,
  tzOffsetMinutes: number = 0,
): ActivityHeatmapDay[] {
  const safeDays = Math.max(1, Math.min(730, days));
  const sinceSec = Math.floor((Date.now() - safeDays * 24 * 60 * 60 * 1000) / 1000);
  // Group by the viewer's UTC offset (minutes ahead of UTC) so the day buckets
  // match the client's local-time grid regardless of the server's timezone.
  // SQLite accepts a bound modifier string like '+540 minutes' / '-300 minutes'.
  const safeTz = Math.max(-720, Math.min(720, Math.trunc(tzOffsetMinutes) || 0));
  const tzModifier = `${safeTz >= 0 ? '+' : '-'}${Math.abs(safeTz)} minutes`;
  return db.all<{ day: string; count: number }>(sql`
    SELECT
      date(created_at, 'unixepoch', ${tzModifier}) AS day,
      count(*) AS count
    FROM messages
    WHERE author_id = ${userId} AND created_at >= ${sinceSec}
    GROUP BY day
    ORDER BY day ASC
  `);
}

/* ------------------------------------------------------------------ */
/*  getGuildsCount / getMessagesCount                                  */
/* ------------------------------------------------------------------ */

export function getGuildsCount(): number {
  return db.get<{ count: number }>(sql`SELECT count(*) AS count FROM guilds`)?.count ?? 0;
}

export function getMessagesCount(): number {
  return db.get<{ count: number }>(sql`SELECT count(*) AS count FROM messages`)?.count ?? 0;
}

/* ------------------------------------------------------------------ */
/*  getUserById / getUserStats                                         */
/* ------------------------------------------------------------------ */

export function getUserById(id: string) {
  return db.select().from(schema.users).where(eq(schema.users.id, id)).get();
}

export function getUserStats(userId: string): {
  messageCount: number;
  guildCount: number;
  firstMessageAt: number | null;
  lastMessageAt: number | null;
} {
  const rows = db.all<{
    messageCount: number;
    guildCount: number;
    firstMessageAt: number | null;
    lastMessageAt: number | null;
  }>(sql`
    SELECT
      count(*) AS messageCount,
      count(DISTINCT guild_id) AS guildCount,
      min(created_at) AS firstMessageAt,
      max(created_at) AS lastMessageAt
    FROM messages
    WHERE author_id = ${userId}
  `);
  const row = rows[0];
  return {
    messageCount: row?.messageCount ?? 0,
    guildCount: row?.guildCount ?? 0,
    firstMessageAt: row?.firstMessageAt ?? null,
    lastMessageAt: row?.lastMessageAt ?? null,
  };
}
