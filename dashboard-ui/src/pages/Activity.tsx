import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Users,
  Mic,
  Radio,
  ShieldAlert,
} from 'lucide-react';
import apiClient from '../api/client';

type ActivityTab = 'members' | 'voice' | 'presence' | 'audit';

interface MemberEvent {
  id: number;
  guildId: string;
  userId: string;
  eventType: string;
  oldValue?: string | null;
  newValue?: string | null;
  createdAt: number;
}

interface VoiceEvent {
  id: number;
  guildId: string;
  userId: string;
  channelId?: string | null;
  eventType: string;
  oldValue?: string | null;
  newValue?: string | null;
  createdAt: number;
}

interface PresenceEvent {
  id: number;
  guildId?: string | null;
  userId: string;
  status?: string | null;
  clientStatus?: string | null;
  updatedAt: number;
}

interface AuditEvent {
  id: number;
  guildId: string;
  actionType: string;
  targetId?: string | null;
  targetType?: string | null;
  userId?: string | null;
  reason?: string | null;
  createdAt: number;
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

  const tabs: { key: ActivityTab; label: string; icon: React.ElementType }[] = [
    { key: 'members', label: 'Members', icon: Users },
    { key: 'voice', label: 'Voice', icon: Mic },
    { key: 'presence', label: 'Presence', icon: Radio },
    { key: 'audit', label: 'Guild Audit', icon: ShieldAlert },
  ];

  const switchTab = (key: ActivityTab) => {
    setSearchParams({ tab: key });
  };

  return (
    <div className="p-6 space-y-4 overflow-y-auto">
      <h1 className="text-2xl font-bold">Activity Explorer</h1>

      <div className="flex gap-2 border-b border-gray-800">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => switchTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? 'border-discord-blurple text-discord-blurple'
                : 'border-transparent text-gray-400 hover:text-gray-100'
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-sm text-gray-500">Loading activity...</div>
      ) : (
        <>
          {tab === 'members' && <MemberTable data={members} />}
          {tab === 'voice' && <VoiceTable data={voice} />}
          {tab === 'presence' && <PresenceTable data={presence} />}
          {tab === 'audit' && <AuditTable data={audit} />}
        </>
      )}
    </div>
  );
}

function MemberTable({ data }: { data: MemberEvent[] }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-850 text-gray-400">
          <tr>
            <th className="text-left px-4 py-2">Event</th>
            <th className="text-left px-4 py-2">User</th>
            <th className="text-left px-4 py-2">Guild</th>
            <th className="text-left px-4 py-2">Time</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800">
          {data.map((row) => (
            <tr key={row.id} className="hover:bg-gray-850 transition-colors">
              <td className="px-4 py-2 font-medium">{row.eventType}</td>
              <td className="px-4 py-2 text-gray-400">{row.userId}</td>
              <td className="px-4 py-2 text-gray-400">{row.guildId}</td>
              <td className="px-4 py-2 text-gray-500 text-xs">
                {new Date(row.createdAt * 1000).toLocaleString()}
              </td>
            </tr>
          ))}
          {data.length === 0 && (
            <tr>
              <td colSpan={4} className="px-4 py-6 text-center text-gray-500">
                No member events found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function VoiceTable({ data }: { data: VoiceEvent[] }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-850 text-gray-400">
          <tr>
            <th className="text-left px-4 py-2">Event</th>
            <th className="text-left px-4 py-2">User</th>
            <th className="text-left px-4 py-2">Channel</th>
            <th className="text-left px-4 py-2">Time</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800">
          {data.map((row) => (
            <tr key={row.id} className="hover:bg-gray-850 transition-colors">
              <td className="px-4 py-2 font-medium">{row.eventType}</td>
              <td className="px-4 py-2 text-gray-400">{row.userId}</td>
              <td className="px-4 py-2 text-gray-400">{row.channelId ?? '-'}</td>
              <td className="px-4 py-2 text-gray-500 text-xs">
                {new Date(row.createdAt * 1000).toLocaleString()}
              </td>
            </tr>
          ))}
          {data.length === 0 && (
            <tr>
              <td colSpan={4} className="px-4 py-6 text-center text-gray-500">
                No voice events found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function PresenceTable({ data }: { data: PresenceEvent[] }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-850 text-gray-400">
          <tr>
            <th className="text-left px-4 py-2">User</th>
            <th className="text-left px-4 py-2">Status</th>
            <th className="text-left px-4 py-2">Clients</th>
            <th className="text-left px-4 py-2">Updated</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800">
          {data.map((row) => (
            <tr key={row.id} className="hover:bg-gray-850 transition-colors">
              <td className="px-4 py-2">{row.userId}</td>
              <td className="px-4 py-2">
                <span className={`inline-block w-2 h-2 rounded-full mr-2 ${statusColor(row.status)}`} />
                {row.status ?? 'offline'}
              </td>
              <td className="px-4 py-2 text-gray-400 text-xs">{row.clientStatus ?? '-'}</td>
              <td className="px-4 py-2 text-gray-500 text-xs">
                {new Date(row.updatedAt * 1000).toLocaleString()}
              </td>
            </tr>
          ))}
          {data.length === 0 && (
            <tr>
              <td colSpan={4} className="px-4 py-6 text-center text-gray-500">
                No presence updates found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function AuditTable({ data }: { data: AuditEvent[] }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-850 text-gray-400">
          <tr>
            <th className="text-left px-4 py-2">Action</th>
            <th className="text-left px-4 py-2">Target</th>
            <th className="text-left px-4 py-2">By</th>
            <th className="text-left px-4 py-2">Time</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800">
          {data.map((row) => (
            <tr key={row.id} className="hover:bg-gray-850 transition-colors">
              <td className="px-4 py-2 font-medium">{row.actionType}</td>
              <td className="px-4 py-2 text-gray-400">{row.targetId ?? '-'}</td>
              <td className="px-4 py-2 text-gray-400">{row.userId ?? '-'}</td>
              <td className="px-4 py-2 text-gray-500 text-xs">
                {new Date(row.createdAt * 1000).toLocaleString()}
              </td>
            </tr>
          ))}
          {data.length === 0 && (
            <tr>
              <td colSpan={4} className="px-4 py-6 text-center text-gray-500">
                No audit events found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function statusColor(status?: string | null) {
  switch (status) {
    case 'online':
      return 'bg-discord-green';
    case 'idle':
      return 'bg-discord-yellow';
    case 'dnd':
      return 'bg-discord-red';
    default:
      return 'bg-gray-600';
  }
}
