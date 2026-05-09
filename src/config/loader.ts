import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { configSchema, type Config } from './schema.js';
import { logger } from '../utils/logger.js';

const CONFIG_PATH = path.resolve(process.cwd(), 'config.yaml');

function loadYamlFile(filePath: string): Record<string, unknown> {
  if (!fs.existsSync(filePath)) {
    logger.warn(`${filePath} not found, using defaults`);
    return {};
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = yaml.load(raw) as Record<string, unknown> | null | undefined;
    logger.info(`Loaded config from ${filePath}`);
    return parsed ?? {};
  } catch (err) {
    logger.warn({ err }, `Failed to parse ${filePath}, using defaults`);
    return {};
  }
}

export function loadConfig(): Config {
  const fileConfig = loadYamlFile(CONFIG_PATH);

  const fileLogging = (fileConfig.logging as Record<string, unknown>) || {};
  const fileDashboard = (fileConfig.dashboard as Record<string, unknown>) || {};
  const fileDatabase = (fileConfig.database as Record<string, unknown>) || {};

  // Merge file config with environment variables (env wins)
  const merged: Record<string, unknown> = {
    ...fileConfig,
    token: process.env.TOKEN ?? fileConfig.token,
    logging: {
      ...fileLogging,
      guilds: process.env.LOGGING_GUILDS?.split(',') ?? fileLogging.guilds,
      logDirectMessages: process.env.LOG_DIRECT_MESSAGES
        ? process.env.LOG_DIRECT_MESSAGES === 'true'
        : fileLogging.logDirectMessages,
      retentionDays: process.env.RETENTION_DAYS
        ? Number(process.env.RETENTION_DAYS)
        : fileLogging.retentionDays,
      attachments: {
        ...(fileLogging.attachments as Record<string, unknown>),
        path: process.env.ATTACHMENTS_PATH ?? (fileLogging.attachments as Record<string, unknown>)?.path,
      },
    },
    dashboard: {
      ...fileDashboard,
      host: process.env.DASHBOARD_HOST ?? fileDashboard.host,
      port: process.env.DASHBOARD_PORT
        ? Number(process.env.DASHBOARD_PORT)
        : fileDashboard.port,
      authToken: process.env.AUTH_TOKEN ?? fileDashboard.authToken,
    },
    database: {
      ...fileDatabase,
      path: process.env.DATABASE_PATH ?? fileDatabase.path,
      wal: process.env.DATABASE_WAL
        ? process.env.DATABASE_WAL === 'true'
        : fileDatabase.wal,
    },
  };

  const result = configSchema.safeParse(merged);

  if (!result.success) {
    logger.error({ errors: result.error.flatten() }, 'Config validation failed');
    throw new Error(`Invalid config: ${result.error.message}`);
  }

  // Ensure token is present after merge
  if (!result.data.token) {
    throw new Error(
      'Discord token is required. Set TOKEN env var or token in config.yaml'
    );
  }

  return result.data;
}

export const config = loadConfig();

export function updateConfigGuilds(guildIds: string[]): void {
  let parsed: Record<string, unknown> = {};
  if (fs.existsSync(CONFIG_PATH)) {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    parsed = (yaml.load(raw) as Record<string, unknown>) ?? {};
  }
  const logging = (parsed.logging as Record<string, unknown>) || {};
  logging.guilds = guildIds;
  parsed.logging = logging;
  fs.writeFileSync(CONFIG_PATH, yaml.dump(parsed, { lineWidth: -1 }));
  logger.info({ guildIds }, 'Updated guild whitelist in config.yaml');
}
