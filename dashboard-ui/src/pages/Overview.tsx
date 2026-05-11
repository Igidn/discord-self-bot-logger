import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  Clock3,
  MessageSquare,
  Search,
  Server,
  TrendingUp,
  Users,
  WifiOff,
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';

import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import apiClient from '../api/client';
import { useSocketContext } from '../socket/context';

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
  createdAt: string | number;
  author?: {
    id: string;
    username: string;
    avatarUrl?: string | null;
  } | null;
}

interface DailyCount {
  day: string;
  count: number;
}

interface TopChannel {
  channelId: string;
  count: number;
}

interface TopUser {
  userId: string;
  username?: string | null;
  avatarUrl?: string | null;
  count: number;
}

interface OverviewStats {
  dailyCounts: DailyCount[];
  topChannels: TopChannel[];
  topUsers: TopUser[];
}

const chartConfig = {
  messages: {
    label: 'Messages',
    color: 'hsl(var(--chart-1))',
  },
} satisfies ChartConfig;

export default function Overview() {
  const { socket, status } = useSocketContext();
  const [health, setHealth] = useState<HealthStats | null>(null);
  const [recent, setRecent] = useState<RecentMessage[]>([]);
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [healthRes, messagesRes, statsRes] = await Promise.all([
          apiClient.get<HealthStats>('/health'),
          apiClient.get<{ data: RecentMessage[] }>('/messages?limit=8'),
          apiClient.get<OverviewStats>('/stats/overview?range=30d'),
        ]);
        setHealth(healthRes.data);
        setRecent(messagesRes.data.data);
        setStats(statsRes.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  useEffect(() => {
    if (!socket) return;

    const onMessage = (message: RecentMessage) => {
      setRecent((prev) => [message, ...prev.filter((item) => item.id !== message.id)].slice(0, 8));
    };

    socket.on('message:new', onMessage);

    return () => {
      socket.off('message:new', onMessage);
    };
  }, [socket]);

  const activityTrend = useMemo(
    () =>
      (stats?.dailyCounts ?? []).map((item) => ({
        date: formatShortDate(item.day),
        messages: item.count,
      })),
    [stats],
  );

  const topChannels = (stats?.topChannels ?? []).map((item) => ({
    id: item.channelId,
    label: `#${item.channelId.slice(-6)}`,
    count: item.count,
  }));

  const topUsers = (stats?.topUsers ?? []).map((item) => ({
    id: item.userId,
    label: item.username ? `@${item.username}` : item.userId.slice(-6),
    avatarUrl: item.avatarUrl,
    count: item.count,
  }));

  const isConnected = status === 'connected';

  const statCards = [
    {
      label: 'Total Messages',
      value: formatNumber(health?.messagesCount ?? 0),
      icon: MessageSquare,
      description: 'Captured across all guilds',
      trend: null,
    },
    {
      label: 'Tracked Guilds',
      value: health?.guildsCount ?? 0,
      icon: Server,
      description: 'Active guild workspaces',
      trend: null,
    },
    {
      label: 'Uptime',
      value: formatUptime(health?.uptime ?? 0),
      icon: Clock3,
      description: 'Current session runtime',
      trend: null,
    },
  ];

  return (
    <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-6">

      {/* Stats row */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {statCards.map((card) => (
          <Card key={card.label} className="relative overflow-hidden">
            <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
              <CardDescription className="text-sm font-medium">{card.label}</CardDescription>
              <div className="rounded-md bg-muted p-1.5">
                <card.icon className="size-4 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-1">
              {loading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <p
                  className={`text-2xl font-bold tracking-tight ${
                    card.trend === 'connected'
                      ? 'text-emerald-500'
                      : card.trend === 'disconnected'
                        ? 'text-destructive'
                        : ''
                  }`}
                >
                  {card.value}
                </p>
              )}
              <p className="text-xs text-muted-foreground">{card.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main content area */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        {/* Activity chart */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <CardTitle className="text-base font-semibold">Message Activity</CardTitle>
              <CardDescription>Daily captured volume — last 30 days</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild className="gap-1 text-xs">
              <Link to="/stats">
                Full analytics
                <ArrowUpRight className="size-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[240px] w-full rounded-lg" />
            ) : activityTrend.length === 0 ? (
              <EmptyChart />
            ) : (
              <ChartContainer config={chartConfig} className="h-[240px] w-full">
                <BarChart data={activityTrend} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    tick={{ fontSize: 11 }}
                    interval="preserveStartEnd"
                  />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                  <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                  <Bar
                    dataKey="messages"
                    fill="var(--color-messages)"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={32}
                  />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Top activity */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Top Activity</CardTitle>
            <CardDescription>Most active channels and users — 30 days</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="channels" className="flex flex-col gap-4">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="channels" className="gap-1.5 text-xs">
                  <Server className="size-3.5" />
                  Channels
                </TabsTrigger>
                <TabsTrigger value="users" className="gap-1.5 text-xs">
                  <Users className="size-3.5" />
                  Users
                </TabsTrigger>
              </TabsList>
              <TabsContent value="channels" className="mt-0">
                {loading ? (
                  <RankListSkeleton />
                ) : (
                  <RankList items={topChannels} emptyLabel="No channel activity yet." />
                )}
              </TabsContent>
              <TabsContent value="users" className="mt-0">
                {loading ? (
                  <RankListSkeleton />
                ) : (
                  <RankList items={topUsers} emptyLabel="No user activity yet." />
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      {/* Recent messages */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <CardTitle className="text-base font-semibold">Recent Messages</CardTitle>
            <CardDescription>Latest captured messages across tracked guilds</CardDescription>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" asChild>
            <Link to="/search">
              <Search className="size-3.5" />
              Browse all
              <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex flex-col divide-y">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-start gap-3 px-6 py-4">
                  <Skeleton className="size-8 rounded-full shrink-0" />
                  <div className="flex flex-col gap-2 flex-1">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-full max-w-sm" />
                  </div>
                  <Skeleton className="h-3 w-16 shrink-0" />
                </div>
              ))}
            </div>
          ) : recent.length === 0 ? (
            <div className="flex min-h-[160px] items-center justify-center px-6 text-sm text-muted-foreground">
              No messages captured yet.
            </div>
          ) : (
            <div className="flex flex-col divide-y">
              {recent.map((msg) => (
                <MessageRow key={msg.id} message={msg} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Disconnected banner */}
      {!isConnected && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="flex items-center gap-3 p-4">
            <WifiOff className="size-4 shrink-0 text-destructive" />
            <p className="text-sm text-destructive">
              Realtime connection is{' '}
              <span className="font-medium">{statusLabel(status).toLowerCase()}</span>. Live
              updates may be delayed.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function MessageRow({ message }: { message: RecentMessage }) {
  const username = message.author?.username ?? `User ${message.authorId.slice(-4)}`;
  const initials = username.slice(0, 2).toUpperCase();
  const content = message.content?.trim() || '(no text content)';
  const time = formatRelativeTime(message.createdAt);

  return (
    <Link
      to={`/messages/${message.id}`}
      className="flex items-start gap-3 px-6 py-3.5 transition-colors hover:bg-muted/50"
    >
      <Avatar className="size-8 shrink-0">
        <AvatarImage src={message.author?.avatarUrl ?? undefined} alt={username} />
        <AvatarFallback className="text-xs">{initials}</AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{username}</span>
          {message.channelId && (
            <Badge variant="secondary" className="text-xs shrink-0">
              #{message.channelId.slice(-4)}
            </Badge>
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">{content}</p>
      </div>
      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{time}</span>
    </Link>
  );
}

function RankList({
  items,
  emptyLabel,
}: {
  items: { id: string; label: string; avatarUrl?: string | null; count: number }[];
  emptyLabel: string;
}) {
  const maxCount = Math.max(...items.map((item) => item.count), 1);

  if (items.length === 0) {
    return (
      <div className="flex min-h-[120px] items-center justify-center text-sm text-muted-foreground">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {items.slice(0, 5).map((item, index) => {
        const initials = item.label.slice(0, 2).toUpperCase();
        return (
          <div key={item.id} className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs tabular-nums text-muted-foreground w-4 shrink-0">
                  {index + 1}
                </span>
                {item.avatarUrl !== undefined && (
                  <Avatar className="size-5 shrink-0">
                    <AvatarImage src={item.avatarUrl ?? undefined} alt={item.label} />
                    <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
                  </Avatar>
                )}
                <span className="truncate text-sm font-medium">{item.label}</span>
              </div>
              <span className="text-xs tabular-nums text-muted-foreground shrink-0">
                {formatNumber(item.count)}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary/70 transition-all"
                style={{ width: `${Math.max((item.count / maxCount) * 100, 6)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RankListSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Skeleton className="size-5 rounded-full" />
              <Skeleton className="h-4 w-32" />
            </div>
            <Skeleton className="h-4 w-10" />
          </div>
          <Skeleton className="h-1.5 w-full rounded-full" />
        </div>
      ))}
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="flex h-[240px] items-center justify-center rounded-lg border border-dashed">
      <div className="flex flex-col items-center gap-2 text-center">
        <TrendingUp className="size-8 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">No activity data yet</p>
      </div>
    </div>
  );
}

// ─── Utilities ─────────────────────────────────────────────────────────────────

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatShortDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatRelativeTime(ts: string | number): string {
  const timestamp =
    typeof ts === 'string'
      ? new Date(ts).getTime()
      : ts < 1e12
        ? ts * 1000
        : ts;

  if (Number.isNaN(timestamp)) return 'unknown';

  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatNumber(value: number) {
  return value.toLocaleString();
}

function statusLabel(status: string) {
  switch (status) {
    case 'connected':
      return 'Connected';
    case 'connecting':
      return 'Connecting';
    case 'reconnecting':
      return 'Reconnecting';
    default:
      return 'Disconnected';
  }
}
