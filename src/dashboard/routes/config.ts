import { Router } from 'express';
import { config, updateConfigGuilds, updateConfigDm, updateConfigRetention } from '@/config/loader.js';
import { logger } from '@/utils/logger.js';

const router = Router();

router.get('/', (_req, res) => {
  const cfg = config;
  const safe = {
    ...cfg,
    token: '[REDACTED]',
  };
  res.json(safe);
});

router.post('/guilds', async (req, res, next) => {
  try {
    const { guildIds } = req.body as { guildIds?: string[] };
    if (!Array.isArray(guildIds) || !guildIds.every((id) => typeof id === 'string')) {
      res.status(400).json({ error: 'guildIds must be an array of strings' });
      return;
    }
    await updateConfigGuilds(guildIds);
    logger.info({ guildIds }, 'Updated guild whitelist');
    res.json({ success: true, guildIds });
  } catch (err) {
    next(err);
  }
});

router.post('/logging/dm', async (req, res, next) => {
  try {
    const { enabled } = req.body as { enabled?: boolean };
    if (typeof enabled !== 'boolean') {
      res.status(400).json({ error: 'enabled must be a boolean' });
      return;
    }
    await updateConfigDm(enabled);
    logger.info({ enabled }, 'Updated DM logging setting');
    res.json({ success: true, logDirectMessages: enabled });
  } catch (err) {
    next(err);
  }
});

router.post('/logging/retention', async (req, res, next) => {
  try {
    const { days } = req.body as { days?: number };
    if (typeof days !== 'number' || !Number.isInteger(days) || days < 1) {
      res.status(400).json({ error: 'days must be a positive integer' });
      return;
    }
    await updateConfigRetention(days);
    logger.info({ days }, 'Updated retention days');
    res.json({ success: true, retentionDays: days });
  } catch (err) {
    next(err);
  }
});

export default router;
