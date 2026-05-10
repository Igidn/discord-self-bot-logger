import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import apiClient from '../api/client';
import { useChannelSocket } from '../socket/hooks';
import { MessageCard } from '../components/MessageCard';
import { TypingIndicator } from '../components/TypingIndicator';
import { timestampMs, type TimestampValue } from '../utils/datetime';

interface FeedMessage {
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

export default function ChannelFeed() {
  const { id: guildId, channelId } = useParams<{ id: string; channelId: string }>();
  const [messages, setMessages] = useState<FeedMessage[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { liveMessages, typingUsers } = useChannelSocket(channelId);

  const fetchMessages = useCallback(
    async (afterCursor?: string | null) => {
      if (!channelId || loading) return;
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set('channel', channelId);
        params.set('limit', '50');
        if (afterCursor) params.set('cursor', afterCursor);
        const res = await apiClient.get<{ data: FeedMessage[]; nextCursor: string | null }>(
          `/messages?${params.toString()}`
        );
        if (!afterCursor) {
          setMessages(res.data.data);
        } else {
          setMessages((prev) => [...prev, ...res.data.data]);
        }
        setCursor(res.data.nextCursor);
        setHasMore(!!res.data.nextCursor);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    },
    [channelId]
  );

  useEffect(() => {
    setMessages([]);
    setCursor(null);
    setHasMore(true);
    fetchMessages(null);
  }, [channelId, fetchMessages]);

  // Merge live messages
  useEffect(() => {
    if (liveMessages.length === 0) return;
    setMessages((prev) => {
      const map = new Map(prev.map((m) => [m.id, m]));
      for (const lm of liveMessages) {
        map.set(lm.id, lm);
      }
      return Array.from(map.values()).sort((a, b) => timestampMs(b.createdAt) - timestampMs(a.createdAt));
    });
  }, [liveMessages]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 200) {
      if (hasMore && !loading) {
        fetchMessages(cursor);
      }
    }
  }, [cursor, fetchMessages, hasMore, loading]);

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-gray-800 flex items-center gap-3 bg-gray-900">
        <Link
          to={`/guilds/${guildId}`}
          className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold truncate">Channel Feed</h1>
          <p className="text-xs text-gray-400">{messages.length} messages loaded</p>
        </div>
        <button
          onClick={() => fetchMessages(null)}
          disabled={loading}
          className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 space-y-2"
      >
        {messages.map((msg, idx) => (
          <MessageCard
            key={msg.id}
            message={msg}
            isLive={idx < liveMessages.length}
          />
        ))}

        {loading && (
          <div className="py-4 text-center text-sm text-gray-500">Loading more...</div>
        )}

        {!hasMore && messages.length > 0 && (
          <div className="py-4 text-center text-xs text-gray-600">Reached the beginning of time</div>
        )}

        {messages.length === 0 && !loading && (
          <div className="py-12 text-center text-sm text-gray-500">No messages in this channel yet.</div>
        )}
      </div>

      {typingUsers.size > 0 && (
        <div className="px-4 py-2 border-t border-gray-800 bg-gray-900 flex items-center gap-2">
          <TypingIndicator />
          <span className="text-xs text-gray-400">{typingUsers.size} user(s) typing</span>
        </div>
      )}
    </div>
  );
}
