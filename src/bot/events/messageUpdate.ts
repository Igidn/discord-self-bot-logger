import { Client, Message, PartialMessage } from 'discord.js-selfbot-v13';
import { sqlite } from '../../database/index.js';
import { logger } from '../../utils/logger.js';
import { requireGuild } from '../guildFilter.js';
import { broadcaster } from '../../dashboard/socket/broadcaster.js';

async function onMessageUpdate(client: Client, _db: any, oldMessage: Message | PartialMessage, newMessage: Message) {
  try {
    const guildId = newMessage.guildId ?? null;
    const channelId = newMessage.channelId;
    const editedAt = newMessage.editedTimestamp
      ? Math.floor(newMessage.editedTimestamp / 1000)
      : Math.floor(Date.now() / 1000);

    // Update messages.edited_at
    try {
      sqlite.prepare(`UPDATE messages SET edited_at = ? WHERE id = ?`).run(editedAt, newMessage.id);
    } catch (err) {
      logger.error({ err }, 'Failed to update message edited_at');
    }

    // Insert edit audit
    try {
      sqlite.prepare(`
        INSERT INTO message_edits (message_id, old_content, new_content, edited_at)
        VALUES (?, ?, ?, ?)
      `).run(newMessage.id, oldMessage.content ?? null, newMessage.content ?? '', editedAt);
    } catch (err) {
      logger.error({ err }, 'Failed to insert message edit');
    }

    broadcaster.toChannel(channelId, 'message:edit', {
      messageId: newMessage.id,
      newContent: newMessage.content,
      editedAt,
    });

    if (guildId) {
      broadcaster.toGuild(guildId, 'message:edit', {
        messageId: newMessage.id,
        channelId,
        newContent: newMessage.content,
        editedAt,
      });
    }
  } catch (err) {
    logger.error({ err }, 'Error in messageUpdate handler');
  }
}

export const handleMessageUpdate = requireGuild(onMessageUpdate);
