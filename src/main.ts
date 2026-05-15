import { loadConfig } from "@/config/loader.js";
import { initDatabase, closeDatabase } from "@/database/index.js";
import { startDashboardServer } from "@/dashboard/server.js";

import { client, startBot } from "@/bot/client.js";
import { db } from "@/database/index.js";
import { startRetentionPurger } from "@/services/retentionPurger.js";
import { startPresencePoller } from "@/services/presencePoller.js";
import { logger } from "@/utils/logger.js";
import type { Server as HttpServer } from "node:http";

async function main(): Promise<void> {
  logger.info("=== Discord Selfbot Logger starting ===");

  const config = loadConfig();
  initDatabase();
  const server = startDashboardServer(
    config.dashboard.host,
    config.dashboard.port,
  ) as HttpServer;
  startRetentionPurger();
  logger.info("Logging in to Discord...");

  // Hydrate presence data immediately on first ready
  client.once("ready", async () => {
    await startPresencePoller(client, { immediate: true });
  });

  await startBot(db);

  logger.info(
    "Startup complete. Dashboard: http://%s:%d",
    config.dashboard.host,
    config.dashboard.port,
  );

  // i. Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutdown signal received, cleaning up...");

    try {
      client.destroy();
      logger.info("Bot client destroyed");
    } catch (err) {
      logger.error({ err }, "Error destroying bot client");
    }

    try {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      logger.info("Dashboard server closed");
    } catch (err) {
      logger.error({ err }, "Error closing dashboard server");
    }

    try {
      closeDatabase();
      logger.info("Database connection closed");
    } catch (err) {
      logger.error({ err }, "Error closing database");
    }

    logger.info("Goodbye");
    process.exit(0);
  };

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.error({ err }, "Fatal error during startup");
  process.exit(1);
});
