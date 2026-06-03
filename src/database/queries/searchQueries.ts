import {
  eq,
  and,
  or,
  gte,
  gt,
  lt,
  lte,
  sql,
  inArray,
  notInArray,
  isNull,
  isNotNull,
  ne,
  desc,
  type SQL,
} from 'drizzle-orm';
import { db } from '../index.js';
import * as schema from '../schema.js';
import { likeContains, likeStartsWith, likeEndsWith, attachAuthors, paginateMessages } from './helpers.js';
import type { Pagination, SearchResult } from './types.js';
import type { Filter, FilterClause } from '@/shared/filters.js';

/* ------------------------------------------------------------------ */
/*  FTS helper                                                         */
/* ------------------------------------------------------------------ */

function sanitizeFtsQuery(q: string): string {
  const tokens: string[] = [];
  const regex = /"([^"]*)"|(\S+)/g;
  let match;
  while ((match = regex.exec(q)) !== null) {
    const raw = match[1] ?? match[2];
    const hasPrefix = raw.endsWith('*');
    const clean = hasPrefix ? raw.slice(0, -1) : raw;
    if (clean.length === 0) continue;
    const escaped = clean.replace(/"/g, '""');
    tokens.push(`"${escaped}"${hasPrefix ? '*' : ''}`);
  }
  return tokens.join(' ');
}

/* ------------------------------------------------------------------ */
/*  Filter builders                                                    */
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

export function buildClauseSQL(clause: FilterClause): SQL | undefined {
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
    case 'authorId': {
      const isSnowflake = (v: string) => /^\d{17,20}$/.test(v);

      if (op === 'eq' || op === 'neq') {
        if (typeof value === 'string' && !isSnowflake(value)) {
          const matchingUsers = db.all<{ id: string }>(
            sql`SELECT id FROM users WHERE lower(username) = lower(${value})`
          );
          const ids = matchingUsers.map((u) => u.id);
          if (ids.length === 1) {
            return op === 'eq' ? eq(schema.messages.authorId, ids[0]) : ne(schema.messages.authorId, ids[0]);
          } else if (ids.length > 1) {
            return op === 'eq' ? inArray(schema.messages.authorId, ids) : notInArray(schema.messages.authorId, ids);
          }
          // No users matched this username
          return op === 'eq' ? sql`1=0` : sql`1=1`;
        }
      }

      if (op === 'in' || op === 'nin') {
        const values = Array.isArray(value) ? value : [value];
        const snowflakes: string[] = [];
        const usernames: string[] = [];

        for (const v of values) {
          const s = String(v);
          if (isSnowflake(s)) {
            snowflakes.push(s);
          } else {
            usernames.push(s);
          }
        }

        if (usernames.length > 0) {
          const matchingUsers = db.all<{ id: string }>(
            sql`SELECT id FROM users WHERE lower(username) IN (${sql.join(usernames.map((u) => sql`lower(${u})`), sql`, `)})`
          );
          snowflakes.push(...matchingUsers.map((u) => u.id));
        }

        if (snowflakes.length > 0) {
          return op === 'in' ? inArray(schema.messages.authorId, snowflakes) : notInArray(schema.messages.authorId, snowflakes);
        }
        // No users matched any of the provided values
        return op === 'in' ? sql`1=0` : sql`1=1`;
      }

      if (op === 'contains') {
        if (typeof value === 'string') {
          const matchingUsers = db.all<{ id: string }>(
            sql`SELECT id FROM users WHERE lower(username) LIKE lower(${'%' + value + '%'})`
          );
          const ids = matchingUsers.map((u) => u.id);
          if (ids.length > 0) {
            return inArray(schema.messages.authorId, ids);
          }
          // No users matched this username substring
          return sql`1=0`;
        }
      }

      col = schema.messages.authorId;
      break;
    }
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
      return likeContains(col, String(value));
    case 'startsWith':
      return likeStartsWith(col, String(value));
    case 'endsWith':
      return likeEndsWith(col, String(value));
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
  const trimmed = q.trim();
  const hasText = trimmed !== '';

  if (!hasText && !filter) {
    return { data: [], nextCursor: null };
  }

  const limit = pagination.limit ?? 50;
  const conditions: SQL[] = [];

  const filterSQL = filter ? buildFilterSQL(filter) : undefined;
  if (filterSQL) {
    conditions.push(filterSQL);
  }

  // Cursor pagination — validate format "timestampMs:id" before applying
  let cursorDate: Date | null = null;
  let cursorId: string | null = null;

  if (pagination.cursor) {
    const sepIndex = pagination.cursor.indexOf(':');
    if (sepIndex > 0) {
      const tsStr = pagination.cursor.slice(0, sepIndex);
      const cId = pagination.cursor.slice(sepIndex + 1);
      const tsNum = Number(tsStr);
      if (!isNaN(tsNum) && cId) {
        cursorDate = new Date(tsNum);
        cursorId = cId;
        conditions.push(
          or(
            lt(schema.messages.createdAt, cursorDate),
            and(eq(schema.messages.createdAt, cursorDate), lt(schema.messages.id, cursorId))!
          )!
        );
      }
    }
    // Invalid cursor format is ignored — returns results from the beginning
  }

  // Filter-only path — no text query, just filters + cursor
  if (!hasText) {
    let query = db.select().from(schema.messages).$dynamic();

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    const rows = query
      .orderBy(desc(schema.messages.createdAt), desc(schema.messages.id))
      .limit(limit + 1)
      .all();

    const { data, nextCursor } = paginateMessages(rows, limit);
    return { data: attachAuthors(data), nextCursor };
  }

  const sanitizedQ = sanitizeFtsQuery(trimmed);

  // Try FTS5 first
  try {
    const cursorSQL =
      cursorDate && cursorId
        ? sql`AND (m.created_at < ${Math.floor(cursorDate.getTime() / 1000)} OR (m.created_at = ${Math.floor(cursorDate.getTime() / 1000)} AND m.id < ${cursorId}))`
        : sql``;

    const ftsResults = db.all<{ rowid: number }>(
      sql`SELECT m.rowid FROM messages_fts m_fts JOIN messages m ON m.rowid = m_fts.rowid WHERE m_fts.content MATCH ${sanitizedQ} ${cursorSQL} ORDER BY m.created_at DESC, m.id DESC LIMIT ${limit * 3}`
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

      const { data, nextCursor } = paginateMessages(rows, limit);
      return { data: attachAuthors(data), nextCursor };
    }
  } catch {
    // FTS failed (e.g. query syntax error) — fall through to LIKE
  }

  // LIKE fallback
  conditions.push(likeContains(schema.messages.content, trimmed));

  let query = db.select().from(schema.messages).$dynamic();

  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }

  const rows = query
    .orderBy(desc(schema.messages.createdAt), desc(schema.messages.id))
    .limit(limit + 1)
    .all();

  const { data, nextCursor } = paginateMessages(rows, limit);
  return { data: attachAuthors(data), nextCursor };
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
