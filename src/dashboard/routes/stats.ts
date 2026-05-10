import { Router } from 'express';
import z from 'zod';
import {
  getDailyMessageCounts,
  getTopChannels,
  getTopUsers,
  getGuildStats,
} from '@/database/queries.js';
import { logger } from '@/utils/logger.js';

const router = Router();

const overviewQuery = z.object({
  range: z.string().optional(),
  days: z.coerce.number().min(1).max(365).default(30),
});

router.get('/overview', async (req, res, next) => {
  try {
    const query = overviewQuery.parse(req.query);
    const days = query.range
      ? Math.min(Math.max(parseInt(query.range, 10) || 30, 1), 365)
      : query.days;

    const [daily, topChannels, topUsers] = await Promise.all([
      Promise.resolve(getDailyMessageCounts(days)),
      Promise.resolve(getTopChannels(days)),
      Promise.resolve(getTopUsers(days)),
    ]);

    res.json({
      daily,
      topChannels,
      topUsers,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors });
      return;
    }
    logger.error(err, 'Failed to fetch overview stats');
    next(err);
  }
});

router.get('/guild/:id', async (req, res, next) => {
  try {
    const stats = getGuildStats(req.params.id);
    res.json(stats);
  } catch (err) {
    next(err);
  }
});

export default router;
