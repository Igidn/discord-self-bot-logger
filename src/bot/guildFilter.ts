import { Client } from 'discord.js-selfbot-v13';
import { config } from '../config/loader.js';
import { logger } from '../utils/logger.js';

export type EventHandler = (client: Client, db: any, ...args: any[]) => Promise<void> | void;

export function extractGuildId(args: any[]): string | null | undefined {
  const first = args[0];
  if (!first) return undefined;

  // Message / MessageReaction / PartialMessage
  if (typeof first.guildId === 'string') return first.guildId;

  // Objects with nested guild (GuildMember, GuildBan, VoiceState, Role, Channel, Thread, Presence, Invite)
  if (first.guild?.id) return first.guild.id;

  // Bulk delete: Collection
  if (first.first && typeof first.first === 'function') {
    const msg = first.first();
    return msg?.guildId ?? msg?.guild?.id ?? null;
  }

  // Guild itself (guildUpdate): Guild-like object without .guildId or .guild
  if (first.id && typeof first.name === 'string' && first.client && !('guildId' in first) && !('guild' in first)) {
    return first.id;
  }

  return undefined;
}

export function requireGuild(handler: EventHandler): EventHandler {
  return (client, db, ...args) => {
    try {
      const guildId = extractGuildId(args);

      // DM check
      if (!guildId) {
        if (config.logging?.logDirectMessages) {
          return handler(client, db, ...args);
        }
        return;
      }

      // Discovery mode: empty whitelist = no logging
      const allowedGuilds = config.logging?.guilds ?? [];
      if (allowedGuilds.length === 0) {
        return;
      }

      if (!allowedGuilds.includes(guildId)) {
        return;
      }

      return handler(client, db, ...args);
    } catch (err) {
      logger.error({ err }, 'Error in requireGuild middleware');
    }
  };
}
