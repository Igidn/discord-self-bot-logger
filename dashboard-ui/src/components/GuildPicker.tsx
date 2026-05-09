import { Server, MessageSquare } from 'lucide-react';

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
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {guilds.map((guild) => {
        const isSelected = selected.has(guild.id);
        return (
          <div
            key={guild.id}
            className={`relative rounded-xl border p-4 transition-all ${
              isSelected
                ? 'border-discord-blurple bg-discord-blurple/5'
                : 'border-gray-800 bg-gray-900 hover:border-gray-700'
            }`}
          >
            <div className="flex items-start gap-3">
              {guild.icon ? (
                <img
                  src={guild.icon}
                  alt={guild.name}
                  className="w-12 h-12 rounded-xl object-cover"
                />
              ) : (
                <div className="w-12 h-12 rounded-xl bg-discord-blurple/20 flex items-center justify-center">
                  <Server className="w-6 h-6 text-discord-blurple" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm truncate">{guild.name}</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {guild.memberCount.toLocaleString()} members
                </div>
                <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                  <MessageSquare className="w-3 h-3" />
                  {guild.messageCount.toLocaleString()} messages
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <span className="text-xs text-gray-500">{guild.id}</span>
              <button
                onClick={() => onToggle(guild.id)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  isSelected ? 'bg-discord-blurple' : 'bg-gray-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    isSelected ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
