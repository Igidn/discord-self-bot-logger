import { Client, Message, PartialMessage } from 'discord.js-selfbot-v13';
import { sqlite } from '../../database/index.js';
import { logger } from '../../utils/logger.js';
import { requireGuild } from '../guildFilter.js';
import { broadcaster } from '../../dashboard/socket/broadcaster.js';

async function onMessageDelete(client: Client, _db: any, message: Message | PartialMessage) {
  try {
    const guildId = message.guildId ?? null;
    const channelId = message.channelId;
    const deletedAt = Math.floor(Date.now() / 1000);
    const contentSnapshot = message.content ?? null;
    const authorId = message.author?.id ?? null;

    // Set messages.deleted_at
    try {
      sqlite.prepare(`UPDATE messages SET deleted_at = ? WHERE id = ?`).run(deletedAt, message.id);
    } catch (err) {
      logger.error({ err }, 'Failed to set message deleted_at');
    }

    // Insert delete audit
    try {
      sqlite.prepare(`
        INSERT INTO message_deletes (message_id, guild_id, channel_id, author_id, content_snapshot, deleted_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(message.id, guildId, channelId, authorId, contentSnapshot, deletedAt);
    } catch (err) {
      logger.error({ err }, 'Failed to insert message delete');
    }

    broadcaster.toChannel(channelId, 'message:delete', {
      messageId: message.id,
      channelId,
      guildId,
      deletedAt,
    });

    if (guildId) {
      broadcaster.toGuild(guildId, 'message:delete', {
        messageId: message.id,
        channelId,
        deletedAt,
      });
    }
  } catch (err) {
    logger.error({ err }, 'Error in messageDelete handler');
  }
}

async function onMessageDeleteBulk(client: Client, _db: any, messages: any) {
  try {
    const first = messages.first?.() ?? null;
    const guildId = first?.guildId ?? null;
    const channelId = first?.channelId ?? 'unknown';
    const deletedAt = Math.floor(Date.now() / 1000);

    const deleteStmt = sqlite.prepare(`
      INSERT INTO message_deletes (message_id, guild_id, channel_id, author_id, content_snapshot, deleted_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const updateStmt = sqlite.prepare(`UPDATE messages SET deleted_at = ? WHERE id = ?`);

    const bulkTransaction = sqlite.transaction((msgs: any[]) => {
      for (const msg of msgs) {
        updateStmt.run(deletedAt, msg.id);
        deleteStmt.run(
          msg.id,
          msg.guildId ?? guildId,
          msg.channelId ?? channelId,
          msg.author?.id ?? null,
          msg.content ?? null,
          deletedAt
        );
      }
    });

    bulkTransaction(Array.from(messages.values()));

    broadcaster.toChannel(channelId, 'message:delete', {
      bulk: true,
      count: messages.size,
      channelId,
      guildId,
      deletedAt,
    });

    if (guildId) {
      broadcaster.toGuild(guildId, 'message:delete', {
        bulk: true,
        count: messages.size,
        channelId,
        deletedAt,
      });
    }
  } catch (err) {
    logger.error({ err }, 'Error in messageDeleteBulk handler');
  }
}

export const handleMessageDelete = requireGuild(onMessageDelete);
export const handleMessageDeleteBulk = requireGuild(onMessageDeleteBulk);
