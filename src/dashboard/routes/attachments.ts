import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { eq } from 'drizzle-orm';
import { db } from '@/database/index.js';
import { attachments } from '@/database/schema.js';
import { logger } from '@/utils/logger.js';

const router = Router();

router.get('/:id/preview', async (req, res, next) => {
  try {
    const attachment = db
      .select()
      .from(attachments)
      .where(eq(attachments.id, req.params.id))
      .get();

    if (!attachment) {
      res.status(404).json({ error: 'Attachment not found' });
      return;
    }

    if (attachment.localPath && fs.existsSync(attachment.localPath)) {
      res.sendFile(path.resolve(attachment.localPath));
      return;
    }

    if (attachment.originalUrl) {
      res.redirect(attachment.originalUrl);
      return;
    }

    res.status(404).json({ error: 'Attachment not available' });
  } catch (err) {
    logger.error(err, 'Failed to serve attachment preview');
    next(err);
  }
});

export default router;
