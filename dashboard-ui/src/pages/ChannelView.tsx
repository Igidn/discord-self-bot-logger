import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import {
  ArrowLeft,
  ArrowUpRight,
  FileEdit,
  Hash,
  MessagesSquare,
  Paperclip,
  ShieldAlert,
  Sparkles,
  Trash2,
  TrendingUp,
  User,
} from 'lucide-react';
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
import { MessageCard } from '@/components/MessageCard';
import { ActivityHeatmap } from '@/components/ActivityHeatmap';
import apiClient from '../api/client';
import { formatDateTime, type TimestampValue } from '../utils/datetime';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ChannelStats {
  channel: {
    id: string;
    name: string | null;
    topic: string | null;
    type: number | null;
    nsfw: number | null;
    parentId: string | null;
    parentName: string | null;
    guildId: string | null;
    guildName: string | null;
  } | null;
  totalMessages: number;
  deletedMessages: number;
  totalEdits: number;
  totalAttachments: number;
  totalReactions: number;
  firstLoggedAt: number | null;
  lastLoggedAt: number | null;
  distinctUsers: number;
  topUsers: { userId: string; username: string | null; avatarUrl: string | null; count: number }[];
  topReactions: { emoji: string | null; emojiId: string | null; count: number }[];
  dailyCounts: { day: string; count: number }[];
  periodDays: number;
}

interface RecentMessage {
  id: string;
  channelId: string;
  authorId: string;
  content?: string | null;
  createdAt: TimestampValue;
  editedAt?: TimestampValue;
  deletedAt?: TimestampValue;
  replyToId?: string | null;
  stickerLinks?: string | null;
  embedsJson?: string | null;
  author?: { id: string; username: string | null; avatarUrl?: string | null } | null;
}

const chartConfig = {
  count: { label: 'Messages', color: 'hsl(var(--chart-1))' },
} satisfies ChartConfig;

const RANGE_OPTIONS = [
  { value: '30', label: '30d' },
  { value: '90', label: '90d' },
] as const;

type Range = (typeof RANGE_OPTIONS)[number]['value'];

