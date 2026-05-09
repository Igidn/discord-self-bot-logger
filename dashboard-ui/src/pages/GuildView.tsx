import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  MessageSquare,
  Hash,
  ArrowLeft,
  Volume2,
  Radio,
} from 'lucide-react';
import apiClient from '../api/client';
import { useGuildSocket } from '../socket/hooks';

interface ChannelItem {
  id: string;
  name: string;
  type: number;
  messageCount: number;
}

interface GuildDetail {
  id: string;
  name: string;
  icon?: string | null;
  messageCount: number;
  memberCount: number;
}

export default function GuildView() {
  const { id } = useParams<{ id: string }>();
  const [guild, setGuild] = useState<GuildDetail | null>(null);
  const [channels, setChannels] = useState<ChannelItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { events } = useGuildSocket(id);

  useEffect(() => {
    if (!id) return;
    async function fetchData() {
      try {
        const [gRes, cRes] = await Promise.all([
          apiClient.get<GuildDetail>(`/guilds/${id}`).catch(() => null),
          apiClient.get<ChannelItem[]>(`/guilds/${id}/channels`),
        ]);
        if (gRes) setGuild(gRes.data);
        setChannels(cRes.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [id]);

  const textChannels = channels.filter((c) => c.type === 0);
  const voiceChannels = channels.filter((c) => c.type === 2);

  return (
    <div className="p-6 space-y-6 overflow-y-auto">
      <div className="flex items-center gap-3">
        <Link
          to="/"
          className="p-2 rounded-lg bg-gray-900 border border-gray-800 hover:bg-gray-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">{guild?.name ?? 'Guild'}</h1>
          <p className="text-sm text-gray-400">
            {guild?.messageCount ?? 0} messages · {guild?.memberCount ?? 0} members
          </p>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-gray-500">Loading channels...</div>
      ) : (
        <>
          <div className="bg-gray-900 border border-gray-800 rounded-xl">
            <div className="p-4 border-b border-gray-800 flex items-center gap-2">
              <Hash className="w-4 h-4 text-discord-blurple" />
              <h2 className="font-semibold">Text Channels</h2>
              <span className="ml-auto text-xs text-gray-500">{textChannels.length}</span>
            </div>
            <div className="divide-y divide-gray-800">
              {textChannels.map((ch) => (
                <Link
                  key={ch.id}
                  to={`/guilds/${id}/channels/${ch.id}`}
                  className="flex items-center justify-between p-4 hover:bg-gray-850 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <MessageSquare className="w-4 h-4 text-gray-500" />
                    <span className="text-sm font-medium">{ch.name}</span>
                  </div>
                  <span className="text-xs text-gray-500">{ch.messageCount} msgs</span>
                </Link>
              ))}
              {textChannels.length === 0 && (
                <div className="p-4 text-sm text-gray-500">No text channels found.</div>
              )}
            </div>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl">
            <div className="p-4 border-b border-gray-800 flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-discord-fuchsia" />
              <h2 className="font-semibold">Voice Channels</h2>
              <span className="ml-auto text-xs text-gray-500">{voiceChannels.length}</span>
            </div>
            <div className="divide-y divide-gray-800">
              {voiceChannels.map((ch) => (
                <div
                  key={ch.id}
                  className="flex items-center justify-between p-4 text-gray-400"
                >
                  <div className="flex items-center gap-3">
                    <Radio className="w-4 h-4" />
                    <span className="text-sm font-medium">{ch.name}</span>
                  </div>
                  <span className="text-xs text-gray-500">{ch.messageCount} msgs</span>
                </div>
              ))}
              {voiceChannels.length === 0 && (
                <div className="p-4 text-sm text-gray-500">No voice channels found.</div>
              )}
            </div>
          </div>

          {events.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl">
              <div className="p-4 border-b border-gray-800">
                <h2 className="font-semibold">Live Activity</h2>
              </div>
              <div className="max-h-64 overflow-y-auto p-2 space-y-1">
                {events.slice(0, 20).map((ev, i) => (
                  <div key={i} className="text-xs text-gray-400 px-2 py-1 rounded bg-gray-850">
                    <span className="text-discord-blurple font-medium">{ev.type}</span>{' '}
                    {JSON.stringify(ev.payload).slice(0, 120)}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
