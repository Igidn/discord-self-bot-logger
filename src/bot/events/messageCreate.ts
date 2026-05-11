import { Client, Message } from 'discord.js-selfbot-v13';
import { sqlite } from '../../database/index.js';
import { logger } from '../../utils/logger.js';
import { requireGuild } from '../guildFilter.js';
import { broadcaster } from '../../dashboard/socket/broadcaster.js';
import { downloadAttachment } from '../../services/attachmentDownloader.js';
import {
  enrichUser,
  enrichChannel,
  enrichGuild,
  ensureGuild,
} from '../../services/enricher.js';

async function onMessageCreate(client: Client, _db: any, message: Message) {
  try {
    const isDm = !message.guildId;
    const guildId = message.guildId ?? null;
    const channelId = message.channelId;
    const authorId = message.author?.id ?? 'unknown';

    // Upsert user cache
    if (message.author) {
      enrichUser({
        id: message.author.id,
        username: message.author.username,
        discriminator: message.author.discriminator,
        avatarURL: message.author.avatarURL.bind(message.author),
        bot: message.author.bot,
      });
    }

    // Upsert guild cache (required for messages FK)
    if (message.guildId) {
      if (message.guild) {
        enrichGuild({
          id: message.guild.id,
          name: message.guild.name,
          iconURL: message.guild.iconURL.bind(message.guild),
          ownerId: message.guild.ownerId,
          joinedAt: message.guild.joinedAt,
        });
      } else {
        ensureGuild(message.guildId);
      }
    }

    // Upsert channel cache
    if (message.channel && message.guildId) {
      const ch = message.channel as any;
      enrichChannel({
        id: ch.id,
        name: ch.name,
        type: ch.type,
        guildId: message.guildId,
        topic: ch.topic,
        nsfw: ch.nsfw,
        parentId: ch.parentId,
      });
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
      author: message.author
        ? {
            id: message.author.id,
            username: message.author.username,
            avatarUrl: message.author.avatarURL({ size: 128 }),
          }
        : null,
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
