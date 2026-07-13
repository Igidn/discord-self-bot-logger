import { eq, sql } from 'drizzle-orm';
import { db } from '../index.js';
import * as schema from '../schema.js';
import type { GuildStats, ChannelStats } from './types.js';

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

  const topUsers = db.all<{ userId: string; username: string | null; avatarUrl: string | null; count: number }>(sql`
    SELECT m.author_id AS userId, u.username AS username, u.avatar_url AS avatarUrl, count(*) AS count
    FROM messages m
    LEFT JOIN users u ON u.id = m.author_id
    WHERE m.guild_id = ${guildId}
    GROUP BY m.author_id
    ORDER BY count DESC
    LIMIT 10
  `);

  const firstLoggedAt =
    db.get<{ ts: number | null }>(sql`SELECT min(created_at) AS ts FROM messages WHERE guild_id = ${guildId}`)?.ts ?? null;

  return {
    totalMessages,
    deletedMessages,
    totalEdits,
    totalAttachments,
    totalReactions,
    totalMemberEvents,
    totalVoiceEvents,
    firstLoggedAt,
    topChannels,
    topUsers,
  };
}

/* ------------------------------------------------------------------ */
/*  getDailyMessageCounts / getTopChannels / getTopUsers               */
/* ------------------------------------------------------------------ */

export function getDailyMessageCounts(
  days: number = 30,
  guildId?: string,
  channelId?: string,
): { day: string; count: number }[] {
  const sinceSec = Math.floor((Date.now() - days * 24 * 60 * 60 * 1000) / 1000);
  // ponytail: optional guild/channel filter — same query, one extra predicate
  // each. Channel is the most specific, so it wins when both are passed
  // (ChannelView always scopes by channel, never by guild too).
  if (channelId) {
    return db.all<{ day: string; count: number }>(sql`
      SELECT date(created_at, 'unixepoch', 'localtime') AS day, count(*) AS count
      FROM messages
      WHERE created_at >= ${sinceSec} AND channel_id = ${channelId}
      GROUP BY day
      ORDER BY day DESC
    `);
  }
  if (guildId) {
    return db.all<{ day: string; count: number }>(sql`
      SELECT date(created_at, 'unixepoch', 'localtime') AS day, count(*) AS count
      FROM messages
      WHERE created_at >= ${sinceSec} AND guild_id = ${guildId}
      GROUP BY day
      ORDER BY day DESC
    `);
  }
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
/*  getChannelStats                                                     */
/* ------------------------------------------------------------------ */

export function getChannelStats(channelId: string): ChannelStats {
  const channel = db.get<{
    id: string; name: string | null; topic: string | null; type: number | null;
    nsfw: number | null; parentId: string | null; parentName: string | null;
    guildId: string | null; guildName: string | null;
  }>(sql`
    SELECT c.id, c.name, c.topic, c.type, c.nsfw, c.parent_id AS parentId,
           p.name AS parentName, c.guild_id AS guildId, g.name AS guildName
    FROM channels c
    LEFT JOIN channels p ON p.id = c.parent_id
    LEFT JOIN guilds g ON g.id = c.guild_id
    WHERE c.id = ${channelId}
  `) ?? null;

  const totalMessages =
    db.get<{ count: number }>(sql`SELECT count(*) AS count FROM messages WHERE channel_id = ${channelId}`)?.count ?? 0;

  const deletedMessages =
    db.get<{ count: number }>(sql`SELECT count(*) AS count FROM messages WHERE channel_id = ${channelId} AND deleted_at IS NOT NULL`)?.count ?? 0;

  const totalEdits =
    db.get<{ count: number }>(sql`SELECT count(*) AS count FROM message_edits me JOIN messages m ON m.id = me.message_id WHERE m.channel_id = ${channelId}`)?.count ?? 0;

  const totalAttachments =
    db.get<{ count: number }>(sql`SELECT count(*) AS count FROM attachments a JOIN messages m ON m.id = a.message_id WHERE m.channel_id = ${channelId}`)?.count ?? 0;

  const totalReactions =
    db.get<{ count: number }>(sql`SELECT count(*) AS count FROM reactions WHERE channel_id = ${channelId}`)?.count ?? 0;

  const span = db.get<{ first: number | null; last: number | null; distinctUsers: number }>(sql`
    SELECT min(created_at) AS first, max(created_at) AS last, count(DISTINCT author_id) AS distinctUsers
    FROM messages WHERE channel_id = ${channelId}
  `);

  const topUsers = db.all<{ userId: string; username: string | null; avatarUrl: string | null; count: number }>(sql`
    SELECT m.author_id AS userId, u.username AS username, u.avatar_url AS avatarUrl, count(*) AS count
    FROM messages m
    LEFT JOIN users u ON u.id = m.author_id
    WHERE m.channel_id = ${channelId}
    GROUP BY m.author_id
    ORDER BY count DESC
    LIMIT 10
  `);

  // ponytail: custom emoji render as :name: only when we keep the name; the
  // raw emoji_id is useless to a browser without a CDN lookup, so COALESCE
  // prefers emoji_name and falls back to emoji_id only as a last resort.
  const topReactions = db.all<{ emoji: string | null; emojiId: string | null; count: number }>(sql`
    SELECT COALESCE(emoji_name, emoji_id) AS emoji, emoji_id AS emojiId, count(*) AS count
    FROM reactions
    WHERE channel_id = ${channelId} AND added = 1
    GROUP BY emoji
    ORDER BY count DESC
    LIMIT 5
  `);

  return {
    channel,
    totalMessages,
    deletedMessages,
    totalEdits,
    totalAttachments,
    totalReactions,
    firstLoggedAt: span?.first ?? null,
    lastLoggedAt: span?.last ?? null,
    distinctUsers: span?.distinctUsers ?? 0,
    topUsers,
    topReactions,
  };
}

/* ------------------------------------------------------------------ */
/*  getChannelActivityHeatmap                                          */
/* ------------------------------------------------------------------ */

export function getChannelActivityHeatmap(
  channelId: string,
  days: number = 365,
  tzOffsetMinutes: number = 0,
): ActivityHeatmapDay[] {
  const safeDays = Math.max(1, Math.min(730, days));
  const sinceSec = Math.floor((Date.now() - safeDays * 24 * 60 * 60 * 1000) / 1000);
  const safeTz = Math.max(-720, Math.min(720, Math.trunc(tzOffsetMinutes) || 0));
  const tzModifier = `${safeTz >= 0 ? '+' : '-'}${Math.abs(safeTz)} minutes`;
  return db.all<{ day: string; count: number }>(sql`
    SELECT
      date(created_at, 'unixepoch', ${tzModifier}) AS day,
      count(*) AS count
    FROM messages
    WHERE channel_id = ${channelId} AND created_at >= ${sinceSec}
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
