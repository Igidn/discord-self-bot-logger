import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Inbox, Mic, Radio, ShieldAlert, Users } from 'lucide-react';
import apiClient from '../api/client';
import { formatDateTime, type TimestampValue } from '../utils/datetime';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type ActivityTab = 'members' | 'voice' | 'presence' | 'audit';

interface MemberEvent {
  id: number;
  guildId: string;
  userId: string;
  eventType: string;
  oldValue?: string | null;
  newValue?: string | null;
  createdAt: TimestampValue;
}

interface VoiceEvent {
  id: number;
  guildId: string;
  userId: string;
  channelId?: string | null;
  eventType: string;
  oldValue?: string | null;
  newValue?: string | null;
  createdAt: TimestampValue;
}

interface PresenceEvent {
  id: number;
  guildId?: string | null;
  userId: string;
  status?: string | null;
  clientStatus?: string | null;
  updatedAt: TimestampValue;
}

interface AuditEvent {
  id: number;
  guildId: string;
  actionType: string;
  targetId?: string | null;
  targetType?: string | null;
  userId?: string | null;
  reason?: string | null;
  createdAt: TimestampValue;
}

export default function Activity() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (searchParams.get('tab') as ActivityTab) || 'members';
  const [members, setMembers] = useState<MemberEvent[]>([]);
  const [voice, setVoice] = useState<VoiceEvent[]>([]);
  const [presence, setPresence] = useState<PresenceEvent[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAll() {
      try {
        const [mRes, vRes, pRes, aRes] = await Promise.all([
          apiClient.get<MemberEvent[]>('/activity/member-events?limit=50').catch(() => ({ data: [] })),
          apiClient.get<VoiceEvent[]>('/activity/voice?limit=50').catch(() => ({ data: [] })),
          apiClient.get<PresenceEvent[]>('/activity/presence?limit=50').catch(() => ({ data: [] })),
          apiClient.get<AuditEvent[]>('/activity/audit?limit=50').catch(() => ({ data: [] })),
        ]);
        setMembers(mRes.data);
        setVoice(vRes.data);
        setPresence(pRes.data);
        setAudit(aRes.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchAll();
  }, []);

  return (
    <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Activity Explorer</h1>
        <p className="text-sm text-muted-foreground">
          Track member joins, voice events, presence updates, and audit actions across guilds.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setSearchParams({ tab: v })}>
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="members" className="gap-1.5 text-sm">
            <Users className="size-3.5" />
            Members
            {!loading && <CountPill count={members.length} />}
          </TabsTrigger>
          <TabsTrigger value="voice" className="gap-1.5 text-sm">
            <Mic className="size-3.5" />
            Voice
            {!loading && <CountPill count={voice.length} />}
          </TabsTrigger>
          <TabsTrigger value="presence" className="gap-1.5 text-sm">
            <Radio className="size-3.5" />
            Presence
            {!loading && <CountPill count={presence.length} />}
          </TabsTrigger>
          <TabsTrigger value="audit" className="gap-1.5 text-sm">
            <ShieldAlert className="size-3.5" />
            Guild Audit
            {!loading && <CountPill count={audit.length} />}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="mt-4">
          <MemberTable data={members} loading={loading} />
        </TabsContent>
        <TabsContent value="voice" className="mt-4">
          <VoiceTable data={voice} loading={loading} />
        </TabsContent>
        <TabsContent value="presence" className="mt-4">
          <PresenceTable data={presence} loading={loading} />
        </TabsContent>
        <TabsContent value="audit" className="mt-4">
          <AuditTable data={audit} loading={loading} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Shared helpers ─────────────────────────────────────────────────────────────

function CountPill({ count }: { count: number }) {
  return (
    <span className="ml-0.5 rounded-full bg-background px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground shadow-sm">
      {count}
    </span>
  );
}

function TableSkeleton({ cols }: { cols: number }) {
  return (
    <div className="space-y-px">
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="flex gap-4 px-4 py-3">
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton key={j} className="h-4 flex-1" style={{ opacity: 1 - i * 0.1 }} />
          ))}
        </div>
      ))}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed text-center">
      <Inbox className="size-8 text-muted-foreground/40" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

function eventVariant(type: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  const lower = type.toLowerCase();
  if (/join|create|add|connect|grant/.test(lower)) return 'default';
  if (/leave|remove|delete|ban|kick|disconnect|prune/.test(lower)) return 'destructive';
  return 'secondary';
}

function StatusDot({ status }: { status?: string | null }) {
  const colorMap: Record<string, string> = {
    online: 'bg-emerald-500',
    idle: 'bg-amber-500',
    dnd: 'bg-red-500',
  };
  const color = colorMap[status ?? ''] ?? 'bg-muted-foreground/40';
  return <span className={`inline-block size-2 shrink-0 rounded-full ${color}`} />;
}

// ─── Table panels ───────────────────────────────────────────────────────────────

function MemberTable({ data, loading }: { data: MemberEvent[]; loading: boolean }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Member Events</CardTitle>
        <CardDescription>Join, leave, role, and nickname changes.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <TableSkeleton cols={4} />
        ) : data.length === 0 ? (
          <div className="px-6 pb-6">
            <EmptyState message="No member events found." />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Event</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Guild</TableHead>
                <TableHead className="text-right">Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Badge variant={eventVariant(row.eventType)} className="text-xs font-medium">
                      {row.eventType}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {row.userId}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {row.guildId}
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                    {formatDateTime(row.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function VoiceTable({ data, loading }: { data: VoiceEvent[]; loading: boolean }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Voice Events</CardTitle>
        <CardDescription>Channel joins, leaves, and state changes.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <TableSkeleton cols={4} />
        ) : data.length === 0 ? (
          <div className="px-6 pb-6">
            <EmptyState message="No voice events found." />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Event</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead className="text-right">Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Badge variant={eventVariant(row.eventType)} className="text-xs font-medium">
                      {row.eventType}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {row.userId}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {row.channelId ?? <span className="text-muted-foreground/40">—</span>}
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                    {formatDateTime(row.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function PresenceTable({ data, loading }: { data: PresenceEvent[]; loading: boolean }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Presence Updates</CardTitle>
        <CardDescription>Online status and client state changes.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <TableSkeleton cols={4} />
        ) : data.length === 0 ? (
          <div className="px-6 pb-6">
            <EmptyState message="No presence updates found." />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Clients</TableHead>
                <TableHead className="text-right">Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {row.userId}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <StatusDot status={row.status} />
                      <span className="text-sm capitalize">{row.status ?? 'offline'}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {row.clientStatus ?? <span className="text-muted-foreground/40">—</span>}
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                    {formatDateTime(row.updatedAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function AuditTable({ data, loading }: { data: AuditEvent[]; loading: boolean }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Guild Audit Log</CardTitle>
        <CardDescription>Administrative actions and permission changes.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <TableSkeleton cols={4} />
        ) : data.length === 0 ? (
          <div className="px-6 pb-6">
            <EmptyState message="No audit events found." />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Action</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>By</TableHead>
                <TableHead className="text-right">Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Badge variant={eventVariant(row.actionType)} className="text-xs font-medium">
                      {row.actionType}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {row.targetId ?? <span className="text-muted-foreground/40">—</span>}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {row.userId ?? <span className="text-muted-foreground/40">—</span>}
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                    {formatDateTime(row.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
