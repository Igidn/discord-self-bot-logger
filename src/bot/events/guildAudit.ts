import { Client, Channel, Role, Guild, ThreadChannel } from 'discord.js-selfbot-v13';
import { DrizzleDb, db } from '@/database/index.js';
import { guildAudit, channels, guilds } from '@/database/schema.js';
import { eq } from 'drizzle-orm';
import { logger } from '@/utils/logger.js';
import { requireGuild } from '../guildFilter.js';
import { broadcaster } from '@/dashboard/socket/broadcaster.js';

async function onChannelCreate(client: Client, _db: DrizzleDb, channel: Channel) {
  try {
    const guildId = (channel as any).guild?.id ?? null;
    if (!guildId) return;

    const createdAt = new Date();
    const ch = channel as any;

    db.insert(guildAudit).values({
      guildId,
      actionType: 'CHANNEL_CREATE',
      targetId: ch.id,
      targetType: 'CHANNEL',
      userId: null,
      changesJson: JSON.stringify({ name: ch.name, type: ch.type }),
      createdAt,
    }).run();

    // Upsert into channels table
    db.insert(channels).values({
      id: ch.id,
      guildId,
      name: ch.name ?? null,
      type: ch.type ?? null,
      topic: ch.topic ?? null,
      nsfw: ch.nsfw ?? false,
      parentId: ch.parentId ?? null,
    }).onConflictDoUpdate({
      target: channels.id,
      set: {
        name: ch.name ?? null,
        type: ch.type ?? null,
        topic: ch.topic ?? null,
        nsfw: ch.nsfw ?? false,
        parentId: ch.parentId ?? null,
      },
    }).run();

    broadcaster.toGuild(guildId, 'guild:audit', { guildId, actionType: 'CHANNEL_CREATE', targetId: ch.id, createdAt });
  } catch (err) {
    logger.error({ err }, 'Error in channelCreate handler');
  }
}

async function onChannelUpdate(client: Client, _db: DrizzleDb, oldChannel: Channel, newChannel: Channel) {
  try {
    const guildId = (newChannel as any).guild?.id ?? null;
    if (!guildId) return;

    const createdAt = new Date();
    const oc = oldChannel as any;
    const nc = newChannel as any;

    const changes: Record<string, { old: any; new: any }> = {};
    if (oc.name !== nc.name) changes.name = { old: oc.name, new: nc.name };
    if (oc.topic !== nc.topic) changes.topic = { old: oc.topic, new: nc.topic };
    if (oc.nsfw !== nc.nsfw) changes.nsfw = { old: oc.nsfw, new: nc.nsfw };
    if (oc.parentId !== nc.parentId) changes.parentId = { old: oc.parentId, new: nc.parentId };

    db.insert(guildAudit).values({
      guildId,
      actionType: 'CHANNEL_UPDATE',
      targetId: nc.id,
      targetType: 'CHANNEL',
      userId: null,
      changesJson: JSON.stringify(changes),
      createdAt,
    }).run();

    // Upsert into channels table
    db.insert(channels).values({
      id: nc.id,
      guildId,
      name: nc.name ?? null,
      type: nc.type ?? null,
      topic: nc.topic ?? null,
      nsfw: nc.nsfw ?? false,
      parentId: nc.parentId ?? null,
    }).onConflictDoUpdate({
      target: channels.id,
      set: {
        name: nc.name ?? null,
        type: nc.type ?? null,
        topic: nc.topic ?? null,
        nsfw: nc.nsfw ?? false,
        parentId: nc.parentId ?? null,
      },
    }).run();

    broadcaster.toGuild(guildId, 'guild:audit', { guildId, actionType: 'CHANNEL_UPDATE', targetId: nc.id, changes, createdAt });
  } catch (err) {
    logger.error({ err }, 'Error in channelUpdate handler');
  }
}

