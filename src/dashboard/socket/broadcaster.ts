import { getIO } from '@/dashboard/socket/index.js';
import { channelRoom, guildRoom, globalRoom, getSearchSubscription } from '@/dashboard/socket/rooms.js';
import { evaluateFilter } from '@/shared/filters.js';
import { logger } from '@/utils/logger.js';

interface MessagePayload {
  id: string;
  guildId?: string | null;
  channelId: string;
  authorId: string;
  content?: string | null;
  createdAt: number;
}

interface ReactionPayload {
  messageId: string;
  guildId?: string | null;
  channelId: string;
  userId: string;
  emojiId?: string | null;
  emojiName?: string | null;
}

interface MemberEventPayload {
  guildId: string;
  userId: string;
  eventType: string;
  oldValue?: string | null;
  newValue?: string | null;
  createdAt: number;
}

interface PresenceUpdatePayload {
  guildId?: string | null;
  userId: string;
  status?: string | null;
  clientStatus?: string | null;
  activitiesJson?: string | null;
  updatedAt: number;
}

interface VoiceEventPayload {
  guildId: string;
  userId: string;
  channelId?: string | null;
  eventType: string;
  oldValue?: string | null;
  newValue?: string | null;
  createdAt: number;
}

interface GuildAuditPayload {
  guildId: string;
  actionType: string;
  targetId?: string | null;
  targetType?: string | null;
  userId?: string | null;
  changesJson?: string | null;
  reason?: string | null;
  createdAt: number;
}

const presenceThrottle = new Map<string, number>();
const PRESENCE_THROTTLE_MS = 5000;

function shouldThrottlePresence(room: string): boolean {
  const now = Date.now();
  const last = presenceThrottle.get(room);
  if (last && now - last < PRESENCE_THROTTLE_MS) {
    return true;
  }
  presenceThrottle.set(room, now);
  return false;
}

export function emitMessageNew(message: MessagePayload): void {
  try {
    const io = getIO();
    const chRoom = channelRoom(message.channelId);
    const gRoom = message.guildId ? guildRoom(message.guildId) : null;

    io.to(chRoom).emit('message:new', message);
    if (gRoom) io.to(gRoom).emit('message:new', message);
    io.to(globalRoom()).emit('message:new', message);

    // Test search subscriptions
    for (const [, socket] of io.sockets.sockets) {
      const sub = getSearchSubscription(socket);
      if (!sub) continue;

      let matches = true;
      if (sub.filters && !evaluateFilter((message as unknown) as Record<string, unknown>, sub.filters as import('@/shared/filters.js').Filter)) {
        matches = false;
      }
      if (sub.q && typeof message.content === 'string') {
        if (!message.content.toLowerCase().includes(sub.q.toLowerCase())) {
          matches = false;
        }
      }

      if (matches) {
        socket.emit('search:match', message);
      }
    }
  } catch (err) {
    logger.error(err, 'emitMessageNew failed');
  }
}

export function emitMessageEdit(
  messageId: string,
  newContent: string,
  editedAt: number
): void {
  try {
    const io = getIO();
    io.emit('message:edit', { messageId, newContent, editedAt });
  } catch (err) {
    logger.error(err, 'emitMessageEdit failed');
  }
}

export function emitMessageDelete(
  messageId: string,
  channelId: string,
  guildId: string | null | undefined,
  deletedAt: number
): void {
  try {
    const io = getIO();
    const chRoom = channelRoom(channelId);
    const gRoom = guildId ? guildRoom(guildId) : null;

    io.to(chRoom).emit('message:delete', { messageId, channelId, guildId, deletedAt });
    if (gRoom) io.to(gRoom).emit('message:delete', { messageId, channelId, guildId, deletedAt });
    io.to(globalRoom()).emit('message:delete', { messageId, channelId, guildId, deletedAt });
  } catch (err) {
    logger.error(err, 'emitMessageDelete failed');
  }
}

export function emitReactionAdd(reaction: ReactionPayload): void {
  try {
    const io = getIO();
    const chRoom = channelRoom(reaction.channelId);
    const gRoom = reaction.guildId ? guildRoom(reaction.guildId) : null;

    io.to(chRoom).emit('reaction:add', reaction);
    if (gRoom) io.to(gRoom).emit('reaction:add', reaction);
  } catch (err) {
    logger.error(err, 'emitReactionAdd failed');
  }
}

export function emitReactionRemove(reaction: ReactionPayload): void {
  try {
    const io = getIO();
    const chRoom = channelRoom(reaction.channelId);
    const gRoom = reaction.guildId ? guildRoom(reaction.guildId) : null;

    io.to(chRoom).emit('reaction:remove', reaction);
    if (gRoom) io.to(gRoom).emit('reaction:remove', reaction);
  } catch (err) {
    logger.error(err, 'emitReactionRemove failed');
  }
}

export function emitMemberEvent(event: MemberEventPayload): void {
  try {
    const io = getIO();
    const gRoom = guildRoom(event.guildId);
    io.to(gRoom).emit('member:event', event);
    io.to(globalRoom()).emit('member:event', event);
  } catch (err) {
    logger.error(err, 'emitMemberEvent failed');
  }
}

export function emitPresenceUpdate(update: PresenceUpdatePayload): void {
  try {
    const io = getIO();
    const room = update.guildId ? guildRoom(update.guildId) : globalRoom();
    if (shouldThrottlePresence(room)) return;
    io.to(room).emit('presence:update', update);
  } catch (err) {
    logger.error(err, 'emitPresenceUpdate failed');
  }
}

export function emitVoiceEvent(event: VoiceEventPayload): void {
  try {
    const io = getIO();
    const gRoom = guildRoom(event.guildId);
    io.to(gRoom).emit('voice:event', event);
  } catch (err) {
    logger.error(err, 'emitVoiceEvent failed');
  }
}

export function emitGuildAudit(event: GuildAuditPayload): void {
  try {
    const io = getIO();
    const gRoom = guildRoom(event.guildId);
    io.to(gRoom).emit('guild:audit', event);
    io.to(globalRoom()).emit('guild:audit', event);
  } catch (err) {
    logger.error(err, 'emitGuildAudit failed');
  }
}

/* ------------------------------------------------------------------ */
/*  Simple broadcaster object used by bot event handlers               */
/* ------------------------------------------------------------------ */

export const broadcaster = {
  toChannel(channelId: string, event: string, payload: unknown): void {
    try {
      const io = getIO();
      io.to(channelRoom(channelId)).emit(event, payload);
    } catch (err) {
      logger.error(err, `broadcaster.toChannel failed for ${event}`);
    }
  },

  toGuild(guildId: string, event: string, payload: unknown): void {
    try {
      const io = getIO();
      io.to(guildRoom(guildId)).emit(event, payload);
      io.to(globalRoom()).emit(event, payload);
    } catch (err) {
      logger.error(err, `broadcaster.toGuild failed for ${event}`);
    }
  },

  toGlobal(event: string, payload: unknown): void {
    try {
      const io = getIO();
      io.to(globalRoom()).emit(event, payload);
    } catch (err) {
      logger.error(err, `broadcaster.toGlobal failed for ${event}`);
    }
  },
};
