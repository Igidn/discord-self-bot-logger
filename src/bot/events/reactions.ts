import { Client, MessageReaction, User } from 'discord.js-selfbot-v13';
import { DrizzleDb, db } from '@/database/index.js';
import { reactions } from '@/database/schema.js';
import { logger } from '@/utils/logger.js';
import { requireGuild } from '../guildFilter.js';
import { broadcaster } from '@/dashboard/socket/broadcaster.js';

async function onReactionAdd(client: Client, _db: DrizzleDb, reaction: MessageReaction, user: User) {
  try {
    const guildId = reaction.message.guildId ?? null;
    const channelId = reaction.message.channelId;
    const messageId = reaction.message.id;
    const userId = user.id;
    const emojiId = reaction.emoji.id;
    const emojiName = reaction.emoji.name;
    const createdAt = new Date();

    db.insert(reactions).values({
      messageId,
      guildId,
      channelId,
      userId,
      emojiId,
      emojiName,
      added: true,
      createdAt,
    }).run();

    const payload = { messageId, guildId, channelId, userId, emojiId, emojiName, added: 1, createdAt };
    broadcaster.toChannel(channelId, 'reaction:add', payload);
    if (guildId) broadcaster.toGuild(guildId, 'reaction:add', payload);
  } catch (err) {
    logger.error({ err }, 'Error in messageReactionAdd handler');
  }
}

async function onReactionRemove(client: Client, _db: DrizzleDb, reaction: MessageReaction, user: User) {
  try {
    const guildId = reaction.message.guildId ?? null;
    const channelId = reaction.message.channelId;
    const messageId = reaction.message.id;
    const userId = user.id;
    const emojiId = reaction.emoji.id;
    const emojiName = reaction.emoji.name;
    const createdAt = new Date();

    db.insert(reactions).values({
      messageId,
      guildId,
      channelId,
      userId,
      emojiId,
      emojiName,
      added: false,
      createdAt,
    }).run();

    const payload = { messageId, guildId, channelId, userId, emojiId, emojiName, added: 0, createdAt };
    broadcaster.toChannel(channelId, 'reaction:remove', payload);
    if (guildId) broadcaster.toGuild(guildId, 'reaction:remove', payload);
  } catch (err) {
    logger.error({ err }, 'Error in messageReactionRemove handler');
  }
}

async function onReactionRemoveAll(client: Client, _db: DrizzleDb, message: any) {
  try {
    const guildId = message.guildId ?? null;
    const channelId = message.channelId;
    const messageId = message.id;
    const createdAt = new Date();

    db.insert(reactions).values({
      messageId,
      guildId,
      channelId,
      userId: 'system',
      emojiId: null,
      emojiName: null,
      added: false,
      createdAt,
    }).run();

    const payload = { messageId, guildId, channelId, removedAll: true, createdAt };
    broadcaster.toChannel(channelId, 'reaction:remove', payload);
    if (guildId) broadcaster.toGuild(guildId, 'reaction:remove', payload);
  } catch (err) {
    logger.error({ err }, 'Error in messageReactionRemoveAll handler');
  }
}

async function onReactionRemoveEmoji(client: Client, _db: DrizzleDb, reaction: MessageReaction) {
  try {
    const guildId = reaction.message.guildId ?? null;
    const channelId = reaction.message.channelId;
    const messageId = reaction.message.id;
    const emojiId = reaction.emoji.id;
    const emojiName = reaction.emoji.name;
    const createdAt = new Date();

    db.insert(reactions).values({
      messageId,
      guildId,
      channelId,
      userId: 'system',
      emojiId,
      emojiName,
      added: false,
      createdAt,
    }).run();

    const payload = { messageId, guildId, channelId, emojiId, emojiName, removedEmoji: true, createdAt };
    broadcaster.toChannel(channelId, 'reaction:remove', payload);
    if (guildId) broadcaster.toGuild(guildId, 'reaction:remove', payload);
  } catch (err) {
    logger.error({ err }, 'Error in messageReactionRemoveEmoji handler');
  }
}

export const handleReactionAdd = requireGuild(onReactionAdd);
export const handleReactionRemove = requireGuild(onReactionRemove);
export const handleReactionRemoveAll = requireGuild(onReactionRemoveAll);
export const handleReactionRemoveEmoji = requireGuild(onReactionRemoveEmoji);
