import { Client } from 'discord.js-selfbot-v13';
import { config } from '@/config/loader.js';
import { handleMessageCreate } from './messageCreate.js';
import { handleMessageUpdate } from './messageUpdate.js';
import { handleMessageDelete, handleMessageDeleteBulk } from './messageDelete.js';
import {
  handleReactionAdd,
  handleReactionRemove,
  handleReactionRemoveAll,
  handleReactionRemoveEmoji,
} from './reactions.js';
import {
  handleGuildMemberAdd,
  handleGuildMemberRemove,
  handleGuildBanAdd,
  handleGuildBanRemove,
  handleGuildMemberUpdate,
} from './members.js';
import { handlePresenceUpdate } from './presence.js';
import { handleVoiceStateUpdate } from './voice.js';
import {
  handleChannelCreate,
  handleChannelUpdate,
  handleChannelDelete,
  handleRoleCreate,
  handleRoleUpdate,
  handleRoleDelete,
  handleGuildUpdate,
  handleThreadCreate,
  handleThreadUpdate,
  handleThreadDelete,
} from './guildAudit.js';

export function registerEvents(client: Client, db: any) {
  if (config.logging.events.messages) {
    client.on('messageCreate', (...args) => handleMessageCreate(client, db, ...args));
  }

  if (config.logging.events.messageEdits) {
    client.on('messageUpdate', (...args) => handleMessageUpdate(client, db, ...args));
  }

  if (config.logging.events.messageDeletes) {
    client.on('messageDelete', (...args) => handleMessageDelete(client, db, ...args));
    client.on('messageDeleteBulk', (...args) => handleMessageDeleteBulk(client, db, ...args));
  }

  if (config.logging.events.reactions) {
    client.on('messageReactionAdd', (...args) => handleReactionAdd(client, db, ...args));
    client.on('messageReactionRemove', (...args) => handleReactionRemove(client, db, ...args));
    client.on('messageReactionRemoveAll', (...args) => handleReactionRemoveAll(client, db, ...args));
    client.on('messageReactionRemoveEmoji', (...args) => handleReactionRemoveEmoji(client, db, ...args));
  }

  if (config.logging.events.members) {
    client.on('guildMemberAdd', (...args) => handleGuildMemberAdd(client, db, ...args));
    client.on('guildMemberRemove', (...args) => handleGuildMemberRemove(client, db, ...args));
    client.on('guildBanAdd', (...args) => handleGuildBanAdd(client, db, ...args));
    client.on('guildBanRemove', (...args) => handleGuildBanRemove(client, db, ...args));
    client.on('guildMemberUpdate', (...args) => handleGuildMemberUpdate(client, db, ...args));
  }

  if (config.logging.events.presence) {
    client.on('presenceUpdate', (...args) => handlePresenceUpdate(client, db, ...args));
  }

  if (config.logging.events.voice) {
    client.on('voiceStateUpdate', (...args) => handleVoiceStateUpdate(client, db, ...args));
  }

  if (config.logging.events.guildChanges) {
    client.on('guildUpdate', (...args) => handleGuildUpdate(client, db, ...args));
  }

  if (config.logging.events.channelChanges) {
    client.on('channelCreate', (...args) => handleChannelCreate(client, db, ...args));
    client.on('channelUpdate', (...args) => handleChannelUpdate(client, db, ...args));
    client.on('channelDelete', (...args) => handleChannelDelete(client, db, ...args));
  }

  if (config.logging.events.roleChanges) {
    client.on('roleCreate', (...args) => handleRoleCreate(client, db, ...args));
    client.on('roleUpdate', (...args) => handleRoleUpdate(client, db, ...args));
    client.on('roleDelete', (...args) => handleRoleDelete(client, db, ...args));
  }

  if (config.logging.events.threads) {
    client.on('threadCreate', (...args) => handleThreadCreate(client, db, ...args));
    client.on('threadUpdate', (...args) => handleThreadUpdate(client, db, ...args));
    client.on('threadDelete', (...args) => handleThreadDelete(client, db, ...args));
  }


}
