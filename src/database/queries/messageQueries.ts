import { eq, and, or, lt, gt, desc, asc } from 'drizzle-orm';
import { db } from '../index.js';
import * as schema from '../schema.js';
import { buildMessageConditions, attachAuthors, paginateMessages } from './helpers.js';
import type { MessageFilters, Pagination, PaginatedMessages, MessageDetail } from './types.js';

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

  const { data, nextCursor } = paginateMessages(rows, limit);
  return { data: attachAuthors(data), nextCursor };
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
/*  getUserMessages / getMessagesByUser                                */
/* ------------------------------------------------------------------ */

export function getUserMessages(
  userId: string,
  pagination: Pagination = {}
): PaginatedMessages {
  return getMessages({ authorId: userId }, pagination);
}

export function getMessagesByUser(
  userId: string,
  pagination: Pagination = {}
): PaginatedMessages {
  return getUserMessages(userId, pagination);
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
/*  getSurroundingMessages                                             */
/* ------------------------------------------------------------------ */

export function getSurroundingMessages(
  messageId: string,
  beforeCount: number,
  afterCount: number
): { before: (typeof schema.messages.$inferSelect & { author?: { id: string; username: string | null; avatarUrl?: string | null } | null })[]; after: (typeof schema.messages.$inferSelect & { author?: { id: string; username: string | null; avatarUrl?: string | null } | null })[] } | null {
  const target = db.select().from(schema.messages).where(eq(schema.messages.id, messageId)).get();
  if (!target) return null;

  const beforeRows = db
    .select()
    .from(schema.messages)
    .where(
      and(
        eq(schema.messages.channelId, target.channelId),
        or(
          lt(schema.messages.createdAt, target.createdAt),
          and(
            eq(schema.messages.createdAt, target.createdAt),
            lt(schema.messages.id, target.id)
          )
        )
      )
    )
    .orderBy(desc(schema.messages.createdAt), desc(schema.messages.id))
    .limit(beforeCount)
    .all();

  const afterRows = db
    .select()
    .from(schema.messages)
    .where(
      and(
        eq(schema.messages.channelId, target.channelId),
        or(
          gt(schema.messages.createdAt, target.createdAt),
          and(
            eq(schema.messages.createdAt, target.createdAt),
            gt(schema.messages.id, target.id)
          )
        )
      )
    )
    .orderBy(asc(schema.messages.createdAt), asc(schema.messages.id))
    .limit(afterCount)
    .all();

  // Reverse before rows so they appear in chronological order
  return {
    before: attachAuthors(beforeRows.reverse()),
    after: attachAuthors(afterRows),
  };
}
