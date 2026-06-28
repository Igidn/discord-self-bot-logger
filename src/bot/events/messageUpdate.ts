import { Client, Message, PartialMessage } from 'discord.js-selfbot-v13';
import { DrizzleDb, db } from '@/database/index.js';
import { messages, messageEdits } from '@/database/schema.js';
import { eq } from 'drizzle-orm';
import { logger } from '@/utils/logger.js';
import { requireGuild } from '../guildFilter.js';
import { broadcaster } from '@/dashboard/socket/broadcaster.js';
import {
  enrichUser,
  enrichChannel,
  enrichGuild,
  ensureGuild,
} from '../../services/enricher.js';

async function onMessageUpdate(client: Client, _db: DrizzleDb, oldMessage: Message | PartialMessage, newMessage: Message) {
  try {
    const guildId = newMessage.guildId ?? null;
    const channelId = newMessage.channelId;

    // Discord fires messageUpdate for many reasons (embeds loading, reactions, flags, etc.)
    // Only treat it as an edit if the message content actually changed.
    const oldContent = oldMessage.content ?? null;
    const newContent = newMessage.content ?? '';
    if (oldContent === newContent) {
      return;
    }

    const editedAt = newMessage.editedTimestamp
      ? new Date(newMessage.editedTimestamp)
      : new Date();

    const authorId = newMessage.author?.id ?? 'unknown';

    // If the original message wasn't logged (e.g., bot started after it was sent),
    // backfill it so the edit audit FK doesn't fail.
    if (newMessage.author) {
      enrichUser({
        id: newMessage.author.id,
        username: newMessage.author.username,
        discriminator: newMessage.author.discriminator,
        avatarURL: newMessage.author.avatarURL.bind(newMessage.author) as any,
        bot: newMessage.author.bot,
      });
    }
    if (guildId) {
      if (newMessage.guild) {
        enrichGuild({
          id: newMessage.guild.id,
          name: newMessage.guild.name,
          iconURL: newMessage.guild.iconURL.bind(newMessage.guild) as any,
          ownerId: newMessage.guild.ownerId,
          memberCount: newMessage.guild.memberCount,
          joinedAt: newMessage.guild.joinedAt,
        });
      } else {
        ensureGuild(guildId);
      }
    }
    if (newMessage.channel && guildId) {
      const ch = newMessage.channel as any;
      enrichChannel({
        id: ch.id,
        name: ch.name,
        type: ch.type,
        guildId,
        topic: ch.topic,
        nsfw: ch.nsfw,
        parentId: ch.parentId,
      });
    }

    // Build sticker markdown hyperlinks
    const stickerLinks: string[] = [];
    if (newMessage.stickers && newMessage.stickers.size > 0) {
      for (const sticker of newMessage.stickers.values()) {
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

    try {
      db.insert(messages).values({
        id: newMessage.id,
        guildId,
        channelId,
        authorId,
        content: oldMessage.content ?? newMessage.content ?? '',
        createdAt: newMessage.createdTimestamp ? new Date(newMessage.createdTimestamp) : new Date(),
        isDm: guildId ? false : true,
        replyToId: newMessage.reference?.messageId ?? null,
        stickerIds: JSON.stringify(newMessage.stickers?.map((s) => s.id) ?? []),
        stickerLinks: stickerLinks.length > 0 ? JSON.stringify(stickerLinks) : null,
        embedsJson: newMessage.embeds.length > 0 ? JSON.stringify(newMessage.embeds) : null,
        componentsJson: newMessage.components.length > 0 ? JSON.stringify(newMessage.components) : null,
        flags: newMessage.flags?.bitfield ?? 0,
        attachmentCount: newMessage.attachments?.size ?? 0,
      }).onConflictDoNothing().run();
    } catch (err) {
      logger.error({ err }, 'Failed to backfill missing message before edit');
    }

    // Update messages.edited_at
    try {
      db.update(messages).set({ editedAt }).where(eq(messages.id, newMessage.id)).run();
    } catch (err) {
      logger.error({ err }, 'Failed to update message edited_at');
    }

    // Insert edit audit
    try {
      db.insert(messageEdits).values({
        messageId: newMessage.id,
        oldContent,
        newContent,
        editedAt,
      }).run();
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
