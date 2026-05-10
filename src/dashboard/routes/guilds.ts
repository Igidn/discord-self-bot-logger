import { Router } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '@/database/index.js';
import { logger } from '@/utils/logger.js';

const router = Router();

router.get('/', async (_req, res, next) => {
  try {
    const rows = db.all<{ id: string; name: string; iconUrl: string | null; messageCount: number }>(sql`
      SELECT g.id, g.name, g.icon_url AS iconUrl, count(m.id) AS messageCount
      FROM guilds g
      LEFT JOIN messages m ON m.guild_id = g.id
      GROUP BY g.id
      ORDER BY g.name
    `);

    res.json(
      rows.map((g) => ({
        id: g.id,
        name: g.name,
        icon: g.iconUrl,
        messageCount: g.messageCount,
        memberCount: 0,
      }))
    );
  } catch (err) {
    logger.error(err, 'Failed to fetch guilds');
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const rows = db.all<{ id: string; name: string; iconUrl: string | null; messageCount: number }>(sql`
      SELECT g.id, g.name, g.icon_url AS iconUrl, count(m.id) AS messageCount
      FROM guilds g
      LEFT JOIN messages m ON m.guild_id = g.id
      WHERE g.id = ${req.params.id}
      GROUP BY g.id
    `);

    if (rows.length === 0) {
      res.status(404).json({ error: 'Guild not found' });
      return;
    }

    const g = rows[0];
    res.json({
      id: g.id,
      name: g.name,
      icon: g.iconUrl,
      messageCount: g.messageCount,
      memberCount: 0,
    });
  } catch (err) {
    logger.error(err, 'Failed to fetch guild');
    next(err);
  }
});

router.get('/:id/channels', async (req, res, next) => {
  try {
    const rows = db.all<{ id: string; name: string | null; type: number | null; messageCount: number }>(sql`
      SELECT c.id, c.name, c.type, count(m.id) AS messageCount
      FROM channels c
      LEFT JOIN messages m ON m.channel_id = c.id
      WHERE c.guild_id = ${req.params.id}
      GROUP BY c.id
      ORDER BY c.name
    `);

    res.json(
      rows.map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        messageCount: c.messageCount,
      }))
    );
  } catch (err) {
    logger.error(err, 'Failed to fetch channels');
    next(err);
  }
});

export default router;
