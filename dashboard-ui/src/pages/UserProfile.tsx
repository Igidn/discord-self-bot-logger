import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ChevronRight,
  MessageSquare,
  Calendar,
  Hash,
  Activity,
} from 'lucide-react';
import apiClient from '../api/client';
import { ActivityHeatmap } from '../components/ActivityHeatmap';
import { MessageCard } from '../components/MessageCard';
import { UserTimelines } from '../components/UserTimelines';
import { formatDate, type TimestampValue } from '../utils/datetime';

interface UserProfileData {
  id: string;
  username: string;
  discriminator?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  bot?: number;
  firstSeenAt?: TimestampValue;
  stats: {
    messageCount: number;
    guildCount: number;
    firstMessageAt?: TimestampValue;
    lastMessageAt?: TimestampValue;
  };
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
  const navigate = useNavigate();
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
          // Message preview is a separate concern from stats
          apiClient.get<{ data: UserMessage[] }>(`/users/${id}/messages?limit=20`),
        ]);
        setUser(uRes.data);
        setMessages(mRes.data.data);
        setStats(uRes.data.stats);
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
        <div className="text-sm text-muted-foreground">Loading profile...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-6">
        <div className="text-sm text-muted-foreground">User not found.</div>
      </div>
    );
  }

  return (
    <div className="p-6 overflow-y-auto">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => history.back()}
          className="p-2 rounded-lg bg-card border border-border hover:bg-muted transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="text-2xl font-bold">User Profile</h1>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6 items-start">
        {/* Left: profile + stats + tabs */}
        <div className="space-y-6 min-w-0">
      {/* Profile Header — Discord-style banner with overlapping avatar */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {/* Banner / landscape fallback */}
        <div className="relative h-28 sm:h-32 w-full">
          {user.bannerUrl ? (
            <img
              src={user.bannerUrl}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : (
            // ponytail: gradient fallback uses theme tokens so it stays visible
            // in both light/dark (bg-discord-* classes aren't defined in the
            // config). Replace with the user's banner_color when that's stored.
            <div className="w-full h-full bg-gradient-to-br from-foreground/15 to-muted" />
          )}
        </div>

        <div className="px-6 pb-6 -mt-10">
          <div className="flex items-end gap-4">
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.username}
                className="w-20 h-20 rounded-full ring-4 ring-card object-cover shrink-0"
              />
            ) : (
              <div className="w-20 h-20 rounded-full ring-4 ring-card bg-muted flex items-center justify-center text-2xl font-bold shrink-0">
                {user.username.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="pb-1 min-w-0 flex-1">
              <div className="text-xl font-bold flex items-center gap-2">
                <span className="truncate">{user.displayName ?? user.username}</span>
                {user.bot ? (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-foreground text-background font-medium">
                    BOT
                  </span>
                ) : null}
              </div>
              <div className="text-sm text-muted-foreground truncate">
                {user.username}
                {user.discriminator ? `#${user.discriminator}` : ''}
              </div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground/80">
            <span>ID: {user.id}</span>
            {user.firstSeenAt && <span>First seen {formatDate(user.firstSeenAt)}</span>}
          </div>
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
      <div className="flex gap-2 border-b border-border">
        {(['messages', 'activity'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-discord-blurple text-discord-blurple'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {activeTab === 'messages' && (
        <div className="space-y-2">
          {messages.length === 0 ? (
            <div className="text-sm text-muted-foreground">No messages found.</div>
          ) : (
            messages.map((msg) => (
              <Link key={msg.id} to={`/messages/${msg.id}`} className="block">
                <MessageCard message={msg} compact />
              </Link>
            ))
          )}
          <button
            onClick={() =>
              navigate(
                `/browse?authorId=${encodeURIComponent(user.id)}&authorLabel=${encodeURIComponent(
                  user.username + (user.discriminator ? `#${user.discriminator}` : '')
                )}`
              )
            }
            className="flex items-center justify-center gap-1 w-full mt-3 py-2 text-sm font-medium text-discord-blurple bg-discord-blurple/10 hover:bg-discord-blurple/20 rounded-lg transition-colors"
          >
            View all messages
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {activeTab === 'activity' && (
        <ActivityHeatmap userId={user.id} />
      )}
        </div>

        {/* Right: member / voice / presence timelines */}
        <aside className="xl:sticky xl:top-6">
          <UserTimelines userId={user.id} />
        </aside>
      </div>
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
    <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
      <Icon className={`w-5 h-5 ${color}`} />
      <div>
        <div className="text-lg font-bold">{value}</div>
        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</div>
      </div>
    </div>
  );
}
