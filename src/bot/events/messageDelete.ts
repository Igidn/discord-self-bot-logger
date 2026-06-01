import { Client, Message, PartialMessage, Collection } from 'discord.js-selfbot-v13';
import { DrizzleDb, db } from '@/database/index.js';
import { messages, messageDeletes } from '@/database/schema.js';
import { eq } from 'drizzle-orm';
import { logger } from '@/utils/logger.js';
import { requireGuild } from '../guildFilter.js';
import { broadcaster } from '@/dashboard/socket/broadcaster.js';

async function onMessageDelete(client: Client, _db: DrizzleDb, message: Message | PartialMessage) {
  try {
    const guildId = message.guildId ?? null;
    const channelId = message.channelId;
    const deletedAt = new Date();
    const contentSnapshot = message.content ?? null;
    const authorId = message.author?.id ?? null;

    // Set messages.deleted_at
    try {
      db.update(messages).set({ deletedAt }).where(eq(messages.id, message.id)).run();
    } catch (err) {
      logger.error({ err }, 'Failed to set message deleted_at');
    }

    // Insert delete audit
    try {
      db.insert(messageDeletes).values({
        messageId: message.id,
        guildId,
        channelId,
        authorId,
        contentSnapshot,
        deletedAt,
      }).run();
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

async function onMessageDeleteBulk(client: Client, _db: DrizzleDb, msgsCollection: Collection<string, Message>) {
  try {
    const first = msgsCollection.first?.() ?? null;
    const guildId = first?.guildId ?? null;
    const channelId = first?.channelId ?? 'unknown';
    const deletedAt = new Date();

    const msgs = Array.from(msgsCollection.values());
    db.transaction((tx) => {
      for (const msg of msgs) {
        tx.update(messages).set({ deletedAt }).where(eq(messages.id, msg.id)).run();
        tx.insert(messageDeletes).values({
          messageId: msg.id,
          guildId: msg.guildId ?? guildId,
          channelId: msg.channelId ?? channelId,
          authorId: msg.author?.id ?? null,
          contentSnapshot: msg.content ?? null,
          deletedAt,
        }).run();
      }
    });

    broadcaster.toChannel(channelId, 'message:delete', {
      bulk: true,
      count: msgsCollection.size,
      channelId,
      guildId,
      deletedAt,
    });

    if (guildId) {
      broadcaster.toGuild(guildId, 'message:delete', {
        bulk: true,
        count: msgsCollection.size,
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
