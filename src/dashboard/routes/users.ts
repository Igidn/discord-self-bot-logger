import { Router } from 'express';
import z from 'zod';
import {
  getUserById,
  getUserStats,
  getMessagesByUser,
  getAllUsers,
  getUserActivityHeatmap,
} from '@/database/queries.js';
import { logger } from '@/utils/logger.js';

const router = Router();

const listQuery = z.object({
  search: z.string().optional(),
  sort: z.enum(['messages_desc', 'messages_asc', 'username_asc', 'username_desc']).optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

const messagesQuery = z.object({
  limit: z.coerce.number().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

const heatmapQuery = z.object({
  days: z.coerce.number().int().min(1).max(730).optional(),
  tz: z.coerce.number().int().min(-720).max(720).optional(),
});

router.get('/', async (req, res, next) => {
  try {
    const query = listQuery.parse(req.query);
    const result = getAllUsers({
      search: query.search,
      sort: query.sort,
      page: query.page,
      limit: query.limit,
    });
    res.json(result);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors });
      return;
    }
    logger.error(err, 'Failed to fetch users list');
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const user = getUserById(req.params.id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const stats = getUserStats(req.params.id);
    res.json({
      ...user,
      stats,
    });
  } catch (err) {
    logger.error(err, 'Failed to fetch user');
    next(err);
  }
});

router.get('/:id/activity/heatmap', async (req, res, next) => {
  try {
    const query = heatmapQuery.parse(req.query);
    const days = query.days ?? 365;
    const tz = query.tz ?? 0;
    const data = getUserActivityHeatmap(req.params.id, days, tz);
    res.json({ days, tz, data });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors });
      return;
    }
    logger.error(err, 'Failed to fetch user activity heatmap');
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
