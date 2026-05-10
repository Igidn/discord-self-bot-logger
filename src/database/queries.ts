import {
  eq,
  and,
  or,
  like,
  gte,
  desc,
  sql,
  count,
  inArray,
  notInArray,
  isNull,
  isNotNull,
  gt,
  lt,
  lte,
  ne,
  type SQL,
} from 'drizzle-orm';
import { db } from './index.js';
import * as schema from './schema.js';
import type { Filter, FilterClause } from '@/shared/filters.js';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface MessageFilters {
  guildId?: string;
  channelId?: string;
  authorId?: string;
  before?: Date;
  after?: Date;
  search?: string;
  hasAttachment?: boolean;
  hasEmbed?: boolean;
  hasReaction?: boolean;
  isDeleted?: boolean;
  isEdited?: boolean;
  isDm?: boolean;
}

export interface Pagination {
  limit?: number;
  cursor?: string; // format: "createdAtTimestamp:id"
}

export interface PaginatedMessages {
  data: (typeof schema.messages.$inferSelect)[];
  nextCursor: string | null;
}

export interface MessageDetail {
  message: typeof schema.messages.$inferSelect | undefined;
  edits: (typeof schema.messageEdits.$inferSelect)[];
  attachments: (typeof schema.attachments.$inferSelect)[];
  reactions: (typeof schema.reactions.$inferSelect)[];
}

export interface SearchResult {
  data: (typeof schema.messages.$inferSelect)[];
  nextCursor: string | null;
  source: 'fts' | 'like';
}

export interface GuildStats {
  totalMessages: number;
  deletedMessages: number;
  totalEdits: number;
  totalAttachments: number;
  totalReactions: number;
  totalMemberEvents: number;
  totalVoiceEvents: number;
  topChannels: { channelId: string; count: number }[];
  topUsers: { userId: string; count: number }[];
}

export interface OverviewStats {
  dailyCounts: { day: string; count: number }[];
  totalMessages: number;
  totalGuilds: number;
  totalUsers: number;
  topChannels: { channelId: string; count: number }[];
  topUsers: { userId: string; count: number }[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function buildMessageConditions(filters: MessageFilters) {
  const conditions = [];

  if (filters.guildId) conditions.push(eq(schema.messages.guildId, filters.guildId));
  if (filters.channelId) conditions.push(eq(schema.messages.channelId, filters.channelId));
  if (filters.authorId) conditions.push(eq(schema.messages.authorId, filters.authorId));
  if (filters.before) conditions.push(lt(schema.messages.createdAt, filters.before));
  if (filters.after) conditions.push(gt(schema.messages.createdAt, filters.after));
  if (filters.isDeleted === true) conditions.push(isNotNull(schema.messages.deletedAt));
  if (filters.isDeleted === false) conditions.push(isNull(schema.messages.deletedAt));
  if (filters.isEdited === true) conditions.push(isNotNull(schema.messages.editedAt));
  if (filters.isEdited === false) conditions.push(isNull(schema.messages.editedAt));
  if (filters.isDm === true) conditions.push(eq(schema.messages.isDm, true));
  if (filters.isDm === false) conditions.push(eq(schema.messages.isDm, false));
  if (filters.hasAttachment === true)
    conditions.push(
      sql`EXISTS (SELECT 1 FROM ${schema.attachments} WHERE ${schema.attachments.messageId} = ${schema.messages.id})`
    );
  if (filters.hasAttachment === false)
    conditions.push(
      sql`NOT EXISTS (SELECT 1 FROM ${schema.attachments} WHERE ${schema.attachments.messageId} = ${schema.messages.id})`
    );
  if (filters.hasEmbed === true)
    conditions.push(and(isNotNull(schema.messages.embedsJson), ne(schema.messages.embedsJson, '[]')));
  if (filters.hasEmbed === false)
    conditions.push(or(isNull(schema.messages.embedsJson), eq(schema.messages.embedsJson, '[]')));
  if (filters.hasReaction === true)
    conditions.push(
      sql`EXISTS (SELECT 1 FROM ${schema.reactions} WHERE ${schema.reactions.messageId} = ${schema.messages.id})`
    );
  if (filters.hasReaction === false)
    conditions.push(
      sql`NOT EXISTS (SELECT 1 FROM ${schema.reactions} WHERE ${schema.reactions.messageId} = ${schema.messages.id})`
    );

  return conditions;
}

/* ------------------------------------------------------------------ */
/*  getMessages                                                        */
/* ------------------------------------------------------------------ */

export function getMessages(
  filters: MessageFilters = {},
  pagination: Pagination = {}
): PaginatedMessages {
  const limit = pagination.limit ?? 50;
  const conditions = buildMessageConditions(filters);

  // Cursor pagination
  if (pagination.cursor) {
    const [cursorDate, cursorId] = pagination.cursor.split(':');
    const date = new Date(Number(cursorDate));
    conditions.push(
      or(
        lt(schema.messages.createdAt, date),
        and(eq(schema.messages.createdAt, date), lt(schema.messages.id, cursorId))
      )
    );
  }

  let query = db.select().from(schema.messages).$dynamic();

  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }

  const rows = query
    .orderBy(desc(schema.messages.createdAt), desc(schema.messages.id))
    .limit(limit + 1)
    .all();

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, -1) : rows;
  const nextCursor =
    hasMore && data.length > 0
      ? `${data[data.length - 1].createdAt?.getTime()}:${data[data.length - 1].id}`
      : null;

