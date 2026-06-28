import {
  eq,
  and,
  or,
  sql,
  inArray,
  isNull,
  isNotNull,
  ne,
  gt,
  lt,
  type SQL,
} from 'drizzle-orm';
import { db } from '../index.js';
import * as schema from '../schema.js';
import type { MessageFilters, MessageWithAuthor } from './types.js';

/* ------------------------------------------------------------------ */
/*  Channel hydration                                                  */
/* ------------------------------------------------------------------ */

export interface ChannelRef {
  id: string;
  name: string | null;
  type: number | null;
}

export function attachChannels<T extends { channelId: string }>(
  messages: T[]
): (T & { channel: ChannelRef | null })[] {
  if (messages.length === 0) return messages as (T & { channel: ChannelRef | null })[];

  const channelIds = [...new Set(messages.map((m) => m.channelId))].filter(Boolean);
  if (channelIds.length === 0) {
    return messages.map((m) => ({ ...m, channel: null })) as (T & { channel: ChannelRef | null })[];
  }

  const rows = db
    .select({
      id: schema.channels.id,
      name: schema.channels.name,
      type: schema.channels.type,
    })
    .from(schema.channels)
    .where(inArray(schema.channels.id, channelIds))
    .all();

  const map = new Map(rows.map((c) => [c.id, c]));
  return messages.map((m) => ({
    ...m,
    channel: map.get(m.channelId) ?? null,
  })) as (T & { channel: ChannelRef | null })[];
}

/* ------------------------------------------------------------------ */
/*  Attachment thumbnail hydration (batched)                           */
/* ------------------------------------------------------------------ */

export interface AttachmentThumb {
  id: string;
  fileName: string | null;
  contentType: string | null;
  width: number | null;
  height: number | null;
}

export function attachAttachments<T extends { id: string }>(
  messages: T[]
): (T & { attachments: AttachmentThumb[] })[] {
  if (messages.length === 0) return messages as (T & { attachments: AttachmentThumb[] })[];

  const messageIds = messages.map((m) => m.id);
  const rows = db
    .select({
      messageId: schema.attachments.messageId,
      id: schema.attachments.id,
      fileName: schema.attachments.fileName,
      contentType: schema.attachments.contentType,
      width: schema.attachments.width,
      height: schema.attachments.height,
    })
    .from(schema.attachments)
    .where(inArray(schema.attachments.messageId, messageIds))
    .all();

  const map = new Map<string, AttachmentThumb[]>();
  for (const row of rows) {
    const list = map.get(row.messageId) ?? [];
    list.push({
      id: row.id,
      fileName: row.fileName,
      contentType: row.contentType,
      width: row.width,
      height: row.height,
    });
    map.set(row.messageId, list);
  }
  return messages.map((m) => ({
    ...m,
    attachments: map.get(m.id) ?? [],
  })) as (T & { attachments: AttachmentThumb[] })[];
}

/* ------------------------------------------------------------------ */
/*  Like helpers                                                       */
/* ------------------------------------------------------------------ */

function escapeLikeValue(value: string): string {
  return value.replace(/[%_\\]/g, '\\$&');
}

export function likeContains(column: any, value: string): SQL {
  return sql`${column} LIKE ${'%' + escapeLikeValue(value) + '%'} ESCAPE '\\'`;
}

export function likeStartsWith(column: any, value: string): SQL {
  return sql`${column} LIKE ${escapeLikeValue(value) + '%'} ESCAPE '\\'`;
}

export function likeEndsWith(column: any, value: string): SQL {
  return sql`${column} LIKE ${'%' + escapeLikeValue(value)} ESCAPE '\\'`;
}

/* ------------------------------------------------------------------ */
/*  Message conditions builder                                         */
/* ------------------------------------------------------------------ */

export function buildMessageConditions(filters: MessageFilters) {
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
  if (filters.search) {
    conditions.push(likeContains(schema.messages.content, filters.search));
  }

  return conditions;
}

/* ------------------------------------------------------------------ */
/*  Author hydration                                                   */
/* ------------------------------------------------------------------ */

export function attachAuthors<T extends { authorId: string }>(
  messages: T[]
): (T & MessageWithAuthor)[] {
  if (messages.length === 0) return [];

  const authorIds = [...new Set(messages.map((m) => m.authorId))].filter(
    (id) => id && id !== 'unknown'
  );
  if (authorIds.length === 0) {
    return messages.map((m) => ({ ...m, author: null })) as (T & MessageWithAuthor)[];
  }

  const users = db
    .select({
      id: schema.users.id,
      username: schema.users.username,
      avatarUrl: schema.users.avatarUrl,
    })
    .from(schema.users)
    .where(inArray(schema.users.id, authorIds))
    .all();

  const userMap = new Map(users.map((u) => [u.id, u]));
  return messages.map((m) => ({
    ...m,
    author: userMap.get(m.authorId) ?? null,
  })) as (T & MessageWithAuthor)[];
}

/* ------------------------------------------------------------------ */
/*  Pagination                                                         */
/* ------------------------------------------------------------------ */

export function paginateMessages<T extends { createdAt: Date | null | undefined; id: string }>(
  rows: T[],
  limit: number
): { data: T[]; nextCursor: string | null } {
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, -1) : rows;
  const nextCursor =
    hasMore && data.length > 0
      ? `${data[data.length - 1].createdAt?.getTime()}:${data[data.length - 1].id}`
      : null;
  return { data, nextCursor };
}
