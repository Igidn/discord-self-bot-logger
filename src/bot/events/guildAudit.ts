import { Client, Channel, Role, Guild, ThreadChannel, Invite } from 'discord.js-selfbot-v13';
import { sqlite } from '../../database/index.js';
import { logger } from '../../utils/logger.js';
import { requireGuild } from '../guildFilter.js';
import { broadcaster } from '../../dashboard/socket/broadcaster.js';

async function onChannelCreate(client: Client, _db: any, channel: Channel) {
  try {
    const guildId = (channel as any).guild?.id ?? null;
    if (!guildId) return;

    const createdAt = Math.floor(Date.now() / 1000);
    const ch = channel as any;

    sqlite.prepare(`
      INSERT INTO guild_audit (guild_id, action_type, target_id, target_type, user_id, changes_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(guildId, 'CHANNEL_CREATE', ch.id, 'CHANNEL', null, JSON.stringify({ name: ch.name, type: ch.type }), createdAt);

    // Upsert into channels table
    sqlite.prepare(`
      INSERT INTO channels (id, guild_id, name, type, topic, nsfw, parent_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        type = excluded.type,
        topic = excluded.topic,
        nsfw = excluded.nsfw,
        parent_id = excluded.parent_id
    `).run(ch.id, guildId, ch.name ?? null, ch.type ?? null, ch.topic ?? null, ch.nsfw ? 1 : 0, ch.parentId ?? null);

    broadcaster.toGuild(guildId, 'guild:audit', { guildId, actionType: 'CHANNEL_CREATE', targetId: ch.id, createdAt });
  } catch (err) {
    logger.error({ err }, 'Error in channelCreate handler');
  }
}

async function onChannelUpdate(client: Client, _db: any, oldChannel: Channel, newChannel: Channel) {
  try {
    const guildId = (newChannel as any).guild?.id ?? null;
    if (!guildId) return;

    const createdAt = Math.floor(Date.now() / 1000);
    const oc = oldChannel as any;
    const nc = newChannel as any;

    const changes: Record<string, { old: any; new: any }> = {};
    if (oc.name !== nc.name) changes.name = { old: oc.name, new: nc.name };
    if (oc.topic !== nc.topic) changes.topic = { old: oc.topic, new: nc.topic };
    if (oc.nsfw !== nc.nsfw) changes.nsfw = { old: oc.nsfw, new: nc.nsfw };
    if (oc.parentId !== nc.parentId) changes.parentId = { old: oc.parentId, new: nc.parentId };

    sqlite.prepare(`
      INSERT INTO guild_audit (guild_id, action_type, target_id, target_type, user_id, changes_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(guildId, 'CHANNEL_UPDATE', nc.id, 'CHANNEL', null, JSON.stringify(changes), createdAt);

    // Upsert into channels table
    sqlite.prepare(`
      INSERT INTO channels (id, guild_id, name, type, topic, nsfw, parent_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        type = excluded.type,
        topic = excluded.topic,
        nsfw = excluded.nsfw,
        parent_id = excluded.parent_id
    `).run(nc.id, guildId, nc.name ?? null, nc.type ?? null, nc.topic ?? null, nc.nsfw ? 1 : 0, nc.parentId ?? null);

    broadcaster.toGuild(guildId, 'guild:audit', { guildId, actionType: 'CHANNEL_UPDATE', targetId: nc.id, changes, createdAt });
  } catch (err) {
    logger.error({ err }, 'Error in channelUpdate handler');
  }
}

async function onChannelDelete(client: Client, _db: any, channel: Channel) {
  try {
    const guildId = (channel as any).guild?.id ?? null;
    if (!guildId) return;

    const createdAt = Math.floor(Date.now() / 1000);
    const ch = channel as any;

    sqlite.prepare(`
      INSERT INTO guild_audit (guild_id, action_type, target_id, target_type, user_id, changes_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(guildId, 'CHANNEL_DELETE', ch.id, 'CHANNEL', null, JSON.stringify({ name: ch.name }), createdAt);

    broadcaster.toGuild(guildId, 'guild:audit', { guildId, actionType: 'CHANNEL_DELETE', targetId: ch.id, createdAt });
  } catch (err) {
    logger.error({ err }, 'Error in channelDelete handler');
  }
}

async function onRoleCreate(client: Client, _db: any, role: Role) {
  try {
    const guildId = role.guild.id;
    const createdAt = Math.floor(Date.now() / 1000);

    sqlite.prepare(`
      INSERT INTO guild_audit (guild_id, action_type, target_id, target_type, user_id, changes_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(guildId, 'ROLE_CREATE', role.id, 'ROLE', null, JSON.stringify({ name: role.name, color: role.color }), createdAt);

    broadcaster.toGuild(guildId, 'guild:audit', { guildId, actionType: 'ROLE_CREATE', targetId: role.id, createdAt });
  } catch (err) {
    logger.error({ err }, 'Error in roleCreate handler');
  }
}

async function onRoleUpdate(client: Client, _db: any, oldRole: Role, newRole: Role) {
  try {
    const guildId = newRole.guild.id;
    const createdAt = Math.floor(Date.now() / 1000);

    const changes: Record<string, { old: any; new: any }> = {};
    if (oldRole.name !== newRole.name) changes.name = { old: oldRole.name, new: newRole.name };
    if (oldRole.color !== newRole.color) changes.color = { old: oldRole.color, new: newRole.color };
    if (oldRole.permissions.bitfield !== newRole.permissions.bitfield) {
      changes.permissions = { old: oldRole.permissions.bitfield.toString(), new: newRole.permissions.bitfield.toString() };
    }

    sqlite.prepare(`
      INSERT INTO guild_audit (guild_id, action_type, target_id, target_type, user_id, changes_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(guildId, 'ROLE_UPDATE', newRole.id, 'ROLE', null, JSON.stringify(changes), createdAt);

    broadcaster.toGuild(guildId, 'guild:audit', { guildId, actionType: 'ROLE_UPDATE', targetId: newRole.id, changes, createdAt });
  } catch (err) {
    logger.error({ err }, 'Error in roleUpdate handler');
  }
}

async function onRoleDelete(client: Client, _db: any, role: Role) {
  try {
    const guildId = role.guild.id;
    const createdAt = Math.floor(Date.now() / 1000);

    sqlite.prepare(`
      INSERT INTO guild_audit (guild_id, action_type, target_id, target_type, user_id, changes_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(guildId, 'ROLE_DELETE', role.id, 'ROLE', null, JSON.stringify({ name: role.name }), createdAt);

    broadcaster.toGuild(guildId, 'guild:audit', { guildId, actionType: 'ROLE_DELETE', targetId: role.id, createdAt });
  } catch (err) {
    logger.error({ err }, 'Error in roleDelete handler');
  }
}

async function onGuildUpdate(client: Client, _db: any, oldGuild: Guild, newGuild: Guild) {
  try {
    const guildId = newGuild.id;
    const createdAt = Math.floor(Date.now() / 1000);

    const changes: Record<string, { old: any; new: any }> = {};
    if (oldGuild.name !== newGuild.name) changes.name = { old: oldGuild.name, new: newGuild.name };
    if (oldGuild.icon !== newGuild.icon) changes.icon = { old: oldGuild.icon, new: newGuild.icon };
    if (oldGuild.ownerId !== newGuild.ownerId) changes.ownerId = { old: oldGuild.ownerId, new: newGuild.ownerId };

    sqlite.prepare(`
      INSERT INTO guild_audit (guild_id, action_type, target_id, target_type, user_id, changes_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(guildId, 'GUILD_UPDATE', guildId, 'GUILD', null, JSON.stringify(changes), createdAt);

    broadcaster.toGuild(guildId, 'guild:audit', { guildId, actionType: 'GUILD_UPDATE', changes, createdAt });
  } catch (err) {
    logger.error({ err }, 'Error in guildUpdate handler');
  }
}

async function onThreadCreate(client: Client, _db: any, thread: ThreadChannel) {
  try {
    const guildId = thread.guild.id;
    const createdAt = Math.floor(Date.now() / 1000);

    sqlite.prepare(`
      INSERT INTO guild_audit (guild_id, action_type, target_id, target_type, user_id, changes_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(guildId, 'THREAD_CREATE', thread.id, 'THREAD', thread.ownerId ?? null, JSON.stringify({ name: thread.name, parentId: thread.parentId }), createdAt);

    broadcaster.toGuild(guildId, 'guild:audit', { guildId, actionType: 'THREAD_CREATE', targetId: thread.id, createdAt });
  } catch (err) {
    logger.error({ err }, 'Error in threadCreate handler');
  }
}

async function onThreadUpdate(client: Client, _db: any, oldThread: ThreadChannel, newThread: ThreadChannel) {
  try {
    const guildId = newThread.guild.id;
    const createdAt = Math.floor(Date.now() / 1000);

    const changes: Record<string, { old: any; new: any }> = {};
    if (oldThread.name !== newThread.name) changes.name = { old: oldThread.name, new: newThread.name };
    if (oldThread.archived !== newThread.archived) changes.archived = { old: oldThread.archived, new: newThread.archived };

    sqlite.prepare(`
      INSERT INTO guild_audit (guild_id, action_type, target_id, target_type, user_id, changes_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(guildId, 'THREAD_UPDATE', newThread.id, 'THREAD', newThread.ownerId ?? null, JSON.stringify(changes), createdAt);

    broadcaster.toGuild(guildId, 'guild:audit', { guildId, actionType: 'THREAD_UPDATE', targetId: newThread.id, changes, createdAt });
  } catch (err) {
    logger.error({ err }, 'Error in threadUpdate handler');
  }
}

async function onThreadDelete(client: Client, _db: any, thread: ThreadChannel) {
  try {
    const guildId = thread.guild.id;
    const createdAt = Math.floor(Date.now() / 1000);

    sqlite.prepare(`
      INSERT INTO guild_audit (guild_id, action_type, target_id, target_type, user_id, changes_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(guildId, 'THREAD_DELETE', thread.id, 'THREAD', thread.ownerId ?? null, JSON.stringify({ name: thread.name }), createdAt);

    broadcaster.toGuild(guildId, 'guild:audit', { guildId, actionType: 'THREAD_DELETE', targetId: thread.id, createdAt });
  } catch (err) {
    logger.error({ err }, 'Error in threadDelete handler');
  }
}

async function onInviteCreate(client: Client, _db: any, invite: Invite) {
  try {
    const guildId = invite.guild?.id ?? null;
    if (!guildId) return;

    const createdAt = Math.floor(Date.now() / 1000);

    sqlite.prepare(`
      INSERT INTO guild_audit (guild_id, action_type, target_id, target_type, user_id, changes_json, reason, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      guildId,
      'INVITE_CREATE',
      invite.code,
      'INVITE',
      invite.inviter?.id ?? null,
      JSON.stringify({ maxUses: invite.maxUses, maxAge: invite.maxAge, temporary: invite.temporary }),
      null,
      createdAt
    );

    broadcaster.toGuild(guildId, 'guild:audit', { guildId, actionType: 'INVITE_CREATE', targetId: invite.code, createdAt });
  } catch (err) {
    logger.error({ err }, 'Error in inviteCreate handler');
  }
}

async function onInviteDelete(client: Client, _db: any, invite: Invite) {
  try {
    const guildId = invite.guild?.id ?? null;
    if (!guildId) return;

    const createdAt = Math.floor(Date.now() / 1000);

    sqlite.prepare(`
      INSERT INTO guild_audit (guild_id, action_type, target_id, target_type, user_id, changes_json, reason, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(guildId, 'INVITE_DELETE', invite.code, 'INVITE', null, null, null, createdAt);

    broadcaster.toGuild(guildId, 'guild:audit', { guildId, actionType: 'INVITE_DELETE', targetId: invite.code, createdAt });
  } catch (err) {
    logger.error({ err }, 'Error in inviteDelete handler');
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
export const handleInviteCreate = requireGuild(onInviteCreate);
export const handleInviteDelete = requireGuild(onInviteDelete);
