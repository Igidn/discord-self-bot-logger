import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { eq } from 'drizzle-orm';
import { db } from '@/database/index.js';
import { attachments } from '@/database/schema.js';
import { loadConfig } from '@/config/loader.js';
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
      const config = loadConfig();
      const attachmentsDir = path.resolve(process.cwd(), config.logging.attachments.path);
      const resolvedPath = path.resolve(attachment.localPath);
      const relative = path.relative(attachmentsDir, resolvedPath);

      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      res.sendFile(resolvedPath);
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