  return { data, nextCursor };
}

/* ------------------------------------------------------------------ */
/*  getMessageById                                                     */
/* ------------------------------------------------------------------ */

export function getMessageById(id: string): MessageDetail | null {
  const message = db.select().from(schema.messages).where(eq(schema.messages.id, id)).get();
  if (!message) return null;

  const edits = db
    .select()
    .from(schema.messageEdits)
    .where(eq(schema.messageEdits.messageId, id))
    .orderBy(desc(schema.messageEdits.editedAt))
    .all();

  const attachments = db
    .select()
    .from(schema.attachments)
    .where(eq(schema.attachments.messageId, id))
    .all();

  const reactions = db
    .select()
    .from(schema.reactions)
    .where(eq(schema.reactions.messageId, id))
    .orderBy(desc(schema.reactions.createdAt))
    .all();

  return { message, edits, attachments, reactions };
}

/* ------------------------------------------------------------------ */
/*  buildFilterSQL                                                     */
/* ------------------------------------------------------------------ */

export function buildFilterSQL(filter: Filter): SQL | undefined {
  if ('combinator' in filter) {
    const children = filter.filters
      .map(buildFilterSQL)
      .filter((c): c is SQL => c !== undefined);
    if (children.length === 0) return undefined;
    if (children.length === 1) return children[0];
    return filter.combinator === 'and' ? and(...children) : or(...children);
  }

  return buildClauseSQL(filter);
}

/** Coerce a filter value for a timestamp column into a JS Date.
 *  Accepts ISO strings (e.g. datetime-local "2026-05-10T09:27"), numbers
 *  (treated as Unix epoch milliseconds, matching JS Date.getTime()), or
 *  Date objects passed through unchanged. */
function coerceToDate(v: unknown): Date {
  if (v instanceof Date) return v;
  if (typeof v === 'number') return new Date(v);
  return new Date(String(v));
}

