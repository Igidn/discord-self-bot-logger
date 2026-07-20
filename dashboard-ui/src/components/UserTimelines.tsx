import { useEffect, useState } from 'react';
import {
  UserCog,
  Mic,
  Circle,
  Clock,
  ChevronRight,
} from 'lucide-react';
import apiClient from '../api/client';
import { formatRelativeTime, timestampMs, type TimestampValue } from '../utils/datetime';

/* ------------------------------- types ------------------------------- */

interface MemberEvent {
  id: number;
  guildId: string;
  eventType: string;
  oldValue?: string | null;
  newValue?: string | null;
  createdAt?: TimestampValue;
  guildName?: string | null;
}

interface VoiceEvent {
  id: number;
  guildId: string;
  channelId?: string | null;
  eventType: string;
  oldValue?: string | null;
  newValue?: string | null;
  createdAt?: TimestampValue;
  guildName?: string | null;
  channelName?: string | null;
}

interface PresenceRow {
  id?: number;
  guildId?: string | null;
  status?: string | null;
  clientStatus?: string | null;
  activitiesJson?: string | null;
  updatedAt?: TimestampValue;
  guildName?: string | null;
}

interface MemberResponse { data: MemberEvent[] }
interface VoiceResponse { data: VoiceEvent[] }
interface PresenceResponse { latest: PresenceRow[] }

/* ----------------------------- helpers ------------------------------- */

// Explicit hex (not theme tokens) so colors render regardless of Tailwind config.
const STATUS_COLOR: Record<string, string> = {
  online: '#43b581',
  idle: '#faa61a',
  dnd: '#f04747',
  offline: '#747f8d',
};

function statusDotClass(status?: string | null) {
  return STATUS_COLOR[status ?? 'offline'] ?? '#747f8d';
}

function statusDot(status?: string | null) {
  return (
    <Circle
      className="w-2.5 h-2.5 fill-current"
      style={{ color: statusDotClass(status) }}
    />
  );
}

function parseActivities(json?: string | null): string[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr)
      ? (arr.map((a: { name?: string }) => a.name).filter((n): n is string => Boolean(n)))
      : [];
  } catch {
    return [];
  }
}

/** Sum of JOIN→LEAVE intervals from a voice event stream (ms). ponytail: O(n) greedy pairing. */
function totalVoiceMs(events: VoiceEvent[]): number {
  let total = 0;
  let joinTs: number | null = null;
  // oldest → newest; events arrive newest-first, so iterate in reverse
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    const ts = timestampMs(e.createdAt);
    if (e.eventType === 'JOIN' || e.eventType === 'MOVE') {
      joinTs = ts;
    } else if (e.eventType === 'LEAVE') {
      if (joinTs != null) total += Math.max(0, ts - joinTs);
      joinTs = null;
    }
  }
  return total;
}

