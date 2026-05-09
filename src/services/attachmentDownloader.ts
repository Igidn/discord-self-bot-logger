import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import type { Readable } from 'node:stream';
import axios from 'axios';
import sharp from 'sharp';
import PQueue from 'p-queue';
import { db } from '@/database/index.js';
import { sql } from 'drizzle-orm';
import { logger } from '@/utils/logger.js';
import { loadConfig } from '@/config/loader.js';

export interface Attachment {
  id: string;
  url: string;
  proxyURL?: string | null;
  size: number;
  contentType?: string | null;
  width?: number | null;
  height?: number | null;
  name?: string | null;
}

interface AttachmentConfig {
  enabled: boolean;
  maxSizeMb: number;
  path: string;
  compression: {
    enabled: boolean;
    quality: number;
    maxWidth: number;
    maxHeight: number;
    format: 'webp' | 'jpeg' | 'png';
    stripMetadata: boolean;
  };
}

function getAttachmentConfig(): AttachmentConfig {
  const config = loadConfig();
  return config.logging.attachments;
}

export const queue = new PQueue({ concurrency: 3 });

export async function downloadAttachment(
  attachment: Attachment,
  messageId: string,
  guildId: string,
  channelId: string
): Promise<void> {
  await queue.add(() => _downloadAttachment(attachment, messageId, guildId, channelId));
}

async function _downloadAttachment(
  attachment: Attachment,
  messageId: string,
  guildId: string,
  channelId: string
): Promise<void> {
  const cfg = getAttachmentConfig();
  if (!cfg.enabled) {
    return;
  }

  if (!attachment.contentType || !attachment.contentType.startsWith('image/')) {
    logger.debug({ attachmentId: attachment.id, contentType: attachment.contentType }, 'Skipping non-image attachment');
    return;
  }

  const maxRetries = 2;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await attemptDownload(attachment, messageId, guildId, channelId, cfg);
      return;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      logger.warn(
        { attachmentId: attachment.id, attempt: attempt + 1, error: lastError.message },
        'Attachment download failed, retrying...'
      );
    }
  }

  logger.error(
    { attachmentId: attachment.id, error: lastError?.message },
    'Attachment download failed after all retries'
  );

  // Record failure so original URL is preserved for reference
  try {
    db.run(sql`
      INSERT INTO attachments (id, message_id, file_name, original_url, original_size_bytes, content_type, local_path, compressed_size_bytes, width, height, created_at)
      VALUES (
        ${attachment.id},
        ${messageId},
        ${attachment.name ?? null},
        ${attachment.url},
        ${attachment.size},
        ${attachment.contentType},
        NULL,
        NULL,
        ${attachment.width ?? null},
        ${attachment.height ?? null},
        ${Math.floor(Date.now() / 1000)}
      )
      ON CONFLICT(id) DO UPDATE SET
        original_url = excluded.original_url,
        original_size_bytes = excluded.original_size_bytes,
        content_type = excluded.content_type
    `);
  } catch (dbErr) {
    logger.error({ attachmentId: attachment.id, error: dbErr }, 'Failed to insert failed-attachment record');
  }
}

async function attemptDownload(
  attachment: Attachment,
  messageId: string,
  guildId: string,
  channelId: string,
  cfg: AttachmentConfig
): Promise<void> {
  const url = attachment.proxyURL || attachment.url;

  // b. HEAD request to check content-length
  const headResp = await axios.head(url, { timeout: 15000, maxRedirects: 5 });
  const contentLength = headResp.headers['content-length'];
  const maxBytes = cfg.maxSizeMb * 1024 * 1024;
  if (contentLength && parseInt(String(contentLength), 10) > maxBytes) {
    logger.warn(
      { attachmentId: attachment.id, contentLength, maxBytes },
      'Attachment exceeds max size, skipping'
    );
    return;
  }

  // c. Stream download to temp path
  const tmpDir = path.join(process.cwd(), 'storage', '.tmp');
  fs.mkdirSync(tmpDir, { recursive: true });
  const tempPath = path.join(tmpDir, `${attachment.id}.tmp`);

  const response = await axios.get<Readable>(url, {
    responseType: 'stream',
    timeout: 60000,
    maxRedirects: 5,
    headers: { Accept: attachment.contentType ?? 'image/*' },
  });

  await pipeline(response.data, createWriteStream(tempPath));

  // d. Compress with sharp
  const comp = cfg.compression;
  let transformer = sharp(tempPath, { failOnError: false }).resize({
    width: comp.maxWidth,
    height: comp.maxHeight,
    fit: 'inside',
    withoutEnlargement: true,
  });

  if (comp.format === 'jpeg') {
    transformer = transformer.jpeg({ quality: comp.quality, force: true });
  } else if (comp.format === 'webp') {
    transformer = transformer.webp({ quality: comp.quality, force: true });
  } else if (comp.format === 'png') {
    transformer = transformer.png({ force: true });
  }

  if (!comp.stripMetadata) {
    transformer = transformer.withMetadata();
  }

  // e. Save to storage/attachments/:guildId/:channelId/:messageId/:attachmentId.:ext
  const ext = comp.format === 'jpeg' ? 'jpg' : comp.format;
  const outDir = path.join(process.cwd(), cfg.path, guildId, channelId, messageId);
  fs.mkdirSync(outDir, { recursive: true });
  const finalPath = path.join(outDir, `${attachment.id}.${ext}`);

  await transformer.toFile(finalPath);

  const stats = fs.statSync(finalPath);
  const compressedSize = stats.size;

  let meta: sharp.Metadata | undefined;
  try {
    meta = await sharp(finalPath).metadata();
  } catch {
    // ignore metadata read failure
  }

  try {
    fs.unlinkSync(tempPath);
  } catch {
    // ignore temp cleanup failure
  }

  // f. Insert into attachments table with metadata
  db.run(sql`
    INSERT INTO attachments (id, message_id, file_name, original_url, original_size_bytes, content_type, local_path, compressed_size_bytes, width, height, created_at)
    VALUES (
      ${attachment.id},
      ${messageId},
      ${attachment.name ?? null},
      ${attachment.url},
      ${attachment.size},
      ${attachment.contentType},
      ${finalPath},
      ${compressedSize},
      ${meta?.width ?? attachment.width ?? null},
      ${meta?.height ?? attachment.height ?? null},
      ${Math.floor(Date.now() / 1000)}
    )
    ON CONFLICT(id) DO UPDATE SET
      original_url = excluded.original_url,
      local_path = excluded.local_path,
      compressed_size_bytes = excluded.compressed_size_bytes,
      width = excluded.width,
      height = excluded.height
  `);

  logger.info(
    { attachmentId: attachment.id, messageId, finalPath, compressedSize },
    'Attachment downloaded and compressed'
  );
}
