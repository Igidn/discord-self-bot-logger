import fs from 'node:fs';
import path from 'node:path';
import { db } from '@/database/index.js';
import { sql } from 'drizzle-orm';
import { config, loadConfig } from '@/config/loader.js';
import { logger } from '@/utils/logger.js';

const DAY_MS = 24 * 60 * 60 * 1000;

let lastVacuumWeek = -1;

export function startRetentionPurger(): void {
  const retentionDays = config.logging.retentionDays;

  if (retentionDays <= 0) {
    logger.info('Retention purger disabled (retentionDays <= 0)');
    return;
  }

  logger.info({ retentionDays }, 'Starting retention purger');

  // Initial run after 10s, then every 24h
  setTimeout(() => {
    try {
      runPurge();
    } catch (err) {
      logger.error({ err }, 'Scheduled retention purge failed');
    }
  }, 10000);
  setInterval(() => {
    try {
      runPurge();
    } catch (err) {
      logger.error({ err }, 'Scheduled retention purge failed');
    }
  }, DAY_MS);
}

export interface PurgeSummary {
  messages: number;
  edits: number;
  deletes: number;
  reactions: number;
  attachments: number;
  filesRemoved: number;
}

export function runPurge(retentionDaysOverride?: number): PurgeSummary {
  const retentionDays = retentionDaysOverride ?? config.logging.retentionDays;
  const cutoff = Math.floor((Date.now() - retentionDays * DAY_MS) / 1000);
  logger.info({ cutoff: new Date(cutoff * 1000).toISOString(), retentionDays }, 'Running retention purge');

  try {
    // Collect attachment files that will become orphaned
    const attachmentRows = db.all(sql`
      SELECT local_path FROM attachments
      WHERE message_id IN (SELECT id FROM messages WHERE created_at < ${cutoff})
        AND local_path IS NOT NULL
    `) as { local_path: string }[];

    const filesToDelete = attachmentRows.map((r) => r.local_path).filter(Boolean);

    // Delete associated rows using subqueries so we don't bind massive ID lists
    const editsResult = db.run(sql`
      DELETE FROM message_edits WHERE message_id IN (SELECT id FROM messages WHERE created_at < ${cutoff})
    `);
    const deletesResult = db.run(sql`
      DELETE FROM message_deletes WHERE message_id IN (SELECT id FROM messages WHERE created_at < ${cutoff})
    `);
    const reactionsResult = db.run(sql`
      DELETE FROM reactions WHERE message_id IN (SELECT id FROM messages WHERE created_at < ${cutoff})
    `);
    const attachmentsResult = db.run(sql`
      DELETE FROM attachments WHERE message_id IN (SELECT id FROM messages WHERE created_at < ${cutoff})
    `);
    const messagesResult = db.run(sql`
      DELETE FROM messages WHERE created_at < ${cutoff}
    `);

    // Remove attachment files from disk
    let filesRemoved = 0;
    for (const filePath of filesToDelete) {
      try {
        fs.unlinkSync(filePath);
        filesRemoved++;
      } catch (err) {
        logger.warn({ filePath, err }, 'Failed to delete attachment file during purge');
      }
    }

    const summary: PurgeSummary = {
      messages: messagesResult.changes,
      edits: editsResult.changes,
      deletes: deletesResult.changes,
      reactions: reactionsResult.changes,
      attachments: attachmentsResult.changes,
      filesRemoved,
    };

    logger.info(summary, 'Retention purge completed');

    cleanupOrphans();
    maybeVacuum();

    return summary;
  } catch (err) {
    logger.error({ err }, 'Retention purge failed');
    throw err;
  }
}

function cleanupOrphans(): void {
  let currentConfig = config;
  try {
    currentConfig = loadConfig();
  } catch {
    // keep in-memory config if file is invalid
  }
  const attachmentsDir = path.resolve(process.cwd(), currentConfig.logging.attachments.path);

  if (!fs.existsSync(attachmentsDir)) {
    return;
  }

  let filesScanned = 0;
  let filesRemoved = 0;

  function scanDir(dir: string): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else {
        filesScanned++;
        const row = db.get(sql`SELECT 1 AS ok FROM attachments WHERE local_path = ${fullPath} LIMIT 1`) as
          | { ok: number }
          | undefined;
        if (!row) {
          try {
            fs.unlinkSync(fullPath);
            filesRemoved++;
          } catch (err) {
            logger.warn({ fullPath, err }, 'Failed to remove orphaned attachment file');
          }
        }
      }
    }
  }

  scanDir(attachmentsDir);
  logger.info({ filesScanned, filesRemoved }, 'Orphaned attachment cleanup completed');
}

function maybeVacuum(): void {
  const currentWeek = Math.floor(Date.now() / (7 * DAY_MS));
  if (lastVacuumWeek === currentWeek) {
    return;
  }

  logger.info('Running weekly VACUUM');
  try {
    db.run(sql`VACUUM`);
    lastVacuumWeek = currentWeek;
    logger.info('VACUUM completed');
  } catch (err) {
    logger.error({ err }, 'VACUUM failed');
  }
}
