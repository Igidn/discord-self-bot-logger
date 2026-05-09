import fs from 'node:fs';
import path from 'node:path';
import { createWriteStream } from 'node:fs';
import { db } from '@/database/index.js';
import { sql, SQL } from 'drizzle-orm';
import { logger } from '@/utils/logger.js';

export interface ExportFilters {
  guildId?: string;
  channelId?: string;
  authorId?: string;
  after?: number;
  before?: number;
  search?: string;
}

interface MessageRow {
  id: string;
  guild_id: string | null;
  channel_id: string;
  author_id: string;
  content: string | null;
  created_at: number;
  edited_at: number | null;
  deleted_at: number | null;
  is_dm: number;
  reply_to_id: string | null;
  sticker_ids: string | null;
  sticker_links: string | null;
  embeds_json: string | null;
  components_json: string | null;
  flags: number;
  author_username: string | null;
  channel_name: string | null;
}

export interface ExportJob {
  id: string;
  format: 'jsonl' | 'csv' | 'html';
  filters: ExportFilters;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  filePath?: string;
  totalRows: number;
  error?: string;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
}

const jobs = new Map<string, ExportJob>();

function generateJobId(): string {
  return `exp_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createExportJob(format: 'jsonl' | 'csv' | 'html', filters: ExportFilters = {}): string {
  const jobId = generateJobId();
  const job: ExportJob = {
    id: jobId,
    format,
    filters,
    status: 'pending',
    totalRows: 0,
    createdAt: Date.now(),
  };
  jobs.set(jobId, job);

  // Defer processing to avoid blocking the caller
  setImmediate(() => runExportJob(job));

  return jobId;
}

export function getExportJob(jobId: string): ExportJob | undefined {
  return jobs.get(jobId);
}

export function getAllExportJobs(): ExportJob[] {
  return Array.from(jobs.values());
}

export const exportJobs = jobs;

async function runExportJob(job: ExportJob): Promise<void> {
  job.status = 'processing';
  job.startedAt = Date.now();

  const outDir = path.join(process.cwd(), 'storage', 'exports');
  fs.mkdirSync(outDir, { recursive: true });
  const filePath = path.join(outDir, `${job.id}.${job.format}`);
  job.filePath = filePath;

  const stream = createWriteStream(filePath, { encoding: 'utf-8' });

  try {
    if (job.format === 'html') {
      stream.write(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Export ${job.id}</title>
<style>
body{font-family:system-ui,-apple-system,sans-serif;margin:24px;color:#111}
table{border-collapse:collapse;width:100%;font-size:14px}
th,td{border:1px solid #ddd;padding:10px;text-align:left;vertical-align:top}
th{background:#f8f9fa;font-weight:600;position:sticky;top:0}
tr:nth-child(even){background:#fafafa}
td{max-width:400px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
</style>
</head>
<body>
<h1>Exported Messages</h1>
<table>
<thead>
<tr><th>ID</th><th>Guild</th><th>Channel</th><th>Author</th><th>Content</th><th>Created At</th></tr>
</thead>
<tbody>
`);
    } else if (job.format === 'csv') {
      stream.write('id,guild_id,channel_id,channel_name,author_id,author_username,content,created_at,edited_at,deleted_at,is_dm\n');
    }

    let cursor: { createdAt: number; id: string } | null = null;
    let pages = 0;

    while (true) {
      const rows = fetchPage(job.filters, cursor);
      if (rows.length === 0) break;

      for (const row of rows) {
        job.totalRows++;
        if (job.format === 'jsonl') {
          stream.write(JSON.stringify(row) + '\n');
        } else if (job.format === 'csv') {
          stream.write(
            formatCsvRow([
              row.id,
              row.guild_id ?? '',
              row.channel_id,
              row.channel_name ?? '',
              row.author_id,
              row.author_username ?? '',
              row.content ?? '',
              new Date(row.created_at * 1000).toISOString(),
              row.edited_at ? new Date(row.edited_at * 1000).toISOString() : '',
              row.deleted_at ? new Date(row.deleted_at * 1000).toISOString() : '',
              row.is_dm ? 'true' : 'false',
            ]) + '\n'
          );
        } else if (job.format === 'html') {
          stream.write(
            `<tr>` +
            `<td>${escapeHtml(row.id)}</td>` +
            `<td>${escapeHtml(row.guild_id ?? '')}</td>` +
            `<td>${escapeHtml(row.channel_name ?? row.channel_id)}</td>` +
            `<td>${escapeHtml(row.author_username ?? row.author_id)}</td>` +
            `<td>${escapeHtml(row.content ?? '')}</td>` +
            `<td>${escapeHtml(new Date(row.created_at * 1000).toISOString())}</td>` +
            `</tr>\n`
          );
        }
      }

      const last = rows[rows.length - 1];
      cursor = { createdAt: last.created_at, id: last.id };
      pages++;

      if (pages % 10 === 0) {
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
    }

    if (job.format === 'html') {
      stream.write('</tbody></table></body></html>\n');
    }

    await new Promise<void>((resolve, reject) => {
      stream.end(() => resolve());
      stream.on('error', reject);
    });

    job.status = 'completed';
    job.completedAt = Date.now();
    logger.info({ jobId: job.id, totalRows: job.totalRows, format: job.format }, 'Export job completed');
  } catch (err) {
    job.status = 'failed';
    job.error = err instanceof Error ? err.message : String(err);
    logger.error({ jobId: job.id, error: job.error }, 'Export job failed');
    stream.destroy();
    try {
      fs.unlinkSync(filePath);
    } catch {
      // ignore cleanup failure
    }
  }
}

function fetchPage(filters: ExportFilters, cursor: { createdAt: number; id: string } | null): MessageRow[] {
  const conditions: SQL[] = [];

  if (filters.guildId) conditions.push(sql`m.guild_id = ${filters.guildId}`);
  if (filters.channelId) conditions.push(sql`m.channel_id = ${filters.channelId}`);
  if (filters.authorId) conditions.push(sql`m.author_id = ${filters.authorId}`);
  if (filters.after) conditions.push(sql`m.created_at > ${filters.after}`);
  if (filters.before) conditions.push(sql`m.created_at < ${filters.before}`);

  if (cursor) {
    conditions.push(sql`(m.created_at < ${cursor.createdAt} OR (m.created_at = ${cursor.createdAt} AND m.id < ${cursor.id}))`);
  }

  const where = conditions.length > 0 ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;

  return db.all(sql`
    SELECT
      m.id,
      m.guild_id,
      m.channel_id,
      m.author_id,
      m.content,
      m.created_at,
      m.edited_at,
      m.deleted_at,
      m.is_dm,
      m.reply_to_id,
      m.sticker_ids,
      m.sticker_links,
      m.embeds_json,
      m.components_json,
      m.flags,
      u.username AS author_username,
      c.name AS channel_name
    FROM messages m
    LEFT JOIN users u ON u.id = m.author_id
    LEFT JOIN channels c ON c.id = m.channel_id
    ${where}
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT 1000
  `) as MessageRow[];
}

function formatCsvRow(values: (string | number | boolean)[]): string {
  return values
    .map((v) => {
      const s = String(v);
      if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    })
    .join(',');
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
