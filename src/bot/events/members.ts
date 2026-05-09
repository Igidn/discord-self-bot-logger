import { Client, GuildMember, PartialGuildMember, GuildBan } from 'discord.js-selfbot-v13';
import { sqlite } from '../../database/index.js';
import { logger } from '../../utils/logger.js';
import { requireGuild } from '../guildFilter.js';
import { broadcaster } from '../../dashboard/socket/broadcaster.js';

async function onGuildMemberAdd(client: Client, _db: any, member: GuildMember) {
  try {
    const guildId = member.guild.id;
    const userId = member.id;
    const createdAt = Math.floor(Date.now() / 1000);

    sqlite.prepare(`
      INSERT INTO member_events (guild_id, user_id, event_type, roles_json, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(guildId, userId, 'JOIN', JSON.stringify(member.roles.cache.map((r) => r.id)), createdAt);

    broadcaster.toGuild(guildId, 'member:event', { guildId, userId, eventType: 'JOIN', createdAt });
  } catch (err) {
    logger.error({ err }, 'Error in guildMemberAdd handler');
  }
}

async function onGuildMemberRemove(client: Client, _db: any, member: GuildMember | PartialGuildMember) {
  try {
    const guildId = member.guild.id;
    const userId = member.id;
    const createdAt = Math.floor(Date.now() / 1000);

    sqlite.prepare(`
      INSERT INTO member_events (guild_id, user_id, event_type, roles_json, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(guildId, userId, 'LEAVE', null, createdAt);

    broadcaster.toGuild(guildId, 'member:event', { guildId, userId, eventType: 'LEAVE', createdAt });
  } catch (err) {
    logger.error({ err }, 'Error in guildMemberRemove handler');
  }
}

async function onGuildBanAdd(client: Client, _db: any, ban: GuildBan) {
  try {
    const guildId = ban.guild.id;
    const userId = ban.user.id;
    const createdAt = Math.floor(Date.now() / 1000);

    sqlite.prepare(`
      INSERT INTO member_events (guild_id, user_id, event_type, roles_json, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(guildId, userId, 'BAN', null, createdAt);

    broadcaster.toGuild(guildId, 'member:event', { guildId, userId, eventType: 'BAN', createdAt });
  } catch (err) {
    logger.error({ err }, 'Error in guildBanAdd handler');
  }
}

async function onGuildBanRemove(client: Client, _db: any, ban: GuildBan) {
  try {
    const guildId = ban.guild.id;
    const userId = ban.user.id;
    const createdAt = Math.floor(Date.now() / 1000);

    sqlite.prepare(`
      INSERT INTO member_events (guild_id, user_id, event_type, roles_json, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(guildId, userId, 'UNBAN', null, createdAt);

    broadcaster.toGuild(guildId, 'member:event', { guildId, userId, eventType: 'UNBAN', createdAt });
  } catch (err) {
    logger.error({ err }, 'Error in guildBanRemove handler');
  }
}

async function onGuildMemberUpdate(
  client: Client,
  _db: any,
  oldMember: GuildMember | PartialGuildMember,
  newMember: GuildMember
) {
  try {
    const guildId = newMember.guild.id;
    const userId = newMember.id;
    const createdAt = Math.floor(Date.now() / 1000);

    // Nick diff
    const oldNick = oldMember.nickname ?? null;
    const newNick = newMember.nickname ?? null;
    if (oldNick !== newNick) {
      sqlite.prepare(`
        INSERT INTO member_events (guild_id, user_id, event_type, old_value, new_value, roles_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(guildId, userId, 'NICK_CHANGE', oldNick, newNick, null, createdAt);

      broadcaster.toGuild(guildId, 'member:event', {
        guildId,
        userId,
        eventType: 'NICK_CHANGE',
        oldValue: oldNick,
        newValue: newNick,
        createdAt,
      });
    }

    // Roles diff
    const oldRoles = new Set(oldMember.roles?.cache?.map((r) => r.id) ?? []);
    const newRoles = new Set(newMember.roles.cache.map((r) => r.id));
    const added = [...newRoles].filter((r) => !oldRoles.has(r));
    const removed = [...oldRoles].filter((r) => !newRoles.has(r));

    if (added.length > 0 || removed.length > 0) {
      sqlite.prepare(`
        INSERT INTO member_events (guild_id, user_id, event_type, old_value, new_value, roles_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        guildId,
        userId,
        'UPDATE',
        JSON.stringify(removed),
        JSON.stringify(added),
        JSON.stringify(newMember.roles.cache.map((r) => r.id)),
        createdAt
      );

      broadcaster.toGuild(guildId, 'member:event', {
        guildId,
        userId,
        eventType: 'UPDATE',
        addedRoles: added,
        removedRoles: removed,
        createdAt,
      });
    }
  } catch (err) {
    logger.error({ err }, 'Error in guildMemberUpdate handler');
  }
}

export const handleGuildMemberAdd = requireGuild(onGuildMemberAdd);
export const handleGuildMemberRemove = requireGuild(onGuildMemberRemove);
export const handleGuildBanAdd = requireGuild(onGuildBanAdd);
export const handleGuildBanRemove = requireGuild(onGuildBanRemove);
export const handleGuildMemberUpdate = requireGuild(onGuildMemberUpdate);
