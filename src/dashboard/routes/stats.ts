import { Router } from 'express';
import z from 'zod';
import {
  getDailyMessageCounts,
  getTopChannels,
  getTopUsers,
  getGuildStats,
  getChannelStats,
  getChannelActivityHeatmap,
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
    const parsedRange = query.range !== undefined ? parseInt(query.range, 10) : NaN;
    const days = !Number.isNaN(parsedRange)
      ? Math.min(Math.max(parsedRange, 1), 365)
      : query.days;

    const [dailyCounts, topChannels, topUsers] = await Promise.all([
      Promise.resolve(getDailyMessageCounts(days)),
      Promise.resolve(getTopChannels(days)),
      Promise.resolve(getTopUsers(days)),
    ]);

    res.json({
      dailyCounts,
      topChannels,
      topUsers,
      periodDays: days,
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

const guildQuery = z.object({
  range: z.string().optional(),
  days: z.coerce.number().min(1).max(365).default(30),
});

router.get('/guild/:id', async (req, res, next) => {
  try {
    const query = guildQuery.parse(req.query);
    const parsedRange = query.range !== undefined ? parseInt(query.range, 10) : NaN;
    const days = !Number.isNaN(parsedRange)
      ? Math.min(Math.max(parsedRange, 1), 365)
      : query.days;

    const guildId = req.params.id;
    const [stats, dailyCounts] = await Promise.all([
      Promise.resolve(getGuildStats(guildId)),
      Promise.resolve(getDailyMessageCounts(days, guildId)),
    ]);
    res.json({ ...stats, dailyCounts, periodDays: days });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors });
      return;
    }
    next(err);
  }
});

const channelQuery = z.object({
  range: z.string().optional(),
  days: z.coerce.number().min(1).max(365).default(30),
});

router.get('/channel/:channelId', async (req, res, next) => {
  try {
    const query = channelQuery.parse(req.query);
    const parsedRange = query.range !== undefined ? parseInt(query.range, 10) : NaN;
    const days = !Number.isNaN(parsedRange)
      ? Math.min(Math.max(parsedRange, 1), 365)
      : query.days;

    const channelId = req.params.channelId;
    const [stats, dailyCounts] = await Promise.all([
      Promise.resolve(getChannelStats(channelId)),
      Promise.resolve(getDailyMessageCounts(days, undefined, channelId)),
    ]);
    res.json({ ...stats, dailyCounts, periodDays: days });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors });
      return;
    }
    logger.error(err, 'Failed to fetch channel stats');
    next(err);
  }
});

const channelHeatmapQuery = z.object({
  days: z.coerce.number().int().min(1).max(730).optional(),
  tz: z.coerce.number().int().min(-720).max(720).optional(),
});

router.get('/channel/:channelId/heatmap', async (req, res, next) => {
  try {
    const query = channelHeatmapQuery.parse(req.query);
    const days = query.days ?? 365;
    const tz = query.tz ?? 0;
    const data = getChannelActivityHeatmap(req.params.channelId, days, tz);
    res.json({ days, tz, data });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors });
      return;
    }
    logger.error(err, 'Failed to fetch channel activity heatmap');
    next(err);
  }
});

export default router;
