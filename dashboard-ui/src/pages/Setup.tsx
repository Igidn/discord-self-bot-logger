import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Save, CheckCircle2, Plus, X } from 'lucide-react';
import apiClient from '../api/client';
import { GuildPicker } from '../components/GuildPicker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';

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

  // Manual guild ID input
  const [manualInput, setManualInput] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);

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

  const manualIds = Array.from(selected).filter(
    (id) => !guilds.some((g) => g.id === id)
  );

  const addManualId = () => {
    const trimmed = manualInput.trim();
    if (!trimmed) {
      setManualError('Please enter a guild ID');
      return;
    }
    if (selected.has(trimmed)) {
      setManualError('This guild ID is already in the whitelist');
      return;
    }
    // Basic Discord snowflake validation (17-20 digits)
    if (!/^\d{17,20}$/.test(trimmed)) {
      setManualError('Invalid guild ID format (expected 17-20 digits)');
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      next.add(trimmed);
      return next;
    });
    setManualInput('');
    setManualError(null);
    setSaved(false);
  };

  const removeManualId = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
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
    <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Guild Setup</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Select which guilds to monitor. Only selected guilds will be logged.
          </p>
        </div>
        <Button
          onClick={handleSave}
          disabled={saving}
          size="sm"
          className="gap-2 shrink-0"
        >
          <Save className="size-4" />
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Selection'}
        </Button>
      </div>

      {/* Success banner */}
      {saved && (
        <div className="flex items-center gap-2 rounded-md bg-emerald-500/10 border border-emerald-500/20 px-4 py-3">
          <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
          <p className="text-sm text-emerald-600 dark:text-emerald-400">
            Configuration saved. Redirecting to overview...
          </p>
        </div>
      )}

      {/* Manual guild ID input */}
      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Add Guild by ID</h2>
        <div className="flex items-center gap-3">
          <Input
            placeholder="Enter Discord guild ID..."
            value={manualInput}
            onChange={(e) => {
              setManualInput(e.target.value);
              setManualError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addManualId();
              }
            }}
            className="max-w-sm"
          />
          <Button onClick={addManualId} size="sm" className="gap-1.5">
            <Plus className="size-4" />
            Add to whitelist
          </Button>
        </div>
        {manualError && (
          <p className="text-xs text-destructive">{manualError}</p>
        )}
        {manualIds.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {manualIds.map((id) => (
              <div
                key={id}
                className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1 text-xs font-mono"
              >
                {id}
                <button
                  onClick={() => removeManualId(id)}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                  aria-label={`Remove ${id}`}
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Guild picker grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      ) : (
        <GuildPicker guilds={guilds} selected={selected} onToggle={toggleGuild} />
      )}
    </div>
  );
}
