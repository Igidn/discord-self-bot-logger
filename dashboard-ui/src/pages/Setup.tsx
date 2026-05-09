import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Save, MonitorCog } from 'lucide-react';
import apiClient from '../api/client';
import { GuildPicker } from '../components/GuildPicker';

interface GuildItem {
  id: string;
  name: string;
  icon?: string | null;
  messageCount: number;
  memberCount: number;
}

export default function Setup() {
  const navigate = useNavigate();
  const [guilds, setGuilds] = useState<GuildItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function fetchGuilds() {
      try {
        const res = await apiClient.get<GuildItem[]>('/guilds');
        setGuilds(res.data);
        const configRes = await apiClient.get<{ logging?: { guilds?: string[] } }>('/config');
        const active = new Set(configRes.data.logging?.guilds ?? []);
        setSelected(active);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchGuilds();
  }, []);

  const toggleGuild = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiClient.post('/config/guilds', { guildIds: Array.from(selected) });
      setSaved(true);
      setTimeout(() => navigate('/'), 800);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-6 overflow-y-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MonitorCog className="w-6 h-6 text-discord-blurple" />
            Guild Setup
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Select which guilds to monitor. Only selected guilds will be logged.
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 bg-discord-blurple hover:bg-discord-blurple/90 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Selection'}
        </button>
      </div>

      {saved && (
        <div className="bg-discord-green/10 border border-discord-green/30 rounded-lg p-3 text-sm text-discord-green">
          Configuration saved. Redirecting to overview...
        </div>
      )}

      {loading ? (
        <div className="text-sm text-gray-500">Loading guilds...</div>
      ) : (
        <GuildPicker guilds={guilds} selected={selected} onToggle={toggleGuild} />
      )}
    </div>
  );
}
