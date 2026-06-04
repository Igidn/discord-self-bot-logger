import { Router } from 'express';
import z from 'zod';
import { eq } from 'drizzle-orm';
import {
  getMessages,
  searchMessages,
  getMessageEdits,
  getMessageReactions,
  getSurroundingMessages,
} from '@/database/queries.js';
import { db } from '@/database/index.js';
import { attachments, messages, users } from '@/database/schema.js';
import { logger } from '@/utils/logger.js';
import type { Filter } from '@/shared/filters.js';

const router = Router();

const querySchema = z.object({
  guild: z.string().optional(),
  channel: z.string().optional(),
  author: z.string().optional(),
  before: z.coerce.number().optional(),
  after: z.coerce.number().optional(),
  search: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

router.get('/', async (req, res, next) => {
  try {
    const query = querySchema.parse(req.query);
    const filters = {
      guildId: query.guild,
      channelId: query.channel,
      authorId: query.author,
      before: query.before ? new Date(query.before) : undefined,
      after: query.after ? new Date(query.after) : undefined,
    };
    const pagination = { limit: query.limit, cursor: query.cursor };

    if (query.search) {
      const searchFilters: Filter = {
        combinator: 'and',
        filters: [],
      };
      if (filters.guildId) {
        searchFilters.filters.push({ field: 'guildId', op: 'eq', value: filters.guildId });
      }
      if (filters.channelId) {
        searchFilters.filters.push({ field: 'channelId', op: 'eq', value: filters.channelId });
      }
      if (filters.authorId) {
        searchFilters.filters.push({ field: 'authorId', op: 'eq', value: filters.authorId });
      }
      if (filters.before) {
        searchFilters.filters.push({ field: 'createdAt', op: 'lt', value: filters.before });
      }
      if (filters.after) {
        searchFilters.filters.push({ field: 'createdAt', op: 'gt', value: filters.after });
      }

      const { data, nextCursor } = searchMessages(
        query.search,
        searchFilters.filters.length > 0 ? searchFilters : undefined,
        pagination
      );
      res.json({ data, nextCursor });
    } else {
      const { data, nextCursor } = getMessages(filters, pagination);
      res.json({ data, nextCursor });
    }
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors });
      return;
    }
    logger.error(err, 'Failed to fetch messages');
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const message = db
      .select()
      .from(messages)
      .where(eq(messages.id, req.params.id))
      .get();
    if (!message) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }

    const author =
      message.authorId && message.authorId !== 'unknown'
        ? db
            .select({
              id: users.id,
              username: users.username,
              avatarUrl: users.avatarUrl,
            })
            .from(users)
            .where(eq(users.id, message.authorId))
            .get()
        : null;

    res.json({ ...message, author: author ?? null });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/surrounding', async (req, res, next) => {
  try {
    const rawBefore = Number(req.query.beforeCount);
    const beforeCount = Number.isFinite(rawBefore) ? Math.max(0, Math.min(rawBefore, 100)) : 20;
    const rawAfter = Number(req.query.afterCount);
    const afterCount = Number.isFinite(rawAfter) ? Math.max(0, Math.min(rawAfter, 100)) : 20;

    const result = getSurroundingMessages(req.params.id, beforeCount, afterCount);
    if (!result) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/edits', async (req, res, next) => {
  try {
    const edits = await getMessageEdits(req.params.id);
    res.json(edits);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/reactions', async (req, res, next) => {
  try {
    const reactions = await getMessageReactions(req.params.id);
    res.json(reactions);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/attachments', async (req, res, next) => {
  try {
    const rows = db
      .select()
      .from(attachments)
      .where(eq(attachments.messageId, req.params.id))
      .all();
    res.json(rows);
  } catch (err) {
    logger.error(err, 'Failed to fetch attachments');
    next(err);
  }
});

export default router;
