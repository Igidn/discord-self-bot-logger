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

  const merged: Record<string, unknown> = {
    ...fileConfig,
    logging: {
      ...fileLogging,
      attachments: {
        ...(fileLogging.attachments as Record<string, unknown>),
      },
    },
    dashboard: { ...fileDashboard },
    database: { ...fileDatabase },
  };

  const result = configSchema.safeParse(merged);

  if (!result.success) {
    logger.error({ errors: result.error.flatten() }, 'Config validation failed');
    throw new Error(`Invalid config: ${result.error.message}`);
  }

  // Ensure token is present after merge
  if (!result.data.token) {
    throw new Error(
      'Discord token is required. Set token in config.yaml'
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
  // Update in-memory config so the running process picks up the change immediately
  (config as unknown as Record<string, unknown>).logging = {
    ...(config as unknown as Record<string, unknown>).logging as Record<string, unknown>,
    guilds: guildIds,
  };
  logger.info({ guildIds }, 'Updated guild whitelist in config.yaml');
}