// Discord channel type bits we actually render a label for; unknown ints
// fall back to "channel" rather than guessing. Thread types collapse to one
// "Thread" label since the page doesn't distinguish public/private threads.
const CHANNEL_TYPE_LABEL: Record<number, string> = {
  0: 'Text',
  2: 'Voice',
  4: 'Category',
  5: 'Announcement',
  10: 'Thread',
  11: 'Thread',
  12: 'Thread',
  13: 'Stage',
  15: 'Forum',
  16: 'Forum',
};

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function ChannelView() {
  const { id = '', channelId = '' } = useParams();
  const [range, setRange] = useState<Range>('30');
  const [stats, setStats] = useState<ChannelStats | null>(null);
  const [recent, setRecent] = useState<RecentMessage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!channelId) return;
    let cancelled = false;
    setLoading(true);
    apiClient
      .get<ChannelStats>(`/stats/channel/${channelId}?range=${range}`)
      .catch(() => ({ data: null as ChannelStats | null }))
      .then((res) => {
        if (!cancelled) setStats(res.data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [channelId, range]);

  useEffect(() => {
    if (!channelId) return;
    let cancelled = false;
    apiClient
      .get<{ data: RecentMessage[] }>(`/messages?channel=${channelId}&limit=5`)
      .catch(() => ({ data: { data: [] } }))
      .then((res) => {
        if (!cancelled) setRecent(res.data.data);
      });
    return () => {
      cancelled = true;
    };
  }, [channelId]);

  const channel = stats?.channel ?? null;
  const channelName = channel?.name ?? channelId;

  const dailyData = useMemo(
    () =>
      (stats?.dailyCounts ?? [])
        .slice()
        .sort((a, b) => a.day.localeCompare(b.day))
        .map((item) => ({ date: formatShortDate(item.day), count: item.count })),
    [stats],
  );

  const topUsers = useMemo(
    () =>
      (stats?.topUsers ?? []).map((item) => ({
        id: item.userId,
        label: item.username ? `@${item.username}` : item.userId.slice(-6),
        avatarUrl: item.avatarUrl,
        count: item.count,
        to: `/users/${item.userId}`,
      })),
    [stats],
  );

  const statCards = [
    { label: 'Total Messages', value: stats?.totalMessages, icon: MessagesSquare },
    { label: 'Deleted', value: stats?.deletedMessages, icon: Trash2, headline: true },
    { label: 'Edits', value: stats?.totalEdits, icon: FileEdit, headline: true },
    { label: 'Attachments', value: stats?.totalAttachments, icon: Paperclip },
    { label: 'Reactions', value: stats?.totalReactions, icon: Sparkles },
  ];

  return (
    <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-6">
      {/* Identity bar */}
      <div className="flex flex-col gap-4">
        <Button variant="ghost" size="sm" asChild className="w-fit gap-1 text-xs text-muted-foreground">
          <Link to={`/guilds/${id}`}>
            <ArrowLeft className="size-3.5" />
            Back to guild
          </Link>
        </Button>

        <div className="flex items-start gap-3">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-muted">
            <Hash className="size-6 text-muted-foreground" />
          </div>
          <div className="flex flex-col gap-1">
            {loading && !stats ? (
              <>
                <Skeleton className="h-7 w-48" />
                <Skeleton className="h-4 w-72" />
              </>
            ) : (
              <>
                <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
                  #{channelName}
                  {channel?.nsfw ? (
                    <Badge variant="destructive" className="gap-1 text-xs">
                      <ShieldAlert className="size-3" />
                      NSFW
                    </Badge>
                  ) : null}
                </h1>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  {channel?.type != null && (
                    <span>{CHANNEL_TYPE_LABEL[channel.type] ?? 'Channel'}</span>
                  )}
                  {channel?.parentName && (
                    <span className="inline-flex items-center gap-1.5">
                      in
                      <span className="font-medium">{channel.parentName}</span>
                    </span>
                  )}
                  {channel?.guildName && (
                    <Link to={`/guilds/${id}`} className="font-medium hover:underline">
                      {channel.guildName}
                    </Link>
                  )}
                  {stats?.firstLoggedAt != null && (
                    <span className="inline-flex items-center gap-1.5">
                      First logged
                      <span className="text-xs">{formatDateTime(stats.firstLoggedAt)}</span>
                    </span>
                  )}
                  {stats?.lastLoggedAt != null && (
                    <span className="inline-flex items-center gap-1.5">
                      Last logged
                      <span className="text-xs">{formatDateTime(stats.lastLoggedAt)}</span>
                    </span>
                  )}
                </div>
                {channel?.topic ? (
                  <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{channel.topic}</p>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Activity trend */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <CardTitle className="text-base font-semibold">Activity Trend</CardTitle>
            <CardDescription>Daily message volume in this channel</CardDescription>
          </div>
          <RangeSelector value={range} onChange={setRange} />
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-[260px] w-full rounded-lg" />
          ) : dailyData.length === 0 ? (
            <EmptyChart />
          ) : (
            <ChartContainer config={chartConfig} className="h-[260px] w-full">
              <BarChart data={dailyData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                <Bar dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]} maxBarSize={32} />
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      {/* Content-character stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {statCards.map((card) => (
          <Card key={card.label} className={card.headline ? 'border-primary/40' : undefined}>
            <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
              <CardDescription className="text-sm font-medium">{card.label}</CardDescription>
              <div className="rounded-md bg-muted p-1.5">
                <card.icon className="size-4 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent>
              {loading && !stats ? (
                <Skeleton className="h-7 w-20" />
              ) : (
                <p className="text-2xl font-bold tabular-nums tracking-tight">
                  {(card.value ?? 0).toLocaleString()}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Top chatters + top reactions */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <User className="size-4 text-muted-foreground" />
              Top Chatters
            </CardTitle>
            <CardDescription>
              {stats?.distinctUsers != null
                ? `${stats.distinctUsers.toLocaleString()} people chat here`
                : 'Who talks the most here'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading && !stats ? (
              <RankListSkeleton showAvatar />
            ) : (
              <RankList items={topUsers} emptyLabel="No user activity yet." />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Sparkles className="size-4 text-muted-foreground" />
              Top Reactions
            </CardTitle>
            <CardDescription>Most-used reactions in this channel</CardDescription>
          </CardHeader>
          <CardContent>
            {loading && !stats ? (
              <Skeleton className="h-24 w-full" />
            ) : (stats?.topReactions ?? []).length === 0 ? (
              <div className="flex min-h-[120px] items-center justify-center text-sm text-muted-foreground">
                No reactions recorded yet.
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {(stats?.topReactions ?? []).map((r, i) => (
                  <div key={`${r.emojiId ?? r.emoji ?? i}`} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 truncate text-sm font-medium">
                      <span className="w-4 shrink-0 text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                      <span className="text-base">{r.emoji ?? '?'}</span>
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {r.count.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Activity heatmap — the rhythm of this channel. Reuses ActivityHeatmap
          pointed at the per-channel stats endpoint instead of the user one. */}
      <ActivityHeatmap channelId={channelId} />

      {/* Recent teaser */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <CardTitle className="text-base font-semibold">Latest Messages</CardTitle>
            <CardDescription>Most recent captures in this channel</CardDescription>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" asChild>
            <Link to={`/browse?guild=${id}&channel=${channelId}`}>
              <MessagesSquare className="size-3.5" />
              Browse all in channel
              <ArrowUpRight className="size-3.5" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {recent.length === 0 ? (
            <div className="flex min-h-[140px] items-center justify-center text-sm text-muted-foreground">
              No messages captured in this channel yet.
            </div>
          ) : (
            recent.map((msg) => <MessageCard key={msg.id} message={msg} compact />)
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function RangeSelector({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  return (
    <div className="inline-flex items-center rounded-lg border bg-muted p-1 gap-0.5">
      {RANGE_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
            value === opt.value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function RankList({
  items,
  emptyLabel,
}: {
  items: { id: string; label: string; avatarUrl?: string | null; count: number; to?: string }[];
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
      {items.slice(0, 7).map((item, index) => {
        const initials = item.label.slice(0, 2).toUpperCase();
        return (
          <div key={item.id} className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-4 shrink-0 text-xs tabular-nums text-muted-foreground">{index + 1}</span>
                <Avatar className="size-5 shrink-0">
                  <AvatarImage src={item.avatarUrl ?? undefined} alt={item.label} />
                  <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
                </Avatar>
                {item.to ? (
                  <Link to={item.to} className="truncate text-sm font-medium hover:underline">
                    {item.label}
                  </Link>
                ) : (
                  <span className="truncate text-sm font-medium">{item.label}</span>
                )}
              </div>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {item.count.toLocaleString()}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary/70 transition-all"
                style={{ width: `${Math.max((item.count / maxCount) * 100, 4)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RankListSkeleton({ showAvatar = false }: { showAvatar?: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {showAvatar && <Skeleton className="size-5 rounded-full" />}
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
    <div className="flex h-[260px] items-center justify-center rounded-lg border border-dashed">
      <div className="flex flex-col items-center gap-2 text-center">
        <TrendingUp className="size-8 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">No activity data yet</p>
      </div>
    </div>
  );
}

function formatShortDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}