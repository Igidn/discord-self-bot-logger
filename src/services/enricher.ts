import { db } from '@/database/index.js';
import { sql } from 'drizzle-orm';
import { logger } from '@/utils/logger.js';

export interface DiscordUser {
  id: string;
  username: string;
  discriminator?: string;
  avatarURL?: (options?: { size?: number }) => string | null;
  bot: boolean;
}

export interface DiscordChannel {
  id: string;
  name?: string | null;
  type: number;
  guildId?: string | null;
  topic?: string | null;
  nsfw?: boolean;
  parentId?: string | null;
}

export interface DiscordGuild {
  id: string;
  name: string;
  iconURL?: (options?: { size?: number }) => string | null;
  ownerId: string;
  joinedAt: Date | null;
}

export interface DiscordMessage {
  id: string;
  author: DiscordUser;
  channel: DiscordChannel;
  guild: DiscordGuild | null;
}

class SimpleLRU<T> {
  private cache = new Map<string, { value: T; lastAccess: number }>();
  constructor(private maxSize: number) {}

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    entry.lastAccess = Date.now();
    return entry.value;
  }

  set(key: string, value: T): void {
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      let oldestKey: string | null = null;
      let oldestTime = Infinity;
      for (const [k, v] of this.cache) {
        if (v.lastAccess < oldestTime) {
          oldestTime = v.lastAccess;
          oldestKey = k;
        }
      }
      if (oldestKey) this.cache.delete(oldestKey);
    }
    this.cache.set(key, { value, lastAccess: Date.now() });
  }
}

const userCache = new SimpleLRU<boolean>(1000);
const channelCache = new SimpleLRU<boolean>(1000);
const guildCache = new SimpleLRU<boolean>(1000);

export function enrichUser(user: DiscordUser): void {
  if (userCache.get(user.id)) return;

  const avatarUrl = typeof user.avatarURL === 'function' ? user.avatarURL({ size: 128 }) : null;

  try {
    db.run(sql`
      INSERT INTO users (id, username, discriminator, avatar_url, bot, first_seen_at)
      VALUES (
        ${user.id},
        ${user.username},
        ${user.discriminator ?? '0'},
        ${avatarUrl},
        ${user.bot ? 1 : 0},
        ${Math.floor(Date.now() / 1000)}
      )
      ON CONFLICT(id) DO UPDATE SET
        username = excluded.username,
        discriminator = excluded.discriminator,
        avatar_url = excluded.avatar_url,
        bot = excluded.bot
    `);
    userCache.set(user.id, true);
  } catch (err) {
    logger.error({ userId: user.id, err }, 'Failed to enrich user');
  }
}

export function enrichChannel(channel: DiscordChannel): void {
  if (channelCache.get(channel.id)) return;

  try {
    db.run(sql`
      INSERT INTO channels (id, guild_id, name, type, topic, nsfw, parent_id)
      VALUES (
        ${channel.id},
        ${channel.guildId ?? null},
        ${channel.name ?? null},
        ${channel.type},
        ${channel.topic ?? null},
        ${channel.nsfw ? 1 : 0},
        ${channel.parentId ?? null}
      )
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        type = excluded.type,
        topic = excluded.topic,
        nsfw = excluded.nsfw,
        parent_id = excluded.parent_id
    `);
    channelCache.set(channel.id, true);
  } catch (err) {
    logger.error({ channelId: channel.id, err }, 'Failed to enrich channel');
  }
}

export function enrichGuild(guild: DiscordGuild): void {
  if (guildCache.get(guild.id)) return;

  const iconUrl = typeof guild.iconURL === 'function' ? guild.iconURL({ size: 128 }) : null;
  const joinedAt = guild.joinedAt ? Math.floor(guild.joinedAt.getTime() / 1000) : null;

  try {
    db.run(sql`
      INSERT INTO guilds (id, name, icon_url, owner_id, joined_at, configured_at)
      VALUES (
        ${guild.id},
        ${guild.name},
        ${iconUrl},
        ${guild.ownerId},
        ${joinedAt},
        ${Math.floor(Date.now() / 1000)}
      )
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        icon_url = excluded.icon_url,
        owner_id = excluded.owner_id,
        joined_at = excluded.joined_at
    `);
    guildCache.set(guild.id, true);
  } catch (err) {
    logger.error({ guildId: guild.id, err }, 'Failed to enrich guild');
  }
}

export function enrichMessage(message: DiscordMessage): {
  authorUsername: string;
  channelName: string | null;
  guildName: string | null;
} {
  enrichUser(message.author);
  enrichChannel(message.channel);
  if (message.guild) {
    enrichGuild(message.guild);
  }

  return {
    authorUsername: message.author.username,
    channelName: message.channel.name ?? null,
    guildName: message.guild?.name ?? null,
  };
}
