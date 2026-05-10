import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  MessageSquare,
  Calendar,
  Hash,
  Activity,
} from 'lucide-react';
import apiClient from '../api/client';
import { MessageCard } from '../components/MessageCard';
import { formatDate, type TimestampValue } from '../utils/datetime';

interface UserProfileData {
  id: string;
  username: string;
  discriminator?: string | null;
  avatarUrl?: string | null;
  bot?: number;
  firstSeenAt?: TimestampValue;
}

interface UserStats {
  messageCount: number;
  guildCount: number;
  firstMessageAt?: TimestampValue;
  lastMessageAt?: TimestampValue;
}

interface UserMessage {
  id: string;
  guildId?: string | null;
  channelId: string;
  authorId: string;
  content?: string | null;
  createdAt: TimestampValue;
  editedAt?: TimestampValue;
  deletedAt?: TimestampValue;
  author?: {
    id: string;
    username: string;
    avatarUrl?: string | null;
  } | null;
}

export default function UserProfile() {
  const { id } = useParams<{ id: string }>();
  const [user, setUser] = useState<UserProfileData | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [messages, setMessages] = useState<UserMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'messages' | 'activity'>('messages');

  useEffect(() => {
    if (!id) return;
    async function fetchData() {
      try {
        const [uRes, mRes] = await Promise.all([
          apiClient.get<UserProfileData>(`/users/${id}`),
          apiClient.get<{ data: UserMessage[] }>(`/users/${id}/messages?limit=20`),
        ]);
        setUser(uRes.data);
        setMessages(mRes.data.data);
        // Derive simple stats
        setStats({
          messageCount: mRes.data.data.length,
          guildCount: new Set(mRes.data.data.map((m) => m.guildId).filter(Boolean)).size,
          firstMessageAt: mRes.data.data[mRes.data.data.length - 1]?.createdAt,
          lastMessageAt: mRes.data.data[0]?.createdAt,
        });
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [id]);

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-sm text-gray-500">Loading profile...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-6">
        <div className="text-sm text-gray-500">User not found.</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 overflow-y-auto">
      <div className="flex items-center gap-3">
        <button
          onClick={() => history.back()}
          className="p-2 rounded-lg bg-gray-900 border border-gray-800 hover:bg-gray-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="text-2xl font-bold">User Profile</h1>
      </div>

      {/* Profile Header */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 flex items-center gap-4">
        {user.avatarUrl ? (
          <img src={user.avatarUrl} alt={user.username} className="w-16 h-16 rounded-full" />
        ) : (
          <div className="w-16 h-16 rounded-full bg-discord-blurple flex items-center justify-center text-xl font-bold">
            {user.username.charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <div className="text-xl font-bold">
            {user.username}
            {user.discriminator ? `#${user.discriminator}` : ''}
            {user.bot ? (
              <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-discord-blurple text-white">
                BOT
              </span>
            ) : null}
          </div>
          <div className="text-xs text-gray-400 mt-1">ID: {user.id}</div>
          {user.firstSeenAt && (
            <div className="text-xs text-gray-500 mt-0.5">
              First seen {formatDate(user.firstSeenAt)}
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard icon={MessageSquare} label="Messages" value={stats?.messageCount ?? 0} color="text-discord-green" />
        <StatCard icon={Hash} label="Guilds" value={stats?.guildCount ?? 0} color="text-discord-blurple" />
        <StatCard icon={Calendar} label="First Msg" value={formatDate(stats?.firstMessageAt)} color="text-discord-yellow" />
        <StatCard icon={Activity} label="Last Msg" value={formatDate(stats?.lastMessageAt)} color="text-discord-fuchsia" />
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-800">
        {(['messages', 'activity'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-discord-blurple text-discord-blurple'
                : 'border-transparent text-gray-400 hover:text-gray-100'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {activeTab === 'messages' && (
        <div className="space-y-2">
          {messages.length === 0 ? (
            <div className="text-sm text-gray-500">No messages found.</div>
          ) : (
            messages.map((msg) => (
              <Link key={msg.id} to={`/messages/${msg.id}`} className="block">
                <MessageCard message={msg} compact />
              </Link>
            ))
          )}
        </div>
      )}

      {activeTab === 'activity' && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="text-sm text-gray-500">Activity timeline coming soon.</div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center gap-3">
      <Icon className={`w-5 h-5 ${color}`} />
      <div>
        <div className="text-lg font-bold">{value}</div>
        <div className="text-[10px] text-gray-400 uppercase tracking-wider">{label}</div>
      </div>
    </div>
  );
}
