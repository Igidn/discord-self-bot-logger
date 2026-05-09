import { Client, MessageReaction, User } from 'discord.js-selfbot-v13';
import { sqlite } from '../../database/index.js';
import { logger } from '../../utils/logger.js';
import { requireGuild } from '../guildFilter.js';
import { broadcaster } from '../../dashboard/socket/broadcaster.js';

async function onReactionAdd(client: Client, _db: any, reaction: MessageReaction, user: User) {
  try {
    const guildId = reaction.message.guildId ?? null;
    const channelId = reaction.message.channelId;
    const messageId = reaction.message.id;
    const userId = user.id;
    const emojiId = reaction.emoji.id;
    const emojiName = reaction.emoji.name;
    const createdAt = Math.floor(Date.now() / 1000);

    sqlite.prepare(`
      INSERT INTO reactions (message_id, guild_id, channel_id, user_id, emoji_id, emoji_name, added, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(messageId, guildId, channelId, userId, emojiId, emojiName, 1, createdAt);

    const payload = { messageId, guildId, channelId, userId, emojiId, emojiName, added: 1, createdAt };
    broadcaster.toChannel(channelId, 'reaction:add', payload);
    if (guildId) broadcaster.toGuild(guildId, 'reaction:add', payload);
  } catch (err) {
    logger.error({ err }, 'Error in messageReactionAdd handler');
  }
}

async function onReactionRemove(client: Client, _db: any, reaction: MessageReaction, user: User) {
  try {
    const guildId = reaction.message.guildId ?? null;
    const channelId = reaction.message.channelId;
    const messageId = reaction.message.id;
    const userId = user.id;
    const emojiId = reaction.emoji.id;
    const emojiName = reaction.emoji.name;
    const createdAt = Math.floor(Date.now() / 1000);

    sqlite.prepare(`
      INSERT INTO reactions (message_id, guild_id, channel_id, user_id, emoji_id, emoji_name, added, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(messageId, guildId, channelId, userId, emojiId, emojiName, 0, createdAt);

    const payload = { messageId, guildId, channelId, userId, emojiId, emojiName, added: 0, createdAt };
    broadcaster.toChannel(channelId, 'reaction:remove', payload);
    if (guildId) broadcaster.toGuild(guildId, 'reaction:remove', payload);
  } catch (err) {
    logger.error({ err }, 'Error in messageReactionRemove handler');
  }
}

async function onReactionRemoveAll(client: Client, _db: any, message: any) {
  try {
    const guildId = message.guildId ?? null;
    const channelId = message.channelId;
    const messageId = message.id;
    const createdAt = Math.floor(Date.now() / 1000);

    sqlite.prepare(`
      INSERT INTO reactions (message_id, guild_id, channel_id, user_id, emoji_id, emoji_name, added, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(messageId, guildId, channelId, 'system', null, null, 0, createdAt);

    const payload = { messageId, guildId, channelId, removedAll: true, createdAt };
    broadcaster.toChannel(channelId, 'reaction:remove', payload);
    if (guildId) broadcaster.toGuild(guildId, 'reaction:remove', payload);
  } catch (err) {
    logger.error({ err }, 'Error in messageReactionRemoveAll handler');
  }
}

async function onReactionRemoveEmoji(client: Client, _db: any, reaction: MessageReaction) {
  try {
    const guildId = reaction.message.guildId ?? null;
    const channelId = reaction.message.channelId;
    const messageId = reaction.message.id;
    const emojiId = reaction.emoji.id;
    const emojiName = reaction.emoji.name;
    const createdAt = Math.floor(Date.now() / 1000);

    sqlite.prepare(`
      INSERT INTO reactions (message_id, guild_id, channel_id, user_id, emoji_id, emoji_name, added, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(messageId, guildId, channelId, 'system', emojiId, emojiName, 0, createdAt);

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
