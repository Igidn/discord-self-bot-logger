import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Search as SearchIcon, Zap, X } from 'lucide-react';
import apiClient from '../api/client';
import { useLiveSearch } from '../socket/hooks';
import { SearchBar } from '../components/SearchBar';
import { FilterBuilder } from '../components/FilterBuilder';
import { MessageCard } from '../components/MessageCard';
import type { FilterGroup } from '../components/FilterBuilder';

interface SearchResult {
  id: string;
  guildId?: string | null;
  channelId: string;
  authorId: string;
  content?: string | null;
  createdAt: number;
  editedAt?: number | null;
  deletedAt?: number | null;
  replyToId?: string | null;
  stickerIds?: string | null;
  stickerLinks?: string | null;
  embedsJson?: string | null;
  componentsJson?: string | null;
  flags?: number;
  author?: {
    id: string;
    username: string;
    avatarUrl?: string | null;
  } | null;
  highlights?: string[];
}

export default function Search() {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<FilterGroup | null>(null);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [liveEnabled, setLiveEnabled] = useState(false);
  const [showFilterBuilder, setShowFilterBuilder] = useState(false);

  const liveMatches = useLiveSearch({ q: liveEnabled ? query : undefined, filters: filters ?? undefined });

  const executeSearch = useCallback(
    async (q: string, f: FilterGroup | null, afterCursor?: string | null) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (q) params.set('q', q);
        if (f) params.set('filters', JSON.stringify(f));
        params.set('limit', '25');
        if (afterCursor) params.set('cursor', afterCursor);
        const res = await apiClient.get<{ data: SearchResult[]; nextCursor: string | null }>(
          `/search?${params.toString()}`
        );
        if (!afterCursor) {
          setResults(res.data.data);
        } else {
          setResults((prev) => [...prev, ...res.data.data]);
        }
        setCursor(res.data.nextCursor);
        setHasMore(!!res.data.nextCursor);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const onSearch = useCallback(() => {
    executeSearch(query, filters, null);
  }, [query, filters, executeSearch]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (query || filters) {
        executeSearch(query, filters, null);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query, filters]);

  // Merge live matches
  useEffect(() => {
    if (!liveEnabled || liveMatches.length === 0) return;
    setResults((prev) => {
      const map = new Map(prev.map((m) => [m.id, m]));
      for (const lm of liveMatches) {
        map.set(lm.id, lm as SearchResult);
      }
      return Array.from(map.values()).sort((a, b) => b.createdAt - a.createdAt);
    });
  }, [liveMatches, liveEnabled]);

  return (
    <div className="p-6 space-y-4 overflow-y-auto">
      <h1 className="text-2xl font-bold">Search</h1>

      <SearchBar
        value={query}
        onChange={setQuery}
        onSubmit={onSearch}
        liveEnabled={liveEnabled}
        onToggleLive={() => setLiveEnabled((v) => !v)}
        onOpenFilters={() => setShowFilterBuilder(true)}
        filters={filters}
        onRemoveFilter={(path) => {
          if (!filters) return;
          // Simplified: clear all for now
          setFilters(null);
        }}
      />

      {showFilterBuilder && (
        <FilterBuilder
          initial={filters ?? undefined}
          onSave={(f) => {
            setFilters(f);
            setShowFilterBuilder(false);
          }}
          onClose={() => setShowFilterBuilder(false)}
        />
      )}

      {liveEnabled && (
        <div className="flex items-center gap-2 text-xs text-discord-green">
          <Zap className="w-3 h-3" />
          Live search active — new matches will appear automatically
        </div>
      )}

      <div className="space-y-2">
        {results.map((msg) => (
          <Link key={msg.id} to={`/messages/${msg.id}`} className="block">
            <MessageCard message={msg} compact />
          </Link>
        ))}

        {loading && <div className="text-sm text-gray-500">Searching...</div>}

        {!loading && results.length === 0 && (query || filters) && (
          <div className="text-sm text-gray-500">No results found.</div>
        )}

        {!loading && !query && !filters && results.length === 0 && (
          <div className="text-sm text-gray-500">Type a query to start searching.</div>
        )}
      </div>

      {hasMore && (
        <button
          onClick={() => executeSearch(query, filters, cursor)}
          disabled={loading}
          className="w-full py-2 text-sm text-discord-blurple hover:bg-discord-blurple/10 rounded-lg transition-colors disabled:opacity-50"
        >
          Load more
        </button>
      )}
    </div>
  );
}
