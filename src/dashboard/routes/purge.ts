import { Router } from 'express';
import { runPurge } from '@/services/retentionPurger.js';
import { loadConfig } from '@/config/loader.js';
import { logger } from '@/utils/logger.js';

const router = Router();

router.delete('/', (req, res, next) => {
  const remoteAddr = req.socket?.remoteAddress ?? req.ip ?? '';
  const isLocal =
    remoteAddr === '127.0.0.1' ||
    remoteAddr === '::1' ||
    remoteAddr === '::ffff:127.0.0.1';

  if (!isLocal) {
    res.status(403).json({ error: 'Access denied: purge endpoint is restricted to local connections' });
    return;
  }

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