async function onChannelDelete(client: Client, _db: DrizzleDb, channel: Channel) {
  try {
    const guildId = (channel as any).guild?.id ?? null;
    if (!guildId) return;

    const createdAt = new Date();
    const ch = channel as any;

    db.insert(guildAudit).values({
      guildId,
      actionType: 'CHANNEL_DELETE',
      targetId: ch.id,
      targetType: 'CHANNEL',
      userId: null,
      changesJson: JSON.stringify({ name: ch.name }),
      createdAt,
    }).run();

    broadcaster.toGuild(guildId, 'guild:audit', { guildId, actionType: 'CHANNEL_DELETE', targetId: ch.id, createdAt });
  } catch (err) {
    logger.error({ err }, 'Error in channelDelete handler');
  }
}

async function onRoleCreate(client: Client, _db: DrizzleDb, role: Role) {
  try {
    const guildId = role.guild.id;
    const createdAt = new Date();

    db.insert(guildAudit).values({
      guildId,
      actionType: 'ROLE_CREATE',
      targetId: role.id,
      targetType: 'ROLE',
      userId: null,
      changesJson: JSON.stringify({ name: role.name, color: role.color }),
      createdAt,
    }).run();

    broadcaster.toGuild(guildId, 'guild:audit', { guildId, actionType: 'ROLE_CREATE', targetId: role.id, createdAt });
  } catch (err) {
    logger.error({ err }, 'Error in roleCreate handler');
  }
}

async function onRoleUpdate(client: Client, _db: DrizzleDb, oldRole: Role, newRole: Role) {
  try {
    const guildId = newRole.guild.id;
    const createdAt = new Date();

    const changes: Record<string, { old: any; new: any }> = {};
    if (oldRole.name !== newRole.name) changes.name = { old: oldRole.name, new: newRole.name };
    if (oldRole.color !== newRole.color) changes.color = { old: oldRole.color, new: newRole.color };
    if (oldRole.permissions.bitfield !== newRole.permissions.bitfield) {
      changes.permissions = { old: oldRole.permissions.bitfield.toString(), new: newRole.permissions.bitfield.toString() };
    }

    db.insert(guildAudit).values({
      guildId,
      actionType: 'ROLE_UPDATE',
      targetId: newRole.id,
      targetType: 'ROLE',
      userId: null,
      changesJson: JSON.stringify(changes),
      createdAt,
    }).run();

    broadcaster.toGuild(guildId, 'guild:audit', { guildId, actionType: 'ROLE_UPDATE', targetId: newRole.id, changes, createdAt });
  } catch (err) {
    logger.error({ err }, 'Error in roleUpdate handler');
  }
}

async function onRoleDelete(client: Client, _db: DrizzleDb, role: Role) {
  try {
    const guildId = role.guild.id;
    const createdAt = new Date();

    db.insert(guildAudit).values({
      guildId,
      actionType: 'ROLE_DELETE',
      targetId: role.id,
      targetType: 'ROLE',
      userId: null,
      changesJson: JSON.stringify({ name: role.name }),
      createdAt,
    }).run();

    broadcaster.toGuild(guildId, 'guild:audit', { guildId, actionType: 'ROLE_DELETE', targetId: role.id, createdAt });
  } catch (err) {
    logger.error({ err }, 'Error in roleDelete handler');
  }
}

async function onGuildUpdate(client: Client, _db: DrizzleDb, oldGuild: Guild, newGuild: Guild) {
  try {
    const guildId = newGuild.id;
    const createdAt = new Date();

    const changes: Record<string, { old: any; new: any }> = {};
    if (oldGuild.name !== newGuild.name) changes.name = { old: oldGuild.name, new: newGuild.name };
    if (oldGuild.icon !== newGuild.icon) changes.icon = { old: oldGuild.icon, new: newGuild.icon };
    if (oldGuild.ownerId !== newGuild.ownerId) changes.ownerId = { old: oldGuild.ownerId, new: newGuild.ownerId };
    if (oldGuild.memberCount !== newGuild.memberCount) changes.memberCount = { old: oldGuild.memberCount, new: newGuild.memberCount };

    db.insert(guildAudit).values({
      guildId,
      actionType: 'GUILD_UPDATE',
      targetId: guildId,
      targetType: 'GUILD',
      userId: null,
      changesJson: JSON.stringify(changes),
      createdAt,
    }).run();

    // Update guilds table with latest metadata
    db.update(guilds).set({
      name: newGuild.name,
      iconUrl: newGuild.iconURL() ?? null,
      ownerId: newGuild.ownerId,
      memberCount: newGuild.memberCount,
    }).where(eq(guilds.id, guildId)).run();

    broadcaster.toGuild(guildId, 'guild:audit', { guildId, actionType: 'GUILD_UPDATE', changes, createdAt });
  } catch (err) {
    logger.error({ err }, 'Error in guildUpdate handler');
  }
}

