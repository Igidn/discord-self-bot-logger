import { Router } from 'express';
import { config, updateConfigGuilds } from '@/config/loader.js';
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

export default router;
