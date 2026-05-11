import { useEffect, useState } from 'react';
import {
  Download,
  Trash2,
  AlertTriangle,
  RotateCcw,
  Database,
  Clock,
} from 'lucide-react';
import apiClient from '../api/client';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';

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

  return (
    <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-6 max-w-3xl">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your logger configuration, data export, and retention policies.
        </p>
      </div>

      {/* Configuration */}
      <Card>
        <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-4">
          <div className="rounded-md bg-muted p-2">
            <Database className="size-4 text-muted-foreground" />
          </div>
          <div>
            <CardTitle className="text-base">Configuration</CardTitle>
            <CardDescription>Current runtime settings (read-only)</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {loading ? (
            <div className="space-y-1">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between py-2.5">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-24" />
                </div>
              ))}
            </div>
          ) : (
            <div>
              <ConfigRow label="Dashboard Host" value={config?.dashboard?.host ?? '127.0.0.1'} />
              <Separator />
              <ConfigRow label="Dashboard Port" value={String(config?.dashboard?.port ?? 3333)} />
              <Separator />
              <ConfigRow
                label="Database Path"
                value={config?.database?.path ?? './storage/logs.db'}
                mono
              />
              <Separator />
              <ConfigRow
                label="WAL Mode"
                value={config?.database?.wal ? 'Enabled' : 'Disabled'}
                badge={{ variant: config?.database?.wal ? 'default' : 'secondary' }}
              />
              <Separator />
              <ConfigRow
                label="Logged Guilds"
                value={String(config?.logging?.guilds?.length ?? 0)}
              />
              <Separator />
              <ConfigRow
                label="DM Logging"
                value={config?.logging?.logDirectMessages ? 'Enabled' : 'Disabled'}
                badge={{
                  variant: config?.logging?.logDirectMessages ? 'default' : 'secondary',
                }}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Retention */}
      <Card>
        <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-4">
          <div className="rounded-md bg-muted p-2">
            <Clock className="size-4 text-muted-foreground" />
          </div>
          <div>
            <CardTitle className="text-base">Retention</CardTitle>
            <CardDescription>Message storage and cleanup policy</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-2">
          {loading ? (
            <Skeleton className="h-4 w-32" />
          ) : (
            <>
              <ConfigRow
                label="Retention Days"
                value={String(config?.logging?.retentionDays ?? 365)}
              />
              <p className="text-xs text-muted-foreground pt-1">
                Messages older than the retention period are automatically purged during the daily
                cleanup cycle.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* Export */}
      <Card>
        <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-4">
          <div className="rounded-md bg-muted p-2">
            <Download className="size-4 text-muted-foreground" />
          </div>
          <div>
            <CardTitle className="text-base">Export</CardTitle>
            <CardDescription>Download your logged message data</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-4">
          <div className="flex items-center gap-3">
            <select
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value as 'jsonl' | 'csv' | 'html')}
              className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="jsonl">JSONL</option>
              <option value="csv">CSV</option>
              <option value="html">HTML</option>
            </select>
            <Button onClick={handleExport} size="sm" className="gap-2">
              <Download className="size-4" />
              Start Export
            </Button>
          </div>
          {exportJobId && (
            <div className="rounded-md bg-emerald-500/10 border border-emerald-500/20 px-3 py-2">
              <p className="text-xs text-emerald-600 dark:text-emerald-400">
                Export job started:{' '}
                <code className="font-mono bg-emerald-500/10 px-1 py-0.5 rounded">
                  {exportJobId}
                </code>
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-destructive/30">
        <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-4">
          <div className="rounded-md bg-destructive/10 p-2">
            <AlertTriangle className="size-4 text-destructive" />
          </div>
          <div>
            <CardTitle className="text-base text-destructive">Danger Zone</CardTitle>
            <CardDescription>Irreversible actions — proceed with caution</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Purge Old Data</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Permanently delete messages older than the retention threshold.
              </p>
            </div>
            <Button
              onClick={handlePurge}
              variant={purgeConfirm ? 'destructive' : 'outline'}
              size="sm"
              className="gap-2 shrink-0"
            >
              <Trash2 className="size-4" />
              {purgeConfirm ? 'Confirm Purge' : 'Purge'}
            </Button>
          </div>
          {purgeConfirm && (
            <div className="flex items-center gap-1.5 text-xs text-destructive">
              <RotateCcw className="size-3 shrink-0" />
              Click again to confirm. This action cannot be undone.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────────

function ConfigRow({
  label,
  value,
  mono,
  badge,
}: {
  label: string;
  value: string;
  mono?: boolean;
  badge?: { variant: 'default' | 'secondary' | 'destructive' | 'outline' };
}) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      {badge ? (
        <Badge variant={badge.variant} className="text-xs">
          {value}
        </Badge>
      ) : (
        <span className={`text-sm font-medium ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
      )}
    </div>
  );
}
