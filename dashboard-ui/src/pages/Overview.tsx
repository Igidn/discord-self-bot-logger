import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  MessageSquare,
  Server,
  Users,
  Activity,
  ArrowRight,
  TrendingUp,
  Clock,
} from 'lucide-react';
import apiClient from '../api/client';
import { useSocketContext } from '../socket/context';
import { LiveBadge } from '../components/LiveBadge';
import { MessageCard } from '../components/MessageCard';

interface HealthStats {
  status: string;
  uptime: number;
  guildsCount: number;
  messagesCount: number;
}

interface RecentMessage {
  id: string;
  guildId?: string | null;
  channelId: string;
  authorId: string;
  content?: string | null;
  createdAt: number;
  author?: {
    id: string;
    username: string;
    avatarUrl?: string | null;
  } | null;
}

export default function Overview() {
  const { status } = useSocketContext();
  const [health, setHealth] = useState<HealthStats | null>(null);
  const [recent, setRecent] = useState<RecentMessage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [healthRes, messagesRes] = await Promise.all([
          apiClient.get<HealthStats>('/health'),
          apiClient.get<{ data: RecentMessage[] }>('/messages?limit=10'),
        ]);
        setHealth(healthRes.data);
        setRecent(messagesRes.data.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const stats = [
    {
      label: 'Messages',
      value: health?.messagesCount ?? 0,
      icon: MessageSquare,
      color: 'text-discord-green',
      bg: 'bg-discord-green/10',
    },
    {
      label: 'Guilds',
      value: health?.guildsCount ?? 0,
      icon: Server,
      color: 'text-discord-blurple',
      bg: 'bg-discord-blurple/10',
    },
    {
      label: 'Uptime',
      value: formatUptime(health?.uptime ?? 0),
      icon: Clock,
      color: 'text-discord-yellow',
      bg: 'bg-discord-yellow/10',
    },
    {
      label: 'Status',
      value: health?.status ?? 'unknown',
      icon: Activity,
      color: 'text-discord-fuchsia',
      bg: 'bg-discord-fuchsia/10',
    },
  ];

  return (
    <div className="p-6 space-y-6 overflow-y-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Overview</h1>
          <p className="text-sm text-gray-400 mt-1">Dashboard overview and recent activity</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">Socket</span>
          <LiveBadge />
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center gap-4"
          >
            <div className={`w-10 h-10 rounded-lg ${s.bg} flex items-center justify-center`}>
              <s.icon className={`w-5 h-5 ${s.color}`} />
            </div>
            <div>
              <div className="text-2xl font-bold">{s.value}</div>
              <div className="text-xs text-gray-400">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Recent Messages */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl">
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
          <h2 className="font-semibold flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-discord-green" />
            Recent Messages
          </h2>
          <Link
            to="/search"
            className="text-sm text-discord-blurple hover:underline flex items-center gap-1"
          >
            View all <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="p-2 space-y-1">
          {loading ? (
            <div className="p-4 text-sm text-gray-500">Loading...</div>
          ) : recent.length === 0 ? (
            <div className="p-4 text-sm text-gray-500">No messages yet.</div>
          ) : (
            recent.map((msg) => (
              <MessageCard key={msg.id} message={msg} compact />
            ))
          )}
        </div>
      </div>

      {/* Connection Status Banner */}
      {status !== 'connected' && (
        <div className="bg-discord-yellow/10 border border-discord-yellow/30 rounded-xl p-4 text-sm text-discord-yellow">
          Real-time connection is {status}. Some live updates may be delayed.
        </div>
      )}
    </div>
  );
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
