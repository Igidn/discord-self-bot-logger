import { useEffect, useRef, useState, useCallback } from 'react';
import { useSocketContext } from './context';
import type { TimestampValue } from '../utils/datetime';

export function useSocket() {
  return useSocketContext().socket;
}

export interface LiveMessage {
  id: string;
  guildId?: string | null;
  channelId: string;
  authorId: string;
  content?: string | null;
  createdAt: TimestampValue;
  editedAt?: TimestampValue;
  deletedAt?: TimestampValue;
  replyToId?: string | null;
  stickerIds?: string | null;
  stickerLinks?: string | null;
  embedsJson?: string | null;
  componentsJson?: string | null;
  flags?: number;
  author?: {
    id: string;
    username: string;
    discriminator?: string | null;
    avatarUrl?: string | null;
  } | null;
}

export function useChannelSocket(channelId: string | undefined) {
  const { socket } = useSocketContext();
  const [liveMessages, setLiveMessages] = useState<LiveMessage[]>([]);
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const bufferRef = useRef<LiveMessage[]>([]);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    if (bufferRef.current.length > 0) {
      setLiveMessages((prev) => [...bufferRef.current, ...prev].slice(0, 200));
      bufferRef.current = [];
    }
  }, []);

  useEffect(() => {
    if (!channelId) return;

    socket.emit('subscribe:channel', { channelId });

    const onMessage = (msg: LiveMessage) => {
      bufferRef.current.push(msg);
      if (!flushTimer.current) {
        flushTimer.current = setTimeout(() => {
          flush();
          flushTimer.current = null;
        }, 250);
      }
    };

    const onEdit = (payload: { messageId: string; newContent: string; editedAt: number }) => {
      setLiveMessages((prev) =>
        prev.map((m) =>
          m.id === payload.messageId
            ? { ...m, content: payload.newContent, editedAt: payload.editedAt }
            : m
        )
      );
    };

    const onDelete = (payload: { messageId: string; deletedAt: number }) => {
      setLiveMessages((prev) =>
        prev.map((m) => (m.id === payload.messageId ? { ...m, deletedAt: payload.deletedAt } : m))
      );
    };

    const onTyping = (payload: { channelId: string; userId: string }) => {
      if (payload.channelId !== channelId) return;
      setTypingUsers((prev) => {
        const next = new Set(prev);
        next.add(payload.userId);
        return next;
      });
      setTimeout(() => {
        setTypingUsers((prev) => {
          const next = new Set(prev);
          next.delete(payload.userId);
          return next;
        });
      }, 10000);
    };

    socket.on('message:new', onMessage);
    socket.on('message:edit', onEdit);
    socket.on('message:delete', onDelete);
    socket.on('typing:start', onTyping);

    return () => {
      socket.emit('unsubscribe:channel', { channelId });
      socket.off('message:new', onMessage);
      socket.off('message:edit', onEdit);
      socket.off('message:delete', onDelete);
      socket.off('typing:start', onTyping);
      if (flushTimer.current) {
        clearTimeout(flushTimer.current);
        flush();
      }
    };
  }, [channelId, socket, flush]);

  return { liveMessages, typingUsers };
}

export interface ActivityEvent {
  type: string;
  payload: Record<string, unknown>;
  timestamp: number;
}

export function useGuildSocket(guildId: string | undefined) {
  const { socket } = useSocketContext();
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [statsTick, setStatsTick] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (!guildId) return;

    socket.emit('subscribe:guild', { guildId });

    const onMemberEvent = (payload: Record<string, unknown>) => {
      setEvents((prev) => [{ type: 'member:event', payload, timestamp: Date.now() }, ...prev].slice(0, 100));
    };

    const onPresence = (payload: Record<string, unknown>) => {
      setEvents((prev) => [{ type: 'presence:update', payload, timestamp: Date.now() }, ...prev].slice(0, 100));
    };

    const onVoice = (payload: Record<string, unknown>) => {
      setEvents((prev) => [{ type: 'voice:event', payload, timestamp: Date.now() }, ...prev].slice(0, 100));
    };

    const onAudit = (payload: Record<string, unknown>) => {
      setEvents((prev) => [{ type: 'guild:audit', payload, timestamp: Date.now() }, ...prev].slice(0, 100));
    };

    const onStats = (payload: Record<string, unknown>) => {
      setStatsTick(payload);
    };

    socket.on('member:event', onMemberEvent);
    socket.on('presence:update', onPresence);
    socket.on('voice:event', onVoice);
    socket.on('guild:audit', onAudit);
    socket.on('stats:tick', onStats);

    return () => {
      socket.emit('unsubscribe:guild', { guildId });
      socket.off('member:event', onMemberEvent);
      socket.off('presence:update', onPresence);
      socket.off('voice:event', onVoice);
      socket.off('guild:audit', onAudit);
      socket.off('stats:tick', onStats);
    };
  }, [guildId, socket]);

  return { events, statsTick };
}

export interface SearchFilters {
  q?: string;
  filters?: unknown;
}

export function useLiveSearch(filters: SearchFilters) {
  const { socket } = useSocketContext();
  const [matches, setMatches] = useState<LiveMessage[]>([]);

  useEffect(() => {
    socket.emit('subscribe:search', filters);

    const onMatch = (msg: LiveMessage) => {
      setMatches((prev) => [msg, ...prev].slice(0, 100));
    };

    socket.on('search:match', onMatch);

    return () => {
      socket.emit('unsubscribe:search', filters);
      socket.off('search:match', onMatch);
    };
  }, [socket, filters.q, JSON.stringify(filters.filters)]);

  return matches;
}
