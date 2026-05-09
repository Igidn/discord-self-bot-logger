import { Search, Zap, Filter } from 'lucide-react';
import type { FilterGroup } from './FilterBuilder';

interface SearchBarProps {
  value: string;
  onChange: (val: string) => void;
  onSubmit: () => void;
  liveEnabled: boolean;
  onToggleLive: () => void;
  onOpenFilters: () => void;
  filters: FilterGroup | null;
  onRemoveFilter: (path: number[]) => void;
}

export function SearchBar({
  value,
  onChange,
  onSubmit,
  liveEnabled,
  onToggleLive,
  onOpenFilters,
}: SearchBarProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSubmit();
            }}
            placeholder="Search messages..."
            className="w-full bg-gray-900 border border-gray-800 rounded-lg pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-discord-blurple placeholder:text-gray-600"
          />
        </div>
        <button
          onClick={onOpenFilters}
          className="p-2.5 rounded-lg bg-gray-900 border border-gray-800 hover:bg-gray-800 transition-colors"
          title="Filters"
        >
          <Filter className="w-4 h-4 text-gray-400" />
        </button>
        <button
          onClick={onToggleLive}
          className={`p-2.5 rounded-lg border transition-colors ${
            liveEnabled
              ? 'bg-discord-green/10 border-discord-green/30 text-discord-green'
              : 'bg-gray-900 border-gray-800 text-gray-400 hover:bg-gray-800'
          }`}
          title="Live search"
        >
          <Zap className={`w-4 h-4 ${liveEnabled ? 'fill-current' : ''}`} />
        </button>
      </div>
    </div>
  );
}
