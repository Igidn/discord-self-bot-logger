import { Router } from 'express';
import z from 'zod';
import { eq } from 'drizzle-orm';
import {
  getMessages,
  getMessageById,
  getMessageEdits,
  getMessageReactions,
} from '@/database/queries.js';
import { db } from '@/database/index.js';
import { attachments } from '@/database/schema.js';
import { logger } from '@/utils/logger.js';

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
      search: query.search,
    };
    const pagination = { limit: query.limit, cursor: query.cursor };
    const { data, nextCursor } = getMessages(filters, pagination);
    res.json({ data, nextCursor });
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
    const message = await getMessageById(req.params.id);
    if (!message) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }
    res.json(message);
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
