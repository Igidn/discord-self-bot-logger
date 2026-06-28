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
  editedAt?: number | null;
  deletedAt?: number | null;
  isDm?: boolean;
  replyToId?: string | null;
  embedsJson?: string | null;
  attachments?: number | unknown[];
  reactions?: number | unknown[];
  stickers?: string[];
  author?: {
    id: string;
    username: string;
    avatarUrl?: string | null;
  } | null;
  channel?: {
    id: string;
    name: string | null;
    type: number | null;
  } | null;
  guild?: {
    id: string;
    name: string | null;
    iconUrl?: string | null;
  } | null;
}

function tokenizeSearchQuery(q: string): string[] {
  const tokens: string[] = [];
  const regex = /"([^"]*)"|(\S+)/g;
  let match;
  while ((match = regex.exec(q)) !== null) {
    const token = (match[1] ?? match[2]).replace(/\*$/g, '');
    if (token.length > 0) tokens.push(token.toLowerCase());
  }
  return tokens;
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
        const tokens = tokenizeSearchQuery(sub.q);
        const lowerContent = message.content.toLowerCase();
        if (!tokens.every((t) => lowerContent.includes(t))) {
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
