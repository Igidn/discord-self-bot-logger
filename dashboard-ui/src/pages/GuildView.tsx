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
  Search,
  Server,
  Sparkles,
  Trash2,
  TrendingUp,
  User,
  UserPlus,
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
import apiClient from '../api/client';
import { formatDateTime, formatRelativeTime, type TimestampValue } from '../utils/datetime';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface GuildInfo {
  id: string;
  name: string;
  icon?: string | null;
  ownerId?: string | null;
  joinedAt?: number | null;
  memberCount: number;
  messageCount: number;
}

interface GuildStats {
  totalMessages: number;
  deletedMessages: number;
  totalEdits: number;
  totalAttachments: number;
  totalReactions: number;
  totalMemberEvents: number;
  totalVoiceEvents: number;
  firstLoggedAt: number | null;
  topChannels: { channelId: string; channelName: string | null; count: number }[];
  topUsers: { userId: string; username: string | null; avatarUrl: string | null; count: number }[];
  dailyCounts: { day: string; count: number }[];
  periodDays: number;
}

interface RecentMessage {
  id: string;
  channelId: string;
  authorId: string;
  content?: string | null;
  createdAt: TimestampValue;
  author?: { id: string; username: string | null; avatarUrl?: string | null } | null;
  channel?: { id: string; name: string | null } | null;
}

interface MemberEvent {
  id: number;
  userId: string;
  eventType: string;
  createdAt: TimestampValue;
  username?: string | null;
}

const chartConfig = {
  count: { label: 'Messages', color: 'hsl(var(--chart-1))' },
} satisfies ChartConfig;

const RANGE_OPTIONS = [
  { value: '30', label: '30d' },
  { value: '90', label: '90d' },
] as const;

