import type { Socket } from 'socket.io';
import { logger } from '@/utils/logger.js';
import {
  joinRoom,
  leaveRoom,
  clearSocketRooms,
  channelRoom,
  guildRoom,
  globalRoom,
  setSearchSubscription,
  removeSearchSubscription,
} from '@/dashboard/socket/rooms.js';
import {
  getDailyMessageCounts,
  getTopChannels,
  getTopUsers,
  getGuildStats,
} from '@/database/queries.js';

export function registerSocketHandlers(socket: Socket): void {
  joinRoom(socket, globalRoom());

  socket.on('subscribe:channel', ({ channelId }: { channelId: string }) => {
    if (typeof channelId !== 'string') return;
    joinRoom(socket, channelRoom(channelId));
    logger.debug({ socketId: socket.id, channelId }, 'Subscribed to channel');
  });

  socket.on('unsubscribe:channel', ({ channelId }: { channelId: string }) => {
    if (typeof channelId !== 'string') return;
    leaveRoom(socket, channelRoom(channelId));
    logger.debug({ socketId: socket.id, channelId }, 'Unsubscribed from channel');
  });

  socket.on('subscribe:guild', ({ guildId }: { guildId: string }) => {
    if (typeof guildId !== 'string') return;
    joinRoom(socket, guildRoom(guildId));
    logger.debug({ socketId: socket.id, guildId }, 'Subscribed to guild');
  });

  socket.on('unsubscribe:guild', ({ guildId }: { guildId: string }) => {
    if (typeof guildId !== 'string') return;
    leaveRoom(socket, guildRoom(guildId));
    logger.debug({ socketId: socket.id, guildId }, 'Unsubscribed from guild');
  });

  socket.on('subscribe:search', ({ q, filters }: { q?: string; filters?: unknown }) => {
    setSearchSubscription(socket, { q, filters });
    logger.debug({ socketId: socket.id, q }, 'Subscribed to search');
  });

  socket.on('unsubscribe:search', () => {
    removeSearchSubscription(socket);
    logger.debug({ socketId: socket.id }, 'Unsubscribed from search');
  });

  socket.on(
    'request:stats',
    async ({ guildId, range }: { guildId?: string; range?: number }) => {
      try {
        const days = typeof range === 'number' ? range : 7;
        let payload: unknown;

        if (guildId) {
          const stats = await getGuildStats(guildId);
          payload = { guildId, days, stats };
        } else {
          const [dailyCounts, topChannels, topUsers] = await Promise.all([
            getDailyMessageCounts(days),
            getTopChannels(days),
            getTopUsers(days),
          ]);
          payload = { days, dailyCounts, topChannels, topUsers };
        }

        socket.emit('stats:tick', payload);
      } catch (err) {
        logger.error(err, 'request:stats failed');
        socket.emit('stats:error', { error: 'Failed to compute stats' });
      }
    }
  );

  socket.on('disconnect', () => {
    removeSearchSubscription(socket);
    clearSocketRooms(socket);
    logger.debug({ socketId: socket.id }, 'Cleaned up socket subscriptions');
  });
}
