import { useEffect, useMemo, useState, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search as SearchIcon } from 'lucide-react';
import apiClient from '../api/client';
import { MessageCard } from '../components/MessageCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { parseDiscordSearchQuery } from '@/lib/search-query';
import type { TimestampValue } from '../utils/datetime';

interface SearchResult {
  id: string;
  guildId?: string | null;
  channelId: string;
  authorId: string;
  content?: string | null;
  createdAt: TimestampValue;
  editedAt?: TimestampValue;
  deletedAt?: TimestampValue;
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
  const [searchParams] = useSearchParams();
  const rawQuery = searchParams.get('query') ?? '';
  const parsedQuery = useMemo(() => parseDiscordSearchQuery(rawQuery), [rawQuery]);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  const executeSearch = useCallback(
    async (queryText: string, afterCursor?: string | null) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (queryText) params.set('q', queryText);
        if (parsedQuery.filter) params.set('filters', JSON.stringify(parsedQuery.filter));
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
    [parsedQuery.filter]
  );

  useEffect(() => {
    setResults([]);
    setCursor(null);
    setHasMore(false);

    if (!parsedQuery.text && !parsedQuery.filter) {
      return;
    }

    executeSearch(parsedQuery.text, null);
  }, [parsedQuery.text, parsedQuery.filter, executeSearch]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto flex max-w-5xl flex-col gap-4">
          <Card>
            <CardHeader className="gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <CardTitle className="text-xl">Search Results</CardTitle>
                  <CardDescription>
                    Discord-style query parsing powered by `search-query-parser`.
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link to="/">Back to overview</Link>
                </Button>
              </div>

              <div className="flex flex-wrap gap-2">
                {parsedQuery.normalizedQuery ? (
                  <Badge variant="outline" className="rounded-md px-2 py-1 text-xs font-medium">
                    {parsedQuery.normalizedQuery}
                  </Badge>
                ) : null}
                {parsedQuery.chips.map((chip) => (
                  <Badge key={chip} variant="secondary" className="rounded-md px-2 py-1 text-xs font-medium">
                    {chip}
                  </Badge>
                ))}
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid gap-3 text-sm text-muted-foreground md:grid-cols-3">
                <div className="rounded-lg border bg-muted/30 p-3">
                  <p className="font-medium text-foreground">Channel</p>
                  <p>Use `in:1234567890` to scope results to one channel.</p>
                </div>
                <div className="rounded-lg border bg-muted/30 p-3">
                  <p className="font-medium text-foreground">Author</p>
                  <p>Use `from:1234567890` to filter by one user.</p>
                </div>
                <div className="rounded-lg border bg-muted/30 p-3">
                  <p className="font-medium text-foreground">Flags</p>
                  <p>Try `has:file`, `has:embed`, `is:edited`, or `is:deleted`.</p>
                </div>
              </div>
              <Separator />

              <div className="flex flex-col gap-2">
                {results.map((msg) => (
                  <Link key={msg.id} to={`/messages/${msg.id}`} className="block">
                    <MessageCard message={msg} compact />
                  </Link>
                ))}

                {loading ? <div className="text-sm text-muted-foreground">Searching...</div> : null}

                {!loading && results.length === 0 && (parsedQuery.text || parsedQuery.filter) ? (
                  <div className="flex items-center gap-2 rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                    <SearchIcon className="size-4" />
                    No results found for this query.
                  </div>
                ) : null}

                {!loading && !parsedQuery.text && !parsedQuery.filter ? (
                  <div className="flex items-center gap-2 rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                    <SearchIcon className="size-4" />
                    Open the top drawer and enter a query like `hello in:1241473215264460885`.
                  </div>
                ) : null}
              </div>

              {hasMore ? (
                <Button
                  variant="outline"
                  onClick={() => executeSearch(parsedQuery.text, cursor)}
                  disabled={loading}
                >
                  Load more
                </Button>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
