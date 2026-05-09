import { Client, VoiceState } from 'discord.js-selfbot-v13';
import { sqlite } from '../../database/index.js';
import { logger } from '../../utils/logger.js';
import { requireGuild } from '../guildFilter.js';
import { broadcaster } from '../../dashboard/socket/broadcaster.js';

function determineVoiceEvent(
  oldState: VoiceState,
  newState: VoiceState
): { type: string; oldValue: string | null; newValue: string | null } {
  const oldChannel = oldState.channelId;
  const newChannel = newState.channelId;

  if (!oldChannel && newChannel) return { type: 'JOIN', oldValue: null, newValue: newChannel };
  if (oldChannel && !newChannel) return { type: 'LEAVE', oldValue: oldChannel, newValue: null };
  if (oldChannel && newChannel && oldChannel !== newChannel) return { type: 'MOVE', oldValue: oldChannel, newValue: newChannel };

  if (oldState.mute !== newState.mute || oldState.selfMute !== newState.selfMute) {
    return {
      type: 'MUTE',
      oldValue: String(oldState.mute || oldState.selfMute),
      newValue: String(newState.mute || newState.selfMute),
    };
  }
  if (oldState.deaf !== newState.deaf || oldState.selfDeaf !== newState.selfDeaf) {
    return {
      type: 'DEAF',
      oldValue: String(oldState.deaf || oldState.selfDeaf),
      newValue: String(newState.deaf || newState.selfDeaf),
    };
  }
  if (oldState.streaming !== newState.streaming) {
    return { type: 'STREAM', oldValue: String(oldState.streaming), newValue: String(newState.streaming) };
  }
  if (oldState.selfVideo !== newState.selfVideo) {
    return { type: 'VIDEO', oldValue: String(oldState.selfVideo), newValue: String(newState.selfVideo) };
  }

  return { type: 'UNKNOWN', oldValue: null, newValue: null };
}

async function onVoiceStateUpdate(client: Client, _db: any, oldState: VoiceState, newState: VoiceState) {
  try {
    const guildId = newState.guild.id;
    const userId = newState.id;
    const channelId = newState.channelId ?? oldState.channelId ?? null;
    const { type, oldValue, newValue } = determineVoiceEvent(oldState, newState);
    if (type === 'UNKNOWN') return;

    const createdAt = Math.floor(Date.now() / 1000);

    sqlite.prepare(`
      INSERT INTO voice_events (guild_id, user_id, channel_id, event_type, old_value, new_value, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(guildId, userId, channelId, type, oldValue, newValue, createdAt);

    broadcaster.toGuild(guildId, 'voice:event', {
      guildId,
      userId,
      channelId,
      eventType: type,
      oldValue,
      newValue,
      createdAt,
    });
  } catch (err) {
    logger.error({ err }, 'Error in voiceStateUpdate handler');
  }
}

export const handleVoiceStateUpdate = requireGuild(onVoiceStateUpdate);
