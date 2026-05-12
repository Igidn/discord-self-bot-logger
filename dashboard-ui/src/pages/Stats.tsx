import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { BarChart3, Hash, MessageSquare, TrendingUp, User } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import apiClient from '../api/client';
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

interface DailyCount {
  day: string;
  count: number;
}

interface TopChannel {
  channelId: string;
  channelName?: string | null;
  guildIconUrl?: string | null;
  count: number;
}

interface TopUser {
  userId: string;
  username?: string | null;
  avatarUrl?: string | null;
  count: number;
}

interface StatsData {
  dailyCounts: DailyCount[];
  topChannels: TopChannel[];
  topUsers: TopUser[];
}

const chartConfig = {
  count: {
    label: 'Messages',
    color: 'hsl(var(--chart-1))',
  },
} satisfies ChartConfig;

const RANGE_OPTIONS = [
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
] as const;

type Range = (typeof RANGE_OPTIONS)[number]['value'];

export default function Stats() {
  const [range, setRange] = useState<Range>('30d');
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      setLoading(true);
      try {
        const res = await apiClient.get<StatsData>(`/stats/overview?range=${range}`);
        setStats(res.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, [range]);

  const dailyData = useMemo(
    () =>
      (stats?.dailyCounts ?? []).map((item) => ({
        date: formatShortDate(item.day),
        count: item.count,
      })),
    [stats],
  );

  const topChannels = useMemo(
    () =>
      (stats?.topChannels ?? []).map((item) => ({
        id: item.channelId,
        label: item.channelName ? `#${item.channelName}` : `#${item.channelId.slice(-6)}`,
        avatarUrl: item.guildIconUrl,
        count: item.count,
      })),
    [stats],
  );

  const topUsers = useMemo(
    () =>
      (stats?.topUsers ?? []).map((item) => ({
        id: item.userId,
        label: item.username ? `@${item.username}` : item.userId.slice(-6),
        avatarUrl: item.avatarUrl,
        count: item.count,
      })),
    [stats],
  );

  const totalMessages = useMemo(
    () => (stats?.dailyCounts ?? []).reduce((sum, d) => sum + d.count, 0),
    [stats],
  );

  const avgPerDay = useMemo(
    () =>
      stats?.dailyCounts.length ? Math.round(totalMessages / stats.dailyCounts.length) : 0,
    [stats, totalMessages],
  );

  const peakDay = useMemo(
    () =>
      (stats?.dailyCounts ?? []).reduce(
        (max, d) => (d.count > max.count ? d : max),
        { day: '', count: 0 },
      ),
    [stats],
  );

  const summaryCards = [
    {
      label: `Messages (${range})`,
      value: loading ? null : totalMessages.toLocaleString(),
      icon: MessageSquare,
      description: 'Total captured in period',
    },
    {
      label: 'Daily Average',
      value: loading ? null : avgPerDay.toLocaleString(),
      icon: TrendingUp,
      description: 'Mean messages per day',
    },
    {
      label: 'Peak Day',
      value: loading ? null : peakDay.count > 0 ? peakDay.count.toLocaleString() : '—',
      icon: BarChart3,
      description:
        !loading && peakDay.day
          ? formatShortDate(peakDay.day)
          : 'No data yet',
    },
  ];

  return (
    <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
          <p className="text-sm text-muted-foreground">
            Message volume, top channels, and most active users over time.
          </p>
        </div>
        <RangeSelector value={range} onChange={setRange} />
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        {summaryCards.map((card) => (
          <Card key={card.label}>
            <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
              <CardDescription className="text-sm font-medium">{card.label}</CardDescription>
              <div className="rounded-md bg-muted p-1.5">
                <card.icon className="size-4 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-1">
              {card.value === null ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <p className="text-2xl font-bold tabular-nums tracking-tight">{card.value}</p>
              )}
              <p className="text-xs text-muted-foreground">{card.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Daily Messages chart */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <CardTitle className="text-base font-semibold">Daily Messages</CardTitle>
            <CardDescription>Message volume per day in the selected period</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-[280px] w-full rounded-lg" />
          ) : dailyData.length === 0 ? (
            <EmptyChart />
          ) : (
            <ChartContainer config={chartConfig} className="h-[280px] w-full">
              <BarChart data={dailyData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
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
                  dataKey="count"
                  fill="var(--color-count)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={32}
                />
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      {/* Top Channels + Top Users */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Hash className="size-4 text-muted-foreground" />
              Top Channels
            </CardTitle>
            <CardDescription>Most active channels in the selected period</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <RankListSkeleton />
            ) : (
              <RankList items={topChannels} emptyLabel="No channel activity yet." />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <User className="size-4 text-muted-foreground" />
              Top Users
            </CardTitle>
            <CardDescription>Most active users in the selected period</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <RankListSkeleton />
            ) : (
              <RankList items={topUsers} emptyLabel="No user activity yet." />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────────

function RangeSelector({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  return (
    <div className="inline-flex items-center rounded-lg border bg-muted p-1 gap-0.5 self-start sm:self-auto">
      {RANGE_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
            value === opt.value
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
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
      {items.slice(0, 7).map((item, index) => {
        const initials = item.label.slice(0, 2).toUpperCase();
        return (
          <div key={item.id} className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-4 shrink-0 text-xs tabular-nums text-muted-foreground">
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

function RankListSkeleton({ showAvatar = true }: { showAvatar?: boolean }) {
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
    <div className="flex h-[280px] items-center justify-center rounded-lg border border-dashed">
      <div className="flex flex-col items-center gap-2 text-center">
        <BarChart3 className="size-8 text-muted-foreground/40" />
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
