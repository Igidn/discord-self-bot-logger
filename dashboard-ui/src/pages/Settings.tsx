import { useEffect, useState } from 'react';
import {
  Settings as SettingsIcon,
  Download,
  Trash2,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import apiClient from '../api/client';

interface ConfigData {
  logging?: {
    guilds?: string[];
    logDirectMessages?: boolean;
    events?: Record<string, boolean>;
    retentionDays?: number;
  };
  dashboard?: {
    host?: string;
    port?: number;
  };
  database?: {
    path?: string;
    wal?: boolean;
  };
}

export default function Settings() {
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [loading, setLoading] = useState(true);
  const [purgeConfirm, setPurgeConfirm] = useState(false);
  const [exportFormat, setExportFormat] = useState<'jsonl' | 'csv' | 'html'>('jsonl');
  const [exportJobId, setExportJobId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchConfig() {
      try {
        const res = await apiClient.get<ConfigData>('/config');
        setConfig(res.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchConfig();
  }, []);

  const handleExport = async () => {
    try {
      const res = await apiClient.post<{ jobId: string }>(`/export/messages?format=${exportFormat}`);
      setExportJobId(res.data.jobId);
    } catch (err) {
      console.error(err);
    }
  };

  const handlePurge = async () => {
    if (!purgeConfirm) {
      setPurgeConfirm(true);
      return;
    }
    try {
      await apiClient.delete('/purge');
      setPurgeConfirm(false);
      alert('Purge completed.');
    } catch (err) {
      console.error(err);
      alert('Purge failed.');
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-sm text-gray-500">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 overflow-y-auto max-w-3xl">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <SettingsIcon className="w-6 h-6 text-discord-blurple" />
        Settings
      </h1>

      {/* Config Display */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl">
        <div className="p-4 border-b border-gray-800">
          <h2 className="font-semibold">Configuration</h2>
        </div>
        <div className="p-4 space-y-4">
          <ConfigRow label="Dashboard Host" value={config?.dashboard?.host ?? '127.0.0.1'} />
          <ConfigRow label="Dashboard Port" value={String(config?.dashboard?.port ?? 3333)} />
          <ConfigRow label="Database Path" value={config?.database?.path ?? './storage/logs.db'} />
          <ConfigRow label="WAL Mode" value={config?.database?.wal ? 'Enabled' : 'Disabled'} />
          <ConfigRow
            label="Logged Guilds"
            value={String(config?.logging?.guilds?.length ?? 0)}
          />
          <ConfigRow
            label="DM Logging"
            value={config?.logging?.logDirectMessages ? 'Enabled' : 'Disabled'}
          />
        </div>
      </div>

      {/* Retention */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl">
        <div className="p-4 border-b border-gray-800">
          <h2 className="font-semibold">Retention</h2>
        </div>
        <div className="p-4 space-y-4">
          <ConfigRow
            label="Retention Days"
            value={String(config?.logging?.retentionDays ?? 365)}
          />
          <p className="text-xs text-gray-500">
            Messages older than the retention period are automatically purged during the daily cleanup cycle.
          </p>
        </div>
      </div>

      {/* Export */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl">
        <div className="p-4 border-b border-gray-800">
          <h2 className="font-semibold">Export</h2>
        </div>
        <div className="p-4 space-y-4">
          <div className="flex items-center gap-3">
            <select
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value as 'jsonl' | 'csv' | 'html')}
              className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-discord-blurple"
            >
              <option value="jsonl">JSONL</option>
              <option value="csv">CSV</option>
              <option value="html">HTML</option>
            </select>
            <button
              onClick={handleExport}
              className="inline-flex items-center gap-2 px-4 py-2 bg-discord-blurple hover:bg-discord-blurple/90 rounded-lg text-sm font-medium transition-colors"
            >
              <Download className="w-4 h-4" />
              Start Export
            </button>
          </div>
          {exportJobId && (
            <div className="text-xs text-discord-green">
              Export job started: <code className="bg-gray-950 px-1 py-0.5 rounded">{exportJobId}</code>
            </div>
          )}
        </div>
      </div>

      {/* Danger Zone */}
      <div className="bg-discord-red/5 border border-discord-red/20 rounded-xl">
        <div className="p-4 border-b border-discord-red/20">
          <h2 className="font-semibold text-discord-red flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Danger Zone
          </h2>
        </div>
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Purge Old Data</div>
              <div className="text-xs text-gray-500">
                Permanently delete messages older than the retention threshold.
              </div>
            </div>
            <button
              onClick={handlePurge}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                purgeConfirm
                  ? 'bg-discord-red text-white hover:bg-discord-red/90'
                  : 'bg-gray-800 hover:bg-gray-700'
              }`}
            >
              <Trash2 className="w-4 h-4" />
              {purgeConfirm ? 'Confirm Purge' : 'Purge'}
            </button>
          </div>
          {purgeConfirm && (
            <div className="text-xs text-discord-red flex items-center gap-1">
              <RotateCcw className="w-3 h-3" />
              Click again to confirm. This action cannot be undone.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ConfigRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-400">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}
