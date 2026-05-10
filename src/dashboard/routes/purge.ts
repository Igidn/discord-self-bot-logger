import { Router } from 'express';
import { runPurge } from '@/services/retentionPurger.js';
import { loadConfig } from '@/config/loader.js';
import { logger } from '@/utils/logger.js';

const router = Router();

router.delete('/', (_req, res, next) => {
  try {
    const config = loadConfig();
    const retentionDays = config.logging.retentionDays;

    if (retentionDays <= 0) {
      res.status(400).json({ success: false, error: 'Retention purger disabled (retentionDays <= 0)' });
      return;
    }

    const deleted = runPurge(retentionDays);

    logger.info(deleted, 'Manual purge completed via API');

    res.json({ success: true, deleted });
  } catch (err) {
    logger.error({ err }, 'Manual purge failed via API');
    next(err);
  }
});

export default router;
