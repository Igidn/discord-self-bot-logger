import { Router } from 'express';
import { getGuildsCount, getMessagesCount } from '@/database/queries.js';
import { logger } from '@/utils/logger.js';

const router = Router();

router.get('/', async (_req, res, next) => {
  try {
    const [guildsCount, messagesCount] = await Promise.all([
      getGuildsCount(),
      getMessagesCount(),
    ]);

    res.json({
      status: 'ok',
      uptime: process.uptime(),
      guildsCount,
      messagesCount,
    });
  } catch (err) {
    logger.error(err, 'Health check failed');
    next(err);
  }
});

export default router;