function formatDuration(ms: number): string {
  if (ms <= 0) return '-';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

const MEMBER_LABEL: Record<string, string> = {
  JOIN: 'Joined',
  LEAVE: 'Left',
  BAN: 'Banned',
  UNBAN: 'Unbanned',
  NICK_CHANGE: 'Nickname changed',
  UPDATE: 'Updated',
};

const VOICE_LABEL: Record<string, string> = {
  JOIN: 'Joined',
  LEAVE: 'Left',
  MOVE: 'Moved',
  MUTE: 'Mute',
  DEAF: 'Deafen',
  STREAM: 'Stream',
  VIDEO: 'Video',
};

/* --------------------------- component ------------------------------- */

export function UserTimelines({ userId }: { userId: string }) {
  const [member, setMember] = useState<MemberEvent[]>([]);
  const [voice, setVoice] = useState<VoiceEvent[]>([]);
  const [presence, setPresence] = useState<PresenceResponse>({ latest: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    async function run() {
      try {
        const limit = '100';
        const [m, v, p] = await Promise.all([
          apiClient.get<MemberResponse>(`/users/${userId}/member-events`, { params: { limit } }),
          apiClient.get<VoiceResponse>(`/users/${userId}/voice-events`, { params: { limit } }),
          apiClient.get<PresenceResponse>(`/users/${userId}/presence`, { params: { limit } }),
        ]);
        if (cancelled) return;
        setMember(m.data.data);
        setVoice(v.data.data);
        setPresence(p.data);
      } catch (err) {
        console.error('Failed to load timelines', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => { cancelled = true; };
  }, [userId]);

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading timelines...</div>;
  }

  const voiceTotal = totalVoiceMs(voice);

  return (
    <div className="space-y-6">
      {/* Presence — current status */}
      <TimelineSection icon={Circle} title="Presence" accent="#43b581">
        {presence.latest.length === 0 ? (
          <Empty text="No presence recorded" />
        ) : (
          <ul className="space-y-2">
            {/* latest is ordered by updatedAt desc; first row = most recent global status */}
            {(() => {
              const p = presence.latest[0];
              const activities = parseActivities(p.activitiesJson);
              return (
                <li className="text-sm">
                  <div className="flex items-center gap-2">
                    {statusDot(p.status)}
                    <span className="font-medium capitalize">{p.status ?? 'unknown'}</span>
                  </div>
                  {activities.length > 0 && (
                    <div className="text-xs text-muted-foreground/80 mt-0.5 pl-[18px]">
                      {activities.join(', ')}
                    </div>
                  )}
                  <div className="text-[11px] text-muted-foreground/60 pl-[18px]">
                    {formatRelativeTime(p.updatedAt)}
                  </div>
                </li>
              );
            })()}
          </ul>
        )}
      </TimelineSection>

      {/* Member events */}
      <TimelineSection icon={UserCog} title="Member Events" accent="#5865f2" scrollable>
        {member.length === 0 ? (
          <Empty text="No member events" />
        ) : (
          <Timeline>
            {member.map((e) => (
              <TimelineItem
                key={e.id}
                label={MEMBER_LABEL[e.eventType] ?? e.eventType}
                meta={
                  e.eventType === 'NICK_CHANGE'
                    ? `${e.oldValue ?? '∅'} → ${e.newValue ?? '∅'}`
                    : e.newValue ?? undefined
                }
                guild={e.guildName ?? undefined}
                time={e.createdAt}
              />
            ))}
          </Timeline>
        )}
      </TimelineSection>

      {/* Voice activity */}
      <TimelineSection
        icon={Mic}
        title="Voice Activity"
        accent="#eb459e"
        scrollable
        extra={
          voiceTotal > 0 ? (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              {formatDuration(voiceTotal)} in voice
            </span>
          ) : null
        }
      >
        {voice.length === 0 ? (
          <Empty text="No voice activity" />
        ) : (
          <Timeline>
            {voice.map((e) => (
              <TimelineItem
                key={e.id}
                label={VOICE_LABEL[e.eventType] ?? e.eventType}
                meta={
                  e.eventType === 'MOVE'
                    ? `${e.oldValue ?? '∅'} → ${e.newValue ?? '∅'}`
                    : e.channelName ?? e.newValue ?? undefined
                }
                guild={e.guildName ?? undefined}
                time={e.createdAt}
              />
            ))}
          </Timeline>
        )}
      </TimelineSection>
    </div>
  );
}

/* --------------------------- small parts ----------------------------- */

function TimelineSection({
  icon: Icon,
  title,
  accent,
  extra,
  scrollable,
  children,
}: {
  icon: React.ElementType;
  title: string;
  accent: string;
  extra?: React.ReactNode;
  scrollable?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4" style={{ color: accent }} />
          <h3 className="text-sm font-semibold">{title}</h3>
        </div>
        {extra}
      </div>
      {scrollable ? (
        <div className="max-h-72 overflow-y-auto pr-1">{children}</div>
      ) : (
        children
      )}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="text-xs text-muted-foreground">{text}</div>;
}

function Timeline({ children }: { children: React.ReactNode }) {
  return <ul className="space-y-2.5 relative">{children}</ul>;
}

function TimelineItem({
  label,
  meta,
  guild,
  time,
}: {
  label: string;
  meta?: string;
  guild?: string;
  time?: TimestampValue;
}) {
  return (
    <li className="relative pl-4 text-sm">
      {/* dot + line */}
      <span className="absolute left-0 top-1.5 w-1.5 h-1.5 rounded-full bg-muted-foreground/50" />
      <span className="absolute left-[2.5px] top-3 bottom-[-10px] w-px bg-border" />
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium">{label}</span>
        {time && (
          <span className="text-[11px] text-muted-foreground/60 shrink-0">
            {formatRelativeTime(time)}
          </span>
        )}
      </div>
      {(meta || guild) && (
        <div className="text-xs text-muted-foreground">
          {meta}
          {meta && guild ? ' · ' : ''}
          {guild && <span className="text-muted-foreground/70">{guild}</span>}
        </div>
      )}
    </li>
  );
}
