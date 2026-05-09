import { Client, Message } from 'discord.js-selfbot-v13';
import { sqlite } from '../../database/index.js';
import { logger } from '../../utils/logger.js';
import { requireGuild } from '../guildFilter.js';
import { broadcaster } from '../../dashboard/socket/broadcaster.js';
import { downloadAttachment } from '../../services/attachmentDownloader.js';

async function onMessageCreate(client: Client, _db: any, message: Message) {
  try {
    const isDm = !message.guildId;
    const guildId = message.guildId ?? null;
    const channelId = message.channelId;
    const authorId = message.author?.id ?? 'unknown';

    // Upsert user cache
    try {
      const avatarUrl = message.author?.avatarURL({ size: 256 }) ?? null;
      sqlite.prepare(`
        INSERT INTO users (id, username, discriminator, avatar_url, first_seen_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          username = excluded.username,
          discriminator = excluded.discriminator,
          avatar_url = excluded.avatar_url
      `).run(
        authorId,
        message.author?.username ?? 'unknown',
        message.author?.discriminator ?? '0',
        avatarUrl,
        Math.floor(Date.now() / 1000)
      );
    } catch (err) {
      logger.error({ err }, 'Failed to upsert user in messageCreate');
    }

    // Build sticker markdown hyperlinks
    const stickerLinks: string[] = [];
    if (message.stickers && message.stickers.size > 0) {
      for (const sticker of message.stickers.values()) {
        const format = Number(sticker.format);
        let ext: string;
        if (format === 1) ext = 'png';
        else if (format === 2) ext = 'apng';
        else if (format === 3) ext = 'json';
        else if (format === 4) ext = 'gif';
        else ext = 'png';
        const url = `https://media.discordapp.net/stickers/${sticker.id}.${ext}?size=300`;
        stickerLinks.push(`[${sticker.name}](${url})`);
      }
    }

    // Insert message
    try {
      sqlite.prepare(`
        INSERT INTO messages (
          id, guild_id, channel_id, author_id, content, created_at,
          is_dm, reply_to_id, sticker_ids, sticker_links, embeds_json,
          components_json, flags
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO NOTHING
      `).run(
        message.id,
        guildId,
        channelId,
        authorId,
        message.content ?? '',
        message.createdTimestamp ? Math.floor(message.createdTimestamp / 1000) : Math.floor(Date.now() / 1000),
        isDm ? 1 : 0,
        message.reference?.messageId ?? null,
        JSON.stringify(message.stickers?.map((s) => s.id) ?? []),
        stickerLinks.length > 0 ? JSON.stringify(stickerLinks) : null,
        message.embeds.length > 0 ? JSON.stringify(message.embeds) : null,
        message.components.length > 0 ? JSON.stringify(message.components) : null,
        message.flags?.bitfield ?? 0
      );
    } catch (err) {
      logger.error({ err }, 'Failed to insert message');
    }

    // Handle attachments (images only)
    if (message.attachments && message.attachments.size > 0) {
      for (const attachment of message.attachments.values()) {
        if (attachment.contentType?.startsWith('image/')) {
          downloadAttachment(
            {
              id: attachment.id,
              url: attachment.url,
              proxyURL: attachment.proxyURL,
              size: attachment.size,
              contentType: attachment.contentType,
              width: attachment.width,
              height: attachment.height,
              name: attachment.name,
            },
            message.id,
            guildId ?? 'dm',
            channelId
          ).catch((err) => {
            logger.error({ attachmentId: attachment.id, err }, 'Attachment download failed');
          });
        }
      }
    }

    // Broadcast via Socket.IO
    const payload = {
      id: message.id,
      guildId,
      channelId,
      authorId,
      content: message.content,
      createdAt: message.createdTimestamp,
      attachments: message.attachments.size,
      stickers: stickerLinks,
    };

    broadcaster.toChannel(channelId, 'message:new', payload);
    if (guildId) {
      broadcaster.toGuild(guildId, 'message:new', payload);
    }
  } catch (err) {
    logger.error({ err }, 'Error in messageCreate handler');
  }
}

export const handleMessageCreate = requireGuild(onMessageCreate);