function buildClauseSQL(clause: FilterClause): SQL | undefined {
  const { field, op } = clause;
  let { value } = clause;

  const booleanFlagFields = new Set([
    'hasAttachment',
    'hasEmbed',
    'hasReaction',
    'isDeleted',
    'isEdited',
    'isDm',
  ]);

  if (booleanFlagFields.has(field)) {
    if (op === field || op === 'eq') {
      const isTrue = value !== false;
      switch (field) {
        case 'hasAttachment':
          return isTrue
            ? sql`EXISTS (SELECT 1 FROM ${schema.attachments} WHERE ${schema.attachments.messageId} = ${schema.messages.id})`
            : sql`NOT EXISTS (SELECT 1 FROM ${schema.attachments} WHERE ${schema.attachments.messageId} = ${schema.messages.id})`;
        case 'hasEmbed':
          return isTrue
            ? and(isNotNull(schema.messages.embedsJson), ne(schema.messages.embedsJson, '[]'))
            : or(isNull(schema.messages.embedsJson), eq(schema.messages.embedsJson, '[]'));
        case 'hasReaction':
          return isTrue
            ? sql`EXISTS (SELECT 1 FROM ${schema.reactions} WHERE ${schema.reactions.messageId} = ${schema.messages.id})`
            : sql`NOT EXISTS (SELECT 1 FROM ${schema.reactions} WHERE ${schema.reactions.messageId} = ${schema.messages.id})`;
        case 'isDeleted':
          return isTrue ? isNotNull(schema.messages.deletedAt) : isNull(schema.messages.deletedAt);
        case 'isEdited':
          return isTrue ? isNotNull(schema.messages.editedAt) : isNull(schema.messages.editedAt);
        case 'isDm':
          return isTrue ? eq(schema.messages.isDm, true) : eq(schema.messages.isDm, false);
      }
    }
    return undefined;
  }

  if (field === 'messageType') {
    const types = Array.isArray(value) ? value : [value];
    const conditions: SQL[] = [];

    for (const type of types) {
      if (type === 'reply') {
        conditions.push(isNotNull(schema.messages.replyToId));
      } else if (type === 'default') {
        conditions.push(isNull(schema.messages.replyToId));
      }
      // 'pin' and 'system' are not stored in the schema; they are silently ignored
    }

    if (conditions.length === 0) return undefined;
    if (op === 'eq') return conditions[0];
    if (op === 'in') return conditions.length === 1 ? conditions[0] : or(...conditions);
    return undefined;
  }

  let col;
  switch (field) {
    case 'guildId':
      col = schema.messages.guildId;
      break;
    case 'channelId':
      col = schema.messages.channelId;
      break;
    case 'authorId':
      col = schema.messages.authorId;
      break;
    case 'content':
      col = schema.messages.content;
      break;
    case 'createdAt':
      col = schema.messages.createdAt;
      // Coerce datetime-local strings / epoch numbers to Date objects so
      // Drizzle can correctly compare against the integer timestamp column.
      if (op !== 'isNull' && op !== 'isNotNull') {
        if (op === 'between' && Array.isArray(value) && value.length === 2) {
          value = [coerceToDate(value[0]), coerceToDate(value[1])];
        } else if (value !== undefined) {
          value = coerceToDate(value);
        }
      }
      break;
    default:
      return undefined;
  }

  switch (op) {
    case 'eq':
      return eq(col, value as any);
    case 'neq':
      return ne(col, value as any);
    case 'gt':
      return gt(col, value as any);
    case 'gte':
      return gte(col, value as any);
    case 'lt':
      return lt(col, value as any);
    case 'lte':
      return lte(col, value as any);
    case 'contains':
      return like(col, `%${value}%`);
    case 'startsWith':
      return like(col, `${value}%`);
    case 'endsWith':
      return like(col, `%${value}`);
    case 'in':
      return inArray(col, Array.isArray(value) ? value : [value]);
    case 'nin':
      return notInArray(col, Array.isArray(value) ? value : [value]);
    case 'between':
      if (Array.isArray(value) && value.length === 2) {
        return and(gte(col, value[0]), lte(col, value[1]));
      }
      return undefined;
    case 'isNull':
      return isNull(col);
    case 'isNotNull':
      return isNotNull(col);
    default:
      return undefined;
  }
}

/* ------------------------------------------------------------------ */
/*  searchMessages                                                     */
/* ------------------------------------------------------------------ */

