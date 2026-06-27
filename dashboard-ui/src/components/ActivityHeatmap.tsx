import { useEffect, useMemo, useState } from 'react';
import apiClient from '../api/client';
import { parseTimestamp } from '../utils/datetime';

interface HeatmapDay {
  day: string; // YYYY-MM-DD
  count: number;
}

interface HeatmapResponse {
  days: number;
  data: HeatmapDay[];
}

interface Cell {
  date: Date;
  key: string; // YYYY-MM-DD
  count: number;
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

// 5 intensity levels / quantile steps. index 0 = no activity.
// Explicit hex + alpha so colors render regardless of Tailwind theme tokens.
const LEVEL_RGBA = [
  'rgba(120,120,120,0.16)',
  `rgba(59,165,93,0.30)`,
  `rgba(59,165,93,0.55)`,
  `rgba(59,165,93,0.80)`,
  `rgba(59,165,93,1)`,
];
const HOLLOW = 'rgba(120,120,120,0.16)';

function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function buildGrid(days: number, counts: Map<string, number>): Cell[][] {
  // We want columns of weeks (Sun..Sat). End the grid on today's column,
  // starting from the Sunday of the week (today - days + 1).
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const start = new Date(today);
  start.setDate(start.getDate() - (days - 1));
  // Roll start back to the nearest Sunday (so columns align Mon..Sun or Sun..Sat).
  start.setDate(start.getDate() - start.getDay());

  const columns: Cell[][] = [];
  const cursor = new Date(start);
  while (cursor <= today) {
    const column: Cell[] = [];
    for (let dow = 0; dow < 7; dow++) {
      const date = new Date(cursor);
      date.setDate(date.getDate() + dow);
      const key = toISODate(date);
      const inRange = date <= today;
      column.push({
        date,
        key,
        count: inRange ? counts.get(key) ?? 0 : 0,
      });
    }
    cursor.setDate(cursor.getDate() + 7);
    // Only include the column if any of its days are within the requested window
    // (drop trailing fully-empty columns beyond today).
    columns.push(column);
    if (cursor > today && column.every((c) => c.date > today)) break;
  }
  return columns;
}

function computeLevels(counts: number[]): number[] {
  const positive = counts.filter((c) => c > 0);
  if (positive.length === 0) return [0, 0, 0, 0, 0];
  const sorted = [...positive].sort((a, b) => a - b);
  const pick = (q: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
  return [0, pick(0.25), pick(0.5), pick(0.75), Infinity];
}

function levelFor(count: number, levels: number[]): number {
  if (count <= 0) return 0;
  for (let i = 1; i < levels.length; i++) {
    if (count <= levels[i]) return i;
  }
  return 4;
}

export function ActivityHeatmap({ userId }: { userId: string }) {
  const [days, setDays] = useState(365);
  const [data, setData] = useState<HeatmapDay[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [hover, setHover] = useState<Cell | null>(null);

  useEffect(() => {
    setLoading(true);
    let cancelled = false;
    apiClient
      .get<HeatmapResponse>(`/users/${userId}/activity/heatmap`, {
        params: { days: String(days) },
      })
      .then((res) => {
        if (!cancelled) setData(res.data.data);
      })
      .catch((err) => {
        console.error('Failed to load heatmap', err);
        if (!cancelled) setData([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, days]);

  const grid = useMemo(() => {
    if (!data) return [];
    const counts = new Map<string, number>();
    let max = 0;
    for (const d of data) {
      counts.set(d.day, d.count);
      if (d.count > max) max = d.count;
    }
    return buildGrid(days, counts);
  }, [data, days]);

  const levels = useMemo(
    () => computeLevels((data ?? []).map((d) => d.count)),
    [data],
  );

  const total = useMemo(
    () => (data ?? []).reduce((sum, d) => sum + d.count, 0),
    [data],
  );

  const activeDays = useMemo(
    () => (data ?? []).filter((d) => d.count > 0).length,
    [data],
  );

  const monthLabels = useMemo(() => {
    const labels: { col: number; label: string }[] = [];
    grid.forEach((column, idx) => {
      const first = column[0]?.date;
      if (!first) return;
      // Show month label on the first column where this month appears.
      const prev = idx > 0 ? grid[idx - 1][0]?.date : null;
      if (!prev || prev.getMonth() !== first.getMonth()) {
        labels.push({ col: idx, label: MONTH_LABELS[first.getMonth()] });
      }
    });
    return labels;
  }, [grid]);

  return (
    <div className="bg-card border border-border rounded-xl p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-base font-semibold">Message activity</h3>
          <p className="text-xs text-muted-foreground">
            {loading
              ? 'Loading…'
              : `${total.toLocaleString()} messages in the last ${days} days · ${activeDays} active days`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(() => {
            const options = [90, 180, 365];
            return options.map((opt) => (
              <button
                key={opt}
                onClick={() => setDays(opt)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                  days === opt
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-transparent text-muted-foreground border-border hover:bg-muted hover:text-foreground'
                }`}
              >
                {opt === 365 ? '1Y' : `${opt}d`}
              </button>
            ));
          })()}
        </div>
      </div>

      {loading ? (
        <div className="h-[140px] flex items-center justify-center text-sm text-muted-foreground">
          Building calendar…
        </div>
      ) : grid.length === 0 ? (
        <div className="h-[140px] flex items-center justify-center text-sm text-muted-foreground">
          No activity recorded.
        </div>
      ) : (
        <div className="overflow-x-auto pb-2">
          <div className="inline-flex flex-col gap-1 min-w-max">
            {/* Month labels */}
            <div className="flex gap-1 pl-9">
              {grid.map((_, colIdx) => {
                const label = monthLabels.find((m) => m.col === colIdx);
                return (
                  <div
                    key={colIdx}
                    className="w-[11px] text-[10px] text-muted-foreground whitespace-nowrap"
                    style={{ height: '14px' }}
                  >
                    {label ? (
                      <span className="relative left-[-2px]">{label.label}</span>
                    ) : null}
                  </div>
                );
              })}
            </div>

            {/* Grid + weekday labels */}
            <div className="flex gap-1">
              {/* Weekday labels */}
              <div className="flex flex-col gap-1 pr-1">
                {WEEKDAY_LABELS.map((d, i) => (
                  <div
                    key={d}
                    className="text-[10px] text-muted-foreground flex items-center"
                    style={{ height: '11px' }}
                  >
                    {i % 2 === 0 ? d : ''}
                  </div>
                ))}
              </div>

              {/* Columns */}
              <div className="flex gap-1">
                {grid.map((column, colIdx) => (
                  <div key={colIdx} className="flex flex-col gap-1">
                    {column.map((cell) => {
                      const level = levelFor(cell.count, levels);
                      const isFuture = cell.date > new Date();
                      return (
                        <div
                          key={cell.key}
                          onMouseEnter={() => setHover(cell)}
                          onMouseLeave={() => setHover(null)}
                          className={`rounded-sm ${
                            isFuture ? 'opacity-0' : 'opacity-100'
                          } border border-border/40`}
                          style={{
                            width: '11px',
                            height: '11px',
                            backgroundColor: cell.count > 0 ? LEVEL_RGBA[level] : HOLLOW,
                          }}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            {/* Legend + hover */}
            <div className="flex items-center justify-between mt-2 pl-9">
              <div className="text-[11px] text-muted-foreground">
                {hover && hover.count >= 0 ? (
                  <span>
                    <span className="font-medium text-foreground">
                      {hover.count} messages
                    </span>{' '}
                    on {parseTimestamp(hover.key)?.toLocaleDateString() ?? hover.key}
                  </span>
                ) : (
                  <span>Hover a day for details</span>
                )}
              </div>
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <span>Less</span>
                {LEVEL_RGBA.map((c, i) => (
                  <div
                    key={i}
                    className={`rounded-sm border border-border/40`}
                    style={{ width: '11px', height: '11px', backgroundColor: c }}
                  />
                ))}
                <span>More</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ActivityHeatmap;