import { MessageSquare } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';

interface GuildItem {
  id: string;
  name: string;
  icon?: string | null;
  messageCount: number;
  memberCount: number;
}

interface GuildPickerProps {
  guilds: GuildItem[];
  selected: Set<string>;
  onToggle: (id: string) => void;
}

export function GuildPicker({ guilds, selected, onToggle }: GuildPickerProps) {
  if (guilds.length === 0) {
    return (
      <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-dashed">
        <p className="text-sm text-muted-foreground">No guilds found.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {guilds.map((guild) => {
        const isSelected = selected.has(guild.id);
        const initials = guild.name.slice(0, 2).toUpperCase();

        return (
          <Card
            key={guild.id}
            role="button"
            tabIndex={0}
            onClick={() => onToggle(guild.id)}
            onKeyDown={(e) => e.key === 'Enter' && onToggle(guild.id)}
            className={`cursor-pointer select-none transition-all ${
              isSelected
                ? 'border-sidebar-primary bg-sidebar-primary/5'
                : 'hover:border-muted-foreground/40'
            }`}
          >
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Avatar className="h-12 w-12 rounded-xl shrink-0">
                  {guild.icon ? (
                    <AvatarImage
                      src={guild.icon}
                      alt={guild.name}
                      className="rounded-xl object-cover"
                    />
                  ) : null}
                  <AvatarFallback className="rounded-xl text-xs font-medium">
                    {initials}
                  </AvatarFallback>
                </Avatar>

                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{guild.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {guild.memberCount.toLocaleString()} members
                  </p>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                    <MessageSquare className="size-3 shrink-0" />
                    {guild.messageCount.toLocaleString()} messages
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <span className="text-xs text-muted-foreground font-mono truncate max-w-[120px]">
                  {guild.id}
                </span>

                {/* Visual toggle — interaction is handled by the card click */}
                <div
                  aria-hidden
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                    isSelected ? 'bg-sidebar-primary' : 'bg-input'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                      isSelected ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
