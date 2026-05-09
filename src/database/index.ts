import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import path from 'path';
import { fileURLToPath } from 'url';
import * as schema from './schema.js';
import { logger } from '../utils/logger.js';
import { ensureDir } from '../utils/paths.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dbPath = process.env.DATABASE_PATH || path.resolve(process.cwd(), 'storage', 'logs.db');

ensureDir(path.dirname(dbPath));

const sqlite: Database.Database = new Database(dbPath);

// Enable WAL mode for better concurrency and performance
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });
export { sqlite };

// Run migrations
const migrationsFolder = path.join(__dirname, 'migrations');
try {
  migrate(db, { migrationsFolder });
  logger.info('Database migrations completed successfully');
} catch (err) {
  logger.error({ err }, 'Failed to run database migrations');
  throw err;
}

logger.info(`Database connected at ${dbPath} (WAL mode)`);

export function initDatabase(): void {
  // Database is already initialized at module load time.
  // This function exists for explicit lifecycle management in main.ts.
}

export function closeDatabase(): void {
  sqlite.close();
  logger.info('Database connection closed');
}
