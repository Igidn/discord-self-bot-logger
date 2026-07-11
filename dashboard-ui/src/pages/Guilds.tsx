import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, MessageSquare, Server } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import apiClient from '../api/client';

interface GuildItem {
  id: string;
  name: string;
  icon?: string | null;
  messageCount: number;
  memberCount: number;
}

export default function Guilds() {
  const [guilds, setGuilds] = useState<GuildItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient
      .get<GuildItem[]>('/guilds')
      .then((res) => setGuilds(res.data))
      .catch(() => setGuilds([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Guilds</h1>
        <p className="text-sm text-muted-foreground">
          Per-guild dashboards for every tracked server.
        </p>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : guilds.length === 0 ? (
        <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-dashed">
          <p className="text-sm text-muted-foreground">No guilds tracked yet.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {guilds.map((guild) => {
            const initials = guild.name.slice(0, 2).toUpperCase();
            return (
              <Link key={guild.id} to={`/guilds/${guild.id}`}>
                <Card className="cursor-pointer transition-all hover:border-muted-foreground/40">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <Avatar className="h-12 w-12 rounded-xl shrink-0">
                        {guild.icon ? (
                          <AvatarImage src={guild.icon} alt={guild.name} className="rounded-xl object-cover" />
                        ) : null}
                        <AvatarFallback className="rounded-xl text-xs font-medium">{initials}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <p className="font-semibold text-sm truncate">{guild.name}</p>
                          <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground" />
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{guild.memberCount.toLocaleString()} members</p>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                          <MessageSquare className="size-3 shrink-0" />
                          {guild.messageCount.toLocaleString()} messages
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      {/* ponytail: empty-server hint — keeps the index from looking broken when
          nothing is tracked yet. Remove if a global empty state is added. */}
      {loading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Server className="size-3.5" />
          Loading guilds…
        </div>
      )}
    </div>
  );
}