import { loadConfig } from '@/config/loader.js';
import { initDatabase, closeDatabase } from '@/database/index.js';
import { startDashboardServer } from '@/dashboard/server.js';

import { client, startBot } from '@/bot/client.js';
import { db } from '@/database/index.js';
import { startRetentionPurger } from '@/services/retentionPurger.js';
import { logger } from '@/utils/logger.js';
import type { Server as HttpServer } from 'node:http';

async function main(): Promise<void> {
  logger.info('=== Discord Selfbot Logger starting ===');

  // a. Load config
  logger.info('[1/7] Loading configuration...');
  const config = loadConfig();

  // b. Initialize database
  logger.info('[2/7] Initializing database...');
  initDatabase();

  // c. Start dashboard server
  logger.info('[3/7] Starting dashboard server...');
  const server = startDashboardServer(config.dashboard.host, config.dashboard.port) as HttpServer;

  // d. Socket.IO is initialized inside startDashboardServer
  logger.info('[4/7] Socket.IO initialized via dashboard server');

  // e. Initialize bot client and register events
  logger.info('[5/7] Initializing bot client...');
  // f. Register bot events (done inside startBot)
  logger.info('[6/7] Registering bot events...');

  // g. Start retention purger
  logger.info('[7/7] Starting retention purger...');
  startRetentionPurger();

  // h. Login bot with token
  logger.info('Logging in to Discord...');
  await startBot(db);

  logger.info(
    'Startup complete. Dashboard: http://%s:%d',
    config.dashboard.host,
    config.dashboard.port
  );

  // i. Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received, cleaning up...');

    try {
      client.destroy();
      logger.info('Bot client destroyed');
    } catch (err) {
      logger.error({ err }, 'Error destroying bot client');
    }

    try {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      logger.info('Dashboard server closed');
    } catch (err) {
      logger.error({ err }, 'Error closing dashboard server');
    }

    try {
      closeDatabase();
      logger.info('Database connection closed');
    } catch (err) {
      logger.error({ err }, 'Error closing database');
    }

    logger.info('Goodbye');
    process.exit(0);
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error({ err }, 'Fatal error during startup');
  process.exit(1);
});
