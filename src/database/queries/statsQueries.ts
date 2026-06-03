import { eq, sql } from 'drizzle-orm';
import { db } from '../index.js';
import * as schema from '../schema.js';
import type { GuildStats, OverviewStats } from './types.js';

/* ------------------------------------------------------------------ */
/*  getGuildStats                                                      */
/* ------------------------------------------------------------------ */

export function getGuildStats(guildId: string): GuildStats {
  const totalMessages =
    db.all<{ count: number }>(sql`SELECT count(*) AS count FROM messages WHERE guild_id = ${guildId}`)[0]?.count ?? 0;

  const deletedMessages =
    db.all<{ count: number }>(sql`SELECT count(*) AS count FROM messages WHERE guild_id = ${guildId} AND deleted_at IS NOT NULL`)[0]?.count ?? 0;

  const totalEdits =
    db.all<{ count: number }>(sql`SELECT count(*) AS count FROM message_edits me JOIN messages m ON m.id = me.message_id WHERE m.guild_id = ${guildId}`)[0]?.count ?? 0;

  const totalAttachments =
    db.all<{ count: number }>(sql`SELECT count(*) AS count FROM attachments a JOIN messages m ON m.id = a.message_id WHERE m.guild_id = ${guildId}`)[0]?.count ?? 0;

  const totalReactions =
    db.all<{ count: number }>(sql`SELECT count(*) AS count FROM reactions WHERE guild_id = ${guildId}`)[0]?.count ?? 0;

  const totalMemberEvents =
    db.all<{ count: number }>(sql`SELECT count(*) AS count FROM member_events WHERE guild_id = ${guildId}`)[0]?.count ?? 0;

  const totalVoiceEvents =
    db.all<{ count: number }>(sql`SELECT count(*) AS count FROM voice_events WHERE guild_id = ${guildId}`)[0]?.count ?? 0;

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
/*  getOverviewStats                                                   */
/* ------------------------------------------------------------------ */

export function getOverviewStats(days: number = 30): OverviewStats {
  const sinceSec = Math.floor((Date.now() - days * 24 * 60 * 60 * 1000) / 1000);

  const totalMessages =
    db.all<{ count: number }>(sql`SELECT count(*) AS count FROM messages WHERE created_at >= ${sinceSec}`)[0]?.count ?? 0;

  const totalGuilds =
    db.all<{ count: number }>(sql`SELECT count(*) AS count FROM guilds`)[0]?.count ?? 0;

  const totalUsers =
    db.all<{ count: number }>(sql`SELECT count(*) AS count FROM users`)[0]?.count ?? 0;

  const dailyCounts = db.all<{ day: string; count: number }>(sql`
    SELECT date(created_at, 'unixepoch', 'localtime') AS day, count(*) AS count
    FROM messages
    WHERE created_at >= ${sinceSec}
    GROUP BY day
    ORDER BY day DESC
  `);

  const topChannels = db.all<{ channelId: string; channelName: string | null; guildIconUrl: string | null; count: number }>(sql`
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

  const topUsers = db.all<{ userId: string; username: string | null; count: number }>(sql`
    SELECT m.author_id AS userId, u.username AS username, count(*) AS count
    FROM messages m
    LEFT JOIN users u ON u.id = m.author_id
    WHERE m.created_at >= ${sinceSec}
    GROUP BY m.author_id
    ORDER BY count DESC
    LIMIT 10
  `);

  return {
    dailyCounts,
    totalMessages,
    totalGuilds,
    totalUsers,
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
/*  getGuildsCount / getMessagesCount                                  */
/* ------------------------------------------------------------------ */

export function getGuildsCount(): number {
  return db.all<{ count: number }>(sql`SELECT count(*) AS count FROM guilds`)[0]?.count ?? 0;
}

export function getMessagesCount(): number {
  return db.all<{ count: number }>(sql`SELECT count(*) AS count FROM messages`)[0]?.count ?? 0;
}

/* ------------------------------------------------------------------ */
/*  getUserById / getUserMessageCount                                  */
/* ------------------------------------------------------------------ */

export function getUserById(id: string) {
  return db.select().from(schema.users).where(eq(schema.users.id, id)).get();
}

export function getUserMessageCount(userId: string): number {
  return (
    db.all<{ count: number }>(sql`SELECT count(*) AS count FROM messages WHERE author_id = ${userId}`)[0]?.count ?? 0
  );
}

export function getUserGuildCount(userId: string): number {
  return (
    db.all<{ count: number }>(sql`SELECT count(DISTINCT guild_id) AS count FROM messages WHERE author_id = ${userId}`)[0]?.count ?? 0
  );
}

export function getUserFirstMessageAt(userId: string): number | null {
  const rows = db.all<{ createdAt: number | null }>(
    sql`SELECT min(created_at) AS createdAt FROM messages WHERE author_id = ${userId}`
  );
  return rows[0]?.createdAt ?? null;
}

export function getUserLastMessageAt(userId: string): number | null {
  const rows = db.all<{ createdAt: number | null }>(
    sql`SELECT max(created_at) AS createdAt FROM messages WHERE author_id = ${userId}`
  );
  return rows[0]?.createdAt ?? null;
}
