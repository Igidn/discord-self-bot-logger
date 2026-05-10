import express from 'express';
import { createServer } from 'node:http';
import type { Server as HttpServer } from 'node:http';
import path from 'node:path';
import { logger } from '@/utils/logger.js';
import { errorHandler } from '@/dashboard/middleware/errorHandler.js';
import { restAuth } from '@/dashboard/middleware/auth.js';
import { initSocketIO } from '@/dashboard/socket/index.js';

import healthRouter from '@/dashboard/routes/health.js';
import configRouter from '@/dashboard/routes/config.js';
import messagesRouter from '@/dashboard/routes/messages.js';
import searchRouter from '@/dashboard/routes/search.js';
import activityRouter from '@/dashboard/routes/activity.js';
import usersRouter from '@/dashboard/routes/users.js';
import statsRouter from '@/dashboard/routes/stats.js';
import exportRouter from '@/dashboard/routes/export.js';

export function startDashboardServer(host: string, port: number): HttpServer {
  const app = express();
  const server = createServer(app);

  initSocketIO(server);

  app.use(express.json({ limit: '1mb' }));

  app.use('/api/v1', restAuth);
  app.use('/api/v1/health', healthRouter);
  app.use('/api/v1/config', configRouter);
  app.use('/api/v1/messages', messagesRouter);
  app.use('/api/v1/search', searchRouter);
  app.use('/api/v1/activity', activityRouter);
  app.use('/api/v1/users', usersRouter);
  app.use('/api/v1/stats', statsRouter);
  app.use('/api/v1/export', exportRouter);

  const staticPath = path.resolve(process.cwd(), 'dashboard-ui', 'dist');
  app.use(express.static(staticPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(staticPath, 'index.html'));
  });

  app.use(errorHandler);

  server.listen(port, host, () => {
    logger.info(
      `Dashboard server running at http://${host}:${port}`
    );
  });

  return server;
}
