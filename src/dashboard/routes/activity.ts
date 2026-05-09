import { Router } from 'express';
import z from 'zod';
import {
  getMemberEvents,
  getVoiceEvents,
  getPresenceUpdates,
  getGuildAudit,
} from '@/database/queries.js';
import { logger } from '@/utils/logger.js';

const router = Router();

const memberEventsQuery = z.object({
  guild: z.string().optional(),
  user: z.string().optional(),
  type: z.string().optional(),
  limit: z.coerce.number().min(1).max(500).default(100),
});

const voiceQuery = z.object({
  guild: z.string().optional(),
  user: z.string().optional(),
  limit: z.coerce.number().min(1).max(500).default(100),
});

const presenceQuery = z.object({
  guild: z.string().optional(),
  user: z.string().optional(),
  limit: z.coerce.number().min(1).max(500).default(100),
});

const auditQuery = z.object({
  guild: z.string().optional(),
  action: z.string().optional(),
  user: z.string().optional(),
  limit: z.coerce.number().min(1).max(500).default(100),
});

router.get('/member-events', async (req, res, next) => {
  try {
    const query = memberEventsQuery.parse(req.query);
    const events = getMemberEvents(query.guild, query.user, query.type, query.limit);
    res.json(events);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors });
      return;
    }
    logger.error(err, 'Failed to fetch member events');
    next(err);
  }
});

router.get('/voice', async (req, res, next) => {
  try {
    const query = voiceQuery.parse(req.query);
    const events = getVoiceEvents(query.guild, query.user, query.limit);
    res.json(events);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors });
      return;
    }
    next(err);
  }
});

router.get('/presence', async (req, res, next) => {
  try {
    const query = presenceQuery.parse(req.query);
    const events = getPresenceUpdates(query.guild, query.user, query.limit);
    res.json(events);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors });
      return;
    }
    next(err);
  }
});

router.get('/audit', async (req, res, next) => {
  try {
    const query = auditQuery.parse(req.query);
    const events = getGuildAudit(query.guild, query.action, query.user, query.limit);
    res.json(events);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors });
      return;
    }
    next(err);
  }
});

export default router;