type Range = (typeof RANGE_OPTIONS)[number]['value'];

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function GuildView() {
  const { id = '' } = useParams();
  const [range, setRange] = useState<Range>('30');
  const [guild, setGuild] = useState<GuildInfo | null>(null);
  const [stats, setStats] = useState<GuildStats | null>(null);
  const [recent, setRecent] = useState<RecentMessage[]>([]);
  const [memberEvents, setMemberEvents] = useState<MemberEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      apiClient.get<GuildInfo>(`/guilds/${id}`).catch(() => ({ data: null as GuildInfo | null })),
      apiClient.get<GuildStats>(`/stats/guild/${id}?range=${range}`).catch(() => ({ data: null as GuildStats | null })),
    ])
      .then(([gRes, sRes]) => {
        if (cancelled) return;
        setGuild(gRes.data);
        setStats(sRes.data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, range]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    Promise.all([
      apiClient
        .get<{ data: RecentMessage[] }>(`/messages?guild=${id}&limit=8`)
        .catch(() => ({ data: { data: [] } })),
      apiClient
        .get<MemberEvent[]>(`/activity/member-events?guild=${id}&limit=8`)
        .catch(() => ({ data: [] as MemberEvent[] })),
    ]).then(([mRes, eRes]) => {
      if (cancelled) return;
      setRecent(mRes.data.data);
      setMemberEvents(eRes.data);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const dailyData = useMemo(
    () =>
      (stats?.dailyCounts ?? [])
        .slice()
        .sort((a, b) => a.day.localeCompare(b.day))
        .map((item) => ({ date: formatShortDate(item.day), count: item.count })),
    [stats],
  );

  const topChannels = useMemo(
    () =>
      (stats?.topChannels ?? []).map((item) => ({
        id: item.channelId,
        label: item.channelName ? `#${item.channelName}` : `#${item.channelId.slice(-6)}`,
        count: item.count,
        to: `/guilds/${id}/channels/${item.channelId}`,
      })),
    [stats, id],
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

  const healthCards = [
    { label: 'Total Messages', value: stats?.totalMessages, icon: MessagesSquare },
    { label: 'Deleted', value: stats?.deletedMessages, icon: Trash2, headline: true },
    { label: 'Edits', value: stats?.totalEdits, icon: FileEdit, headline: true },
    { label: 'Attachments', value: stats?.totalAttachments, icon: Paperclip },
    { label: 'Reactions', value: stats?.totalReactions, icon: Sparkles },
  ];

  return (
    <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-6">
      {/* Header / orientation */}
      <div className="flex flex-col gap-4">
        <Button variant="ghost" size="sm" asChild className="w-fit gap-1 text-xs text-muted-foreground">
          <Link to="/guilds">
            <ArrowLeft className="size-3.5" />
            All guilds
          </Link>
        </Button>

        <div className="flex items-start gap-4">
          {loading && !guild ? (
            <Skeleton className="size-16 rounded-2xl" />
          ) : (
            <GuildAvatar guild={guild} id={id} />
          )}
          <div className="flex flex-col gap-1">
            {loading && !guild ? (
              <>
                <Skeleton className="h-7 w-48" />
                <Skeleton className="h-4 w-72" />
              </>
            ) : (
              <>
                <h1 className="text-2xl font-semibold tracking-tight">
                  {guild?.name ?? id}
                </h1>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <User className="size-3.5" />
                    {guild?.memberCount ?? 0} members
                  </span>
                  {guild?.ownerId && (
                    <span className="inline-flex items-center gap-1.5">
                      Owner
                      <span className="font-mono text-xs">{guild.ownerId}</span>
                    </span>
                  )}
                  {guild?.joinedAt != null && (
                    <span className="inline-flex items-center gap-1.5">
                      Bot joined
                      <span className="text-xs">{formatDateTime(guild.joinedAt)}</span>
                    </span>
                  )}
                  {stats?.firstLoggedAt != null && (
                    <span className="inline-flex items-center gap-1.5">
                      First logged
                      <span className="text-xs">{formatDateTime(stats.firstLoggedAt)}</span>
                    </span>
                  )}
                </div>
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
            <CardDescription>Daily message volume in this guild</CardDescription>
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

      {/* Archive-health stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {healthCards.map((card) => (
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

      {/* Concentration */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Hash className="size-4 text-muted-foreground" />
              Top Channels
            </CardTitle>
            <CardDescription>Where this guild's messages land</CardDescription>
          </CardHeader>
          <CardContent>
            {loading && !stats ? <RankListSkeleton /> : <RankList items={topChannels} emptyLabel="No channel activity yet." />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <User className="size-4 text-muted-foreground" />
              Top Talkers
            </CardTitle>
            <CardDescription>Most active members in this guild</CardDescription>
          </CardHeader>
          <CardContent>
            {loading && !stats ? <RankListSkeleton showAvatar /> : <RankList items={topUsers} emptyLabel="No user activity yet." />}
          </CardContent>
        </Card>
      </div>

      {/* Recent life */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <CardTitle className="text-base font-semibold">Latest Messages</CardTitle>
              <CardDescription>Most recent captures across this guild's channels</CardDescription>
            </div>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" asChild>
              <Link to={`/browse?guild=${id}`}>
                <MessagesSquare className="size-3.5" />
                Browse all
                <ArrowUpRight className="size-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {recent.length === 0 ? (
              <div className="flex min-h-[140px] items-center justify-center px-6 text-sm text-muted-foreground">
                No messages captured in this guild yet.
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

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <CardTitle className="text-base font-semibold">Member Events</CardTitle>
              <CardDescription>Recent joins, leaves, bans</CardDescription>
            </div>
            <Button variant="ghost" size="sm" className="gap-1 text-xs" asChild>
              <Link to={`/activity?tab=members&guild=${id}`}>
                All
                <ArrowUpRight className="size-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {memberEvents.length === 0 ? (
              <div className="flex min-h-[140px] items-center justify-center text-sm text-muted-foreground">
                No recent member events.
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {memberEvents.map((ev) => (
                  <MemberEventRow key={ev.id} event={ev} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Drill-outs */}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" className="gap-1.5" asChild>
          <Link to={`/browse?guild=${id}`}>
            <MessagesSquare className="size-4" />
            Browse all messages
          </Link>
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5" asChild>
          <Link to={`/search?query=${encodeURIComponent(`server:${id}`)}`}>
            <Search className="size-4" />
            Search in guild
          </Link>
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5" asChild>
          <Link to={`/activity?guild=${id}`}>
            <Server className="size-4" />
            Activity for this guild
          </Link>
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function GuildAvatar({ guild, id }: { guild: GuildInfo | null; id: string }) {
  const name = guild?.name ?? id;
  const initials = name.slice(0, 2).toUpperCase();
  return (
    <Avatar className="size-16 rounded-2xl shrink-0">
      {guild?.icon ? <AvatarImage src={guild.icon} alt={name} className="rounded-2xl object-cover" /> : null}
      <AvatarFallback className="rounded-2xl text-lg font-medium">{initials}</AvatarFallback>
    </Avatar>
  );
}

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
                {item.avatarUrl !== undefined && (
                  <Avatar className="size-5 shrink-0">
                    <AvatarImage src={item.avatarUrl ?? undefined} alt={item.label} />
                    <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
                  </Avatar>
                )}
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

function MessageRow({ message }: { message: RecentMessage }) {
  const username = message.author?.username ?? `User ${message.authorId.slice(-4)}`;
  const initials = username.slice(0, 2).toUpperCase();
  const content = message.content?.trim() || '(no text content)';
  const channelName = message.channel?.name ?? message.channelId.slice(-6);
  return (
    <Link to={`/messages/${message.id}`} className="flex items-start gap-3 px-6 py-3.5 transition-colors hover:bg-muted/50">
      <Avatar className="size-8 shrink-0">
        <AvatarImage src={message.author?.avatarUrl ?? undefined} alt={username} />
        <AvatarFallback className="text-xs">{initials}</AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{username}</span>
          <Badge variant="secondary" className="text-xs shrink-0 max-w-[240px] truncate">
            #{channelName}
          </Badge>
        </div>
        <p className="break-words text-xs text-muted-foreground">{content}</p>
      </div>
      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{formatRelativeTime(message.createdAt)}</span>
    </Link>
  );
}

function MemberEventRow({ event }: { event: MemberEvent }) {
  const label = event.username ?? event.userId.slice(-6);
  const variant = memberEventVariant(event.eventType);
  return (
    <div className="flex items-center gap-2 text-sm">
      <UserPlus className="size-3.5 shrink-0 text-muted-foreground" />
      <Badge variant={variant} className="text-xs shrink-0">
        {event.eventType}
      </Badge>
      <span className="truncate text-sm font-medium">{label}</span>
      <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">
        {formatRelativeTime(event.createdAt)}
      </span>
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

// ponytail: member-event variant mirrors Activity's eventVariant mapping but
// inline so GuildView stays self-contained. If the set grows, lift to a shared
// helper alongside eventVariant in Activity.tsx.
function memberEventVariant(type: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  const lower = type.toLowerCase();
  if (/join|create|add|unban/.test(lower)) return 'default';
  if (/leave|remove|ban|kick|prune/.test(lower)) return 'destructive';
  return 'secondary';
}

function formatShortDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}