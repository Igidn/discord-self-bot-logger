import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import pino from 'pino';

function getLogLevel(): string {
  try {
    const configPath = path.resolve(process.cwd(), 'config.yaml');
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf-8');
      const parsed = yaml.load(raw) as Record<string, unknown> | null | undefined;
      if (parsed && typeof parsed.logLevel === 'string') {
        return parsed.logLevel;
      }
    }
  } catch {
    // ignore read/parse errors and fall back to default
  }
  return 'info';
}

const isDev = process.env.NODE_ENV !== 'production';

export const logger = pino({
  level: getLogLevel(),
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
});
