import { db } from '@/database/index.js';
import { users, channels, guilds } from '@/database/schema.js';
import { logger } from '@/utils/logger.js';

export interface DiscordUser {
  id: string;
  username: string;
  discriminator?: string;
  avatarURL?: (options?: { size?: number }) => string | null;
  // Global display name (Discord's `global_name`), distinct from username.
  globalName?: string | null;
  // User banner URL getter; throws on the lib if the banner hash wasn't
  // fetched, so callers should only pass it when the object carries banner.
  bannerURL?: (options?: { size?: number }) => string | null;
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
  memberCount?: number;
  joinedAt: Date | null;
}

export interface DiscordMessage {
  id: string;
  author: DiscordUser;
  channel: DiscordChannel;
  guild: DiscordGuild | null;
}

class SimpleLRU<T> {
  private cache = new Map<string, T>();
  constructor(private maxSize: number) {}

  get(key: string): T | undefined {
    if (!this.cache.has(key)) return undefined;
    const value = this.cache.get(key)!;
    // Promote to newest by re-inserting
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  set(key: string, value: T): void {
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) this.cache.delete(oldestKey);
    }
    this.cache.delete(key);
    this.cache.set(key, value);
  }
}

const userCache = new SimpleLRU<boolean>(1000);
const channelCache = new SimpleLRU<boolean>(1000);
const guildCache = new SimpleLRU<'placeholder' | 'full'>(1000);

export function enrichUser(user: DiscordUser): void {
  if (userCache.get(user.id)) return;

  const avatarUrl = typeof user.avatarURL === 'function' ? user.avatarURL({ size: 128 }) : null;

  // ponytail: banner is only present when the gateway/REST payload carried
  // the hash. Most message-author payloads omit it, so bannerUrl stays null
  // for most users. A dedicated client.users.fetch() pass would fill it; add
  // when banners are wanted for logged (not historical) users.
  let bannerUrl: string | null = null;
  if (typeof user.bannerURL === 'function') {
    try {
      bannerUrl = user.bannerURL({ size: 512 });
    } catch {
      bannerUrl = null; // USER_BANNER_NOT_FETCHED
    }
  }

  try {
    db.insert(users).values({
      id: user.id,
      username: user.username,
      discriminator: user.discriminator ?? '0',
      avatarUrl,
      displayName: user.globalName ?? null,
      bannerUrl,
      bot: user.bot,
      firstSeenAt: new Date(),
    }).onConflictDoUpdate({
      target: users.id,
      set: {
        username: user.username,
        discriminator: user.discriminator ?? '0',
        avatarUrl,
        displayName: user.globalName ?? null,
        bannerUrl,
        bot: user.bot,
      },
    }).run();
    userCache.set(user.id, true);
  } catch (err) {
    logger.error({ userId: user.id, err }, 'Failed to enrich user');
  }
}

export function enrichChannel(channel: DiscordChannel): void {
  if (channelCache.get(channel.id)) return;

  try {
    db.insert(channels).values({
      id: channel.id,
      guildId: channel.guildId ?? null,
      name: channel.name ?? null,
      type: channel.type,
      topic: channel.topic ?? null,
      nsfw: channel.nsfw ?? false,
      parentId: channel.parentId ?? null,
    }).onConflictDoUpdate({
      target: channels.id,
      set: {
        name: channel.name ?? null,
        type: channel.type,
        topic: channel.topic ?? null,
        nsfw: channel.nsfw ?? false,
        parentId: channel.parentId ?? null,
      },
    }).run();
    channelCache.set(channel.id, true);
  } catch (err) {
    logger.error({ channelId: channel.id, err }, 'Failed to enrich channel');
  }
}

export function enrichGuild(guild: DiscordGuild): void {
  if (guildCache.get(guild.id) === 'full') return;

  const iconUrl = typeof guild.iconURL === 'function' ? guild.iconURL({ size: 128 }) : null;

  try {
    db.insert(guilds).values({
      id: guild.id,
      name: guild.name,
      iconUrl,
      ownerId: guild.ownerId,
      memberCount: guild.memberCount ?? null,
      joinedAt: guild.joinedAt,
      configuredAt: new Date(),
    }).onConflictDoUpdate({
      target: guilds.id,
      set: {
        name: guild.name,
        iconUrl,
        ownerId: guild.ownerId,
        memberCount: guild.memberCount ?? null,
        joinedAt: guild.joinedAt,
      },
    }).run();
    guildCache.set(guild.id, 'full');
  } catch (err) {
    logger.error({ guildId: guild.id, err }, 'Failed to enrich guild');
  }
}

export function ensureGuild(guildId: string): void {
  if (guildCache.get(guildId)) return;

  try {
    db.insert(guilds).values({
      id: guildId,
      name: 'Unknown Guild',
      iconUrl: null,
      ownerId: null,
      memberCount: null,
      joinedAt: null,
      configuredAt: new Date(),
    }).onConflictDoNothing().run();
    guildCache.set(guildId, 'placeholder');
  } catch (err) {
    logger.error({ guildId, err }, 'Failed to ensure guild placeholder');
  }
}

export function enrichMessage(message: DiscordMessage): {
  authorUsername: string;
  channelName: string | null;
  guildName: string | null;
} {
  enrichUser(message.author);
  if (message.guild) {
    enrichGuild(message.guild);
  }
  enrichChannel(message.channel);

  return {
    authorUsername: message.author.username,
    channelName: message.channel.name ?? null,
    guildName: message.guild?.name ?? null,
  };
}
