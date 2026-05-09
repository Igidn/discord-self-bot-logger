import { Router } from 'express';
import z from 'zod';
import { getUserById, getUserMessageCount, getMessagesByUser } from '@/database/queries.js';
import { logger } from '@/utils/logger.js';

const router = Router();

const messagesQuery = z.object({
  limit: z.coerce.number().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

router.get('/:id', async (req, res, next) => {
  try {
    const user = getUserById(req.params.id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const messageCount = getUserMessageCount(req.params.id);
    res.json({ ...user, stats: { messageCount } });
  } catch (err) {
    logger.error(err, 'Failed to fetch user');
    next(err);
  }
});

router.get('/:id/messages', async (req, res, next) => {
  try {
    const query = messagesQuery.parse(req.query);
    const result = getMessagesByUser(req.params.id, { limit: query.limit, cursor: query.cursor });
    res.json(result);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors });
      return;
    }
    next(err);
  }
});

export default router;