export function searchMessages(
  q: string,
  filter?: Filter,
  pagination: Pagination = {}
): SearchResult {
  const limit = pagination.limit ?? 50;
  const conditions: SQL[] = [];

  const filterSQL = filter ? buildFilterSQL(filter) : undefined;
  if (filterSQL) {
    conditions.push(filterSQL);
  }

  // Cursor pagination — validate format "timestampMs:id" before applying
  if (pagination.cursor) {
    const sepIndex = pagination.cursor.indexOf(':');
    if (sepIndex > 0) {
      const tsStr = pagination.cursor.slice(0, sepIndex);
      const cursorId = pagination.cursor.slice(sepIndex + 1);
      const tsNum = Number(tsStr);
      if (!isNaN(tsNum) && cursorId) {
        const cursorDate = new Date(tsNum);
        conditions.push(
          or(
            lt(schema.messages.createdAt, cursorDate),
            and(eq(schema.messages.createdAt, cursorDate), lt(schema.messages.id, cursorId))
          )
        );
      }
    }
    // Invalid cursor format is ignored — returns results from the beginning
  }

  // Try FTS5 first
  try {
    const ftsResults = db.all<{ rowid: number }>(
      sql`SELECT rowid FROM messages_fts WHERE content MATCH ${q} LIMIT ${limit * 3}`
    );

    if (ftsResults.length > 0) {
      const rowids = ftsResults.map((r: { rowid: number }) => r.rowid);
      conditions.push(inArray(sql`rowid`, rowids));

      let query = db.select().from(schema.messages).$dynamic();

      if (conditions.length > 0) {
        query = query.where(and(...conditions));
      }

      const rows = query
        .orderBy(desc(schema.messages.createdAt), desc(schema.messages.id))
        .limit(limit + 1)
        .all();

      const hasMore = rows.length > limit;
      const data = hasMore ? rows.slice(0, -1) : rows;
      const nextCursor =
        hasMore && data.length > 0
          ? `${data[data.length - 1].createdAt?.getTime()}:${data[data.length - 1].id}`
          : null;

      return { data, nextCursor, source: 'fts' };
    }
  } catch {
    // FTS failed (e.g. query syntax error) — fall through to LIKE
  }

  // LIKE fallback
  conditions.push(like(schema.messages.content, `%${q}%`));

  let query = db.select().from(schema.messages).$dynamic();

  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }

  const rows = query
    .orderBy(desc(schema.messages.createdAt), desc(schema.messages.id))
    .limit(limit + 1)
    .all();

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, -1) : rows;
  const nextCursor =
    hasMore && data.length > 0
      ? `${data[data.length - 1].createdAt?.getTime()}:${data[data.length - 1].id}`
      : null;

  return { data, nextCursor, source: 'like' };
}

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

  const topChannels = db.all<{ channelId: string; count: number }>(sql`
    SELECT channel_id AS channelId, count(*) AS count
    FROM messages
    WHERE guild_id = ${guildId}
    GROUP BY channel_id
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
    SELECT date(created_at, 'unixepoch') AS day, count(*) AS count
    FROM messages
    WHERE created_at >= ${sinceSec}
    GROUP BY day
    ORDER BY day DESC
  `);

  const topChannels = db.all<{ channelId: string; count: number }>(sql`
    SELECT channel_id AS channelId, count(*) AS count
    FROM messages
    WHERE created_at >= ${sinceSec}
    GROUP BY channel_id
    ORDER BY count DESC
    LIMIT 10
  `);

  const topUsers = db.all<{ userId: string; count: number }>(sql`
    SELECT author_id AS userId, count(*) AS count
    FROM messages
    WHERE created_at >= ${sinceSec}
    GROUP BY author_id
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
/*  getUserMessages                                                    */
/* ------------------------------------------------------------------ */

export function getUserMessages(
  userId: string,
  pagination: Pagination = {}
): PaginatedMessages {
  return getMessages({ authorId: userId }, pagination);
}

/* ------------------------------------------------------------------ */
/*  getActivityEvents                                                  */
/* ------------------------------------------------------------------ */

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
/*  getMessageEdits / getMessageReactions                              */
/* ------------------------------------------------------------------ */

export function getMessageEdits(messageId: string) {
  return db
    .select()
    .from(schema.messageEdits)
    .where(eq(schema.messageEdits.messageId, messageId))
    .orderBy(desc(schema.messageEdits.editedAt))
    .all();
}

export function getMessageReactions(messageId: string) {
  return db
    .select()
    .from(schema.reactions)
    .where(eq(schema.reactions.messageId, messageId))
    .orderBy(desc(schema.reactions.createdAt))
    .all();
}

/* ------------------------------------------------------------------ */
/*  suggestField                                                       */
/* ------------------------------------------------------------------ */

export function suggestField(
  field: 'authorId' | 'channelId' | 'guildId',
  prefix: string,
  limit: number = 10,
  guildId?: string
): { id: string; label: string; count: number }[] {
  const likePattern = `${prefix}%`;

  if (field === 'authorId') {
    return db.all<{ id: string; label: string; count: number }>(sql`
      SELECT u.id AS id, u.username AS label, count(*) AS count
      FROM users u
      JOIN messages m ON m.author_id = u.id
      WHERE u.username LIKE ${likePattern}
      ${guildId ? sql`AND m.guild_id = ${guildId}` : sql``}
      GROUP BY u.id
      ORDER BY count DESC
      LIMIT ${limit}
    `);
  }

  if (field === 'channelId') {
    return db.all<{ id: string; label: string; count: number }>(sql`
      SELECT c.id AS id, c.name AS label, count(*) AS count
      FROM channels c
      JOIN messages m ON m.channel_id = c.id
      WHERE c.name LIKE ${likePattern}
      ${guildId ? sql`AND c.guild_id = ${guildId}` : sql``}
      GROUP BY c.id
      ORDER BY count DESC
      LIMIT ${limit}
    `);
  }

  // guildId
  return db.all<{ id: string; label: string; count: number }>(sql`
    SELECT g.id AS id, g.name AS label, count(*) AS count
    FROM guilds g
    JOIN messages m ON m.guild_id = g.id
    WHERE g.name LIKE ${likePattern}
    GROUP BY g.id
    ORDER BY count DESC
    LIMIT ${limit}
  `);
}

/* ------------------------------------------------------------------ */
/*  getDailyMessageCounts / getTopChannels / getTopUsers               */
/* ------------------------------------------------------------------ */

export function getDailyMessageCounts(days: number = 30): { day: string; count: number }[] {
  const sinceSec = Math.floor((Date.now() - days * 24 * 60 * 60 * 1000) / 1000);
  return db.all<{ day: string; count: number }>(sql`
    SELECT date(created_at, 'unixepoch') AS day, count(*) AS count
    FROM messages
    WHERE created_at >= ${sinceSec}
    GROUP BY day
    ORDER BY day DESC
  `);
}

export function getTopChannels(days: number = 30): { channelId: string; count: number }[] {
  const sinceSec = Math.floor((Date.now() - days * 24 * 60 * 60 * 1000) / 1000);
  return db.all<{ channelId: string; count: number }>(sql`
    SELECT channel_id AS channelId, count(*) AS count
    FROM messages
    WHERE created_at >= ${sinceSec}
    GROUP BY channel_id
    ORDER BY count DESC
    LIMIT 10
  `);
}

export function getTopUsers(days: number = 30): { userId: string; count: number }[] {
  const sinceSec = Math.floor((Date.now() - days * 24 * 60 * 60 * 1000) / 1000);
  return db.all<{ userId: string; count: number }>(sql`
    SELECT author_id AS userId, count(*) AS count
    FROM messages
    WHERE created_at >= ${sinceSec}
    GROUP BY author_id
    ORDER BY count DESC
    LIMIT 10
  `);
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

/* ------------------------------------------------------------------ */
/*  getMessagesByUser (alias)                                          */
/* ------------------------------------------------------------------ */

export function getMessagesByUser(
  userId: string,
  pagination: Pagination = {}
): PaginatedMessages {
  return getUserMessages(userId, pagination);
}

/* ------------------------------------------------------------------ */
/*  getMemberEvents / getVoiceEvents / getPresenceUpdates / getGuildAudit */
/* ------------------------------------------------------------------ */

export function getMemberEvents(
  guildId?: string,
  userId?: string,
  eventType?: string,
  limit: number = 100
) {
  const conditions: SQL[] = [];
  if (guildId) conditions.push(eq(schema.memberEvents.guildId, guildId));
  if (userId) conditions.push(eq(schema.memberEvents.userId, userId));
  if (eventType) conditions.push(eq(schema.memberEvents.eventType, eventType));

  let query = db.select().from(schema.memberEvents).$dynamic();
  if (conditions.length > 0) query = query.where(and(...conditions));
  return query.orderBy(desc(schema.memberEvents.createdAt)).limit(limit).all();
}

export function getVoiceEvents(
  guildId?: string,
  userId?: string,
  limit: number = 100
) {
  const conditions: SQL[] = [];
  if (guildId) conditions.push(eq(schema.voiceEvents.guildId, guildId));
  if (userId) conditions.push(eq(schema.voiceEvents.userId, userId));

  let query = db.select().from(schema.voiceEvents).$dynamic();
  if (conditions.length > 0) query = query.where(and(...conditions));
  return query.orderBy(desc(schema.voiceEvents.createdAt)).limit(limit).all();
}

export function getPresenceUpdates(
  guildId?: string,
  userId?: string,
  limit: number = 100
) {
  const conditions: SQL[] = [];
  if (guildId) conditions.push(eq(schema.presenceUpdates.guildId, guildId));
  if (userId) conditions.push(eq(schema.presenceUpdates.userId, userId));

  let query = db.select().from(schema.presenceUpdates).$dynamic();
  if (conditions.length > 0) query = query.where(and(...conditions));
  return query.orderBy(desc(schema.presenceUpdates.updatedAt)).limit(limit).all();
}

export function getGuildAudit(
  guildId?: string,
  actionType?: string,
  userId?: string,
  limit: number = 100
) {
  const conditions: SQL[] = [];
  if (guildId) conditions.push(eq(schema.guildAudit.guildId, guildId));
  if (actionType) conditions.push(eq(schema.guildAudit.actionType, actionType));
  if (userId) conditions.push(eq(schema.guildAudit.userId, userId));

  let query = db.select().from(schema.guildAudit).$dynamic();
  if (conditions.length > 0) query = query.where(and(...conditions));
  return query.orderBy(desc(schema.guildAudit.createdAt)).limit(limit).all();
}

/* ------------------------------------------------------------------ */
/*  getActivityEvents                                                  */
/* ------------------------------------------------------------------ */

export function getActivityEvents(
  type: 'member' | 'voice' | 'presence' | 'audit',
  guildId?: string,
  userId?: string,
  limit: number = 50
) {
  switch (type) {
    case 'member':
      return getMemberEvents(guildId, userId, undefined, limit);
    case 'voice':
      return getVoiceEvents(guildId, userId, limit);
    case 'presence':
      return getPresenceUpdates(guildId, userId, limit);
    case 'audit':
      return getGuildAudit(guildId, undefined, userId, limit);
  }
}