async function onThreadCreate(client: Client, _db: DrizzleDb, thread: ThreadChannel) {
  try {
    const guildId = thread.guild.id;
    const createdAt = new Date();

    db.insert(guildAudit).values({
      guildId,
      actionType: 'THREAD_CREATE',
      targetId: thread.id,
      targetType: 'THREAD',
      userId: thread.ownerId ?? null,
      changesJson: JSON.stringify({ name: thread.name, parentId: thread.parentId }),
      createdAt,
    }).run();

    broadcaster.toGuild(guildId, 'guild:audit', { guildId, actionType: 'THREAD_CREATE', targetId: thread.id, createdAt });
  } catch (err) {
    logger.error({ err }, 'Error in threadCreate handler');
  }
}

async function onThreadUpdate(client: Client, _db: DrizzleDb, oldThread: ThreadChannel, newThread: ThreadChannel) {
  try {
    const guildId = newThread.guild.id;
    const createdAt = new Date();

    const changes: Record<string, { old: any; new: any }> = {};
    if (oldThread.name !== newThread.name) changes.name = { old: oldThread.name, new: newThread.name };
    if (oldThread.archived !== newThread.archived) changes.archived = { old: oldThread.archived, new: newThread.archived };

    db.insert(guildAudit).values({
      guildId,
      actionType: 'THREAD_UPDATE',
      targetId: newThread.id,
      targetType: 'THREAD',
      userId: newThread.ownerId ?? null,
      changesJson: JSON.stringify(changes),
      createdAt,
    }).run();

    broadcaster.toGuild(guildId, 'guild:audit', { guildId, actionType: 'THREAD_UPDATE', targetId: newThread.id, changes, createdAt });
  } catch (err) {
    logger.error({ err }, 'Error in threadUpdate handler');
  }
}

async function onThreadDelete(client: Client, _db: DrizzleDb, thread: ThreadChannel) {
  try {
    const guildId = thread.guild.id;
    const createdAt = new Date();

    db.insert(guildAudit).values({
      guildId,
      actionType: 'THREAD_DELETE',
      targetId: thread.id,
      targetType: 'THREAD',
      userId: thread.ownerId ?? null,
      changesJson: JSON.stringify({ name: thread.name }),
      createdAt,
    }).run();

    broadcaster.toGuild(guildId, 'guild:audit', { guildId, actionType: 'THREAD_DELETE', targetId: thread.id, createdAt });
  } catch (err) {
    logger.error({ err }, 'Error in threadDelete handler');
  }
}

export const handleChannelCreate = requireGuild(onChannelCreate);
export const handleChannelUpdate = requireGuild(onChannelUpdate);
export const handleChannelDelete = requireGuild(onChannelDelete);
export const handleRoleCreate = requireGuild(onRoleCreate);
export const handleRoleUpdate = requireGuild(onRoleUpdate);
export const handleRoleDelete = requireGuild(onRoleDelete);
export const handleGuildUpdate = requireGuild(onGuildUpdate);
export const handleThreadCreate = requireGuild(onThreadCreate);
export const handleThreadUpdate = requireGuild(onThreadUpdate);
export const handleThreadDelete = requireGuild(onThreadDelete);

