import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  ArrowDownToLine,
  Calendar,
  ChevronDown,
  ChevronUp,
  Filter,
  Hash,
  Loader2,
  MessageSquareOff,
  RotateCcw,
  Search as SearchIcon,
  SlidersHorizontal,
  Sticker,
  User as UserIcon,
  X,
} from 'lucide-react';

import apiClient from '../api/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { formatDateTime, formatRelativeTime, type TimestampValue } from '../utils/datetime';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface GuildItem {
  id: string;
  name: string;
  icon?: string | null;
  messageCount: number;
  memberCount: number;
}

interface ChannelItem {
  id: string;
  name: string | null;
  type: number | null;
  messageCount: number;
}

interface SuggestItem {
  id: string;
  label: string;
  count: number;
}

interface AttachmentThumb {
  id: string;
  fileName: string | null;
  contentType: string | null;
  width: number | null;
  height: number | null;
}

interface BrowseMessage {
  id: string;
  guildId: string | null;
  channelId: string;
  authorId: string;
  content: string | null;
  createdAt: TimestampValue;
  editedAt?: TimestampValue | null;
  deletedAt?: TimestampValue | null;
  isDm?: boolean | null;
  replyToId?: string | null;
  stickerLinks?: string | null;
  embedsJson?: string | null;
  componentsJson?: string | null;
  flags?: number | null;
  attachmentCount?: number | null;
  author?: { id: string; username: string | null; avatarUrl?: string | null } | null;
  channel?: { id: string; name: string | null; type: number | null } | null;
  attachments: AttachmentThumb[];
}

interface BrowseResponse {
  data: BrowseMessage[];
  nextCursor: string | null;
}

type SortMode = 'newest' | 'oldest';

interface AppliedFilters {
  guildId: string;
  channelId: string;
  authorId: string; // snowflake (selected from autocomplete)
  authorLabel: string; // display label for the selected user
  from: string; // YYYY-MM-DD date string
  to: string; // YYYY-MM-DD date string
  search: string;
  sort: SortMode;
  showSystem: boolean;
}

const EMPTY_FILTERS: AppliedFilters = {
  guildId: '',
  channelId: '',
  authorId: '',
  authorLabel: '',
  from: '',
  to: '',
  search: '',
  sort: 'newest',
  showSystem: false,
};

const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 350;
const SYSTEM_TOGGLE_STORAGE_KEY = 'browse:showSystem';

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function BrowseAll() {
  // Read authorId/authorLabel passed via URL (e.g. from UserProfile redirect).
  const [searchParams] = useSearchParams();
  const urlAuthorId = searchParams.get('authorId') ?? '';
  const urlAuthorLabel = searchParams.get('authorLabel') ?? '';

  // Draft filter inputs (what the user is currently editing)
  const [draftGuildId, setDraftGuildId] = useState('');
  const [draftChannelId, setDraftChannelId] = useState('');
  const [draftUserId, setDraftUserId] = useState(urlAuthorId); // snowflake
  const [draftUserLabel, setDraftUserLabel] = useState(urlAuthorLabel); // free-text / selected label
  const [draftFrom, setDraftFrom] = useState('');
  const [draftTo, setDraftTo] = useState('');
  const [draftSearch, setDraftSearch] = useState('');
  const [draftSort, setDraftSort] = useState<SortMode>('newest');

  // Applied filters drive the fetch query
  const [applied, setApplied] = useState<AppliedFilters>(() => ({
    ...EMPTY_FILTERS,
    authorId: urlAuthorId,
    authorLabel: urlAuthorLabel,
    showSystem:
      typeof localStorage !== 'undefined' &&
      localStorage.getItem(SYSTEM_TOGGLE_STORAGE_KEY) === '1',
  }));

  // Source data for dropdowns / autocomplete
  const [guilds, setGuilds] = useState<GuildItem[]>([]);
  const [channels, setChannels] = useState<ChannelItem[]>([]);
  const [userSuggestions, setUserSuggestions] = useState<SuggestItem[]>([]);
  const [userQuery, setUserQuery] = useState('');

  // Results
  const [rows, setRows] = useState<BrowseMessage[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [filtersOpenMobile, setFiltersOpenMobile] = useState(false);

  const parentRef = useRef<HTMLDivElement>(null);
  const fetchIdRef = useRef(0);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bottomSentinelRef = useRef<HTMLDivElement>(null);

  const hasMore = nextCursor !== null;

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (applied.guildId) count++;
    if (applied.channelId) count++;
    if (applied.authorId) count++;
    if (applied.from) count++;
    if (applied.to) count++;
    if (applied.search.trim()) count++;
    if (applied.sort === 'oldest') count++;
    return count;
  }, [applied]);
  /* ---------------- guild + channel lists ---------------- */

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<GuildItem[]>('/guilds')
      .then((res) => {
        if (!cancelled) setGuilds(res.data);
      })
      .catch(() => {
        /* ignore — guild filter just stays empty */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Populate channels for the *draft* guild so the channel dropdown fills
  // the instant a guild is selected, before filters are applied.
  useEffect(() => {
    setChannels([]);
    if (!draftGuildId) return;
    let cancelled = false;
    apiClient
      .get<ChannelItem[]>(`/guilds/${draftGuildId}/channels`)
      .then((res) => {
        if (!cancelled) setChannels(res.data);
      })
      .catch(() => {
        if (!cancelled) setChannels([]);
      });
    return () => {
      cancelled = true;
    };
  }, [draftGuildId]);

  /* ---------------- user autocomplete ---------------- */

  useEffect(() => {
    if (suggestTimerRef.current) clearTimeout(suggestTimerRef.current);
    const q = userQuery.trim();
    if (q.length < 1) {
      setUserSuggestions([]);
      return;
    }
    suggestTimerRef.current = setTimeout(() => {
      const params = new URLSearchParams();
      params.set('field', 'authorId');
      params.set('prefix', q);
      if (applied.guildId) params.set('guildId', applied.guildId);
      params.set('limit', '8');
      apiClient
        .get<SuggestItem[]>(`/search/suggest?${params.toString()}`)
        .then((res) => setUserSuggestions(res.data))
        .catch(() => setUserSuggestions([]));
    }, 180);
    return () => {
      if (suggestTimerRef.current) clearTimeout(suggestTimerRef.current);
    };
  }, [userQuery, applied.guildId]);


  /* ---------------- fetch ---------------- */

  const buildParams = useCallback(
    (filters: AppliedFilters, cursor?: string | null) => {
      const params = new URLSearchParams();
      if (filters.search.trim()) params.set('q', filters.search.trim());
      if (filters.guildId) params.set('guildId', filters.guildId);
      if (filters.channelId) params.set('channelId', filters.channelId);
      if (filters.authorId) params.set('authorId', filters.authorId);
      // Date inputs yield YYYY-MM-DD (timezone-naive). Treat From as the
      // start of that day and To as the END of that day (23:59:59.999) so
      // picking "To = today" includes all of today's messages instead of only
      // its first second. Convert to an absolute ISO string in the browser so
      // the backend parses it as UTC regardless of the server's local TZ.
      if (filters.from) {
        const d = new Date(filters.from + 'T00:00:00');
        if (!Number.isNaN(d.getTime())) params.set('from', d.toISOString());
      }
      if (filters.to) {
        const d = new Date(filters.to + 'T23:59:59.999');
        if (!Number.isNaN(d.getTime())) params.set('to', d.toISOString());
      }
      if (filters.sort) params.set('sort', filters.sort);
      params.set('limit', String(PAGE_SIZE));
      if (cursor) params.set('cursor', cursor);
      return params;
    },
    []
  );

  const loadPage = useCallback(
    async (filters: AppliedFilters, cursor: string | null, append: boolean) => {
      const id = ++fetchIdRef.current;

      if (append) setIsLoadingMore(true);
      else setLoading(true);
      setError(null);

      try {
        const res = await apiClient.get<BrowseResponse>(
          `/messages/browse?${buildParams(filters, cursor).toString()}`
        );
        if (id !== fetchIdRef.current) return; // superseded
        const incoming = res.data.data ?? [];
        if (append) {
          setRows((prev) => [...prev, ...incoming]); // ponytail: no dedupe — cursor pagination never overlaps pages; re-add if backend changes
        } else {
          setRows(incoming);
        }
        setNextCursor(res.data.nextCursor);
      } catch {
        if (id !== fetchIdRef.current) return;
        setError('Failed to load messages. Please retry.');
      } finally {
        if (id === fetchIdRef.current) {
          setLoading(false);
          setIsLoadingMore(false);
        }
      }
    },
    [buildParams]
  );

  // Re-fetch the first page whenever the applied filters change.
  useEffect(() => {
    loadPage(applied, null, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    applied.guildId,
    applied.channelId,
    applied.authorId,
    applied.from,
    applied.to,
    applied.search,
    applied.sort,
  ]);

  /* ---------------- actions ---------------- */

  const commitFilters = useCallback(() => {
    setApplied((prev) => ({
      ...prev,
      guildId: draftGuildId,
      channelId: draftChannelId,
      authorId: draftUserId,
      authorLabel: draftUserLabel,
      from: draftFrom,
      to: draftTo,
      search: draftSearch,
      sort: draftSort,
    }));
    setFiltersOpenMobile(false);
  }, [
    draftGuildId,
    draftChannelId,
    draftUserId,
    draftUserLabel,
    draftFrom,
    draftTo,
    draftSearch,
    draftSort,
  ]);

  const clearFilters = useCallback(() => {
    setDraftGuildId('');
    setDraftChannelId('');
    setDraftUserId('');
    setDraftUserLabel('');
    setDraftFrom('');
    setDraftTo('');
    setDraftSearch('');
    setDraftSort('newest');
    setUserSuggestions([]);
    setUserQuery('');
    setApplied((prev) => ({ ...EMPTY_FILTERS, showSystem: prev.showSystem }));
    setFiltersOpenMobile(false);
  }, []);

  // Live debounced search — commits just the search field, preserving
  // the rest of the applied filter set.
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (draftSearch === applied.search) return;
    searchTimerRef.current = setTimeout(() => {
      setApplied((prev) => ({ ...prev, search: draftSearch }));
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [draftSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectUser = (item: SuggestItem) => {
    setDraftUserId(item.id);
    setDraftUserLabel(item.label);
    setUserSuggestions([]);
    setUserQuery('');
  };

  const toggleShowSystem = (checked: boolean) => {
    setApplied((prev) => {
      const next = { ...prev, showSystem: checked };
      try {
        localStorage.setItem(SYSTEM_TOGGLE_STORAGE_KEY, checked ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const changeSort = (sort: SortMode) => {
    setDraftSort(sort);
    setApplied((prev) => ({ ...prev, sort }));
  };

  /* ---------------- virtualizer ---------------- */

  // Pre-filter system messages and cache the isSystem flag once per row,
  // so the virtualizer's `count` / measurement cache reflect only the rows
  // we render, and the render pass doesn't re-parse embed/sticker JSON.
  const visibleRows = useMemo(
    () =>
      rows
        .map((m) => ({ message: m, isSystem: isSystemMessage(m) }))
        .filter(({ isSystem }) => applied.showSystem || !isSystem),
    [rows, applied.showSystem]
  );

  // Windowing uses dynamic measurement so long messages expand correctly.
  // `getItemKey` keys the measurement cache by stable message id, so toggling
  // the System filter (which reshuffles which item lives at a given index)
  // doesn't make cached row heights apply to the wrong messages.
  const rowVirtualizer = useVirtualizer({
    count: visibleRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 96,
    overscan: 8,
    getItemKey: (index) => visibleRows[index]?.message.id ?? index,
    measureElement:
      typeof window !== 'undefined' &&
      navigator.userAgent.indexOf('Firefox') === -1
        ? (el) => el?.getBoundingClientRect().height ?? 96
        : undefined,
  });

  const loadMore = useCallback(() => {
    if (nextCursor && !isLoadingMore && !loading) {
      loadPage(applied, nextCursor, true);
    }
  }, [nextCursor, isLoadingMore, loading, applied, loadPage]);

  // Infinite scroll via IntersectionObserver on a bottom sentinel.
  useEffect(() => {
    const root = parentRef.current;
    const target = bottomSentinelRef.current;
    if (!root || !target) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) loadMore();
        }
      },
      { root, rootMargin: '600px 0px 0px 0px', threshold: 0 }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [loadMore]);

  /* ---------------- render ---------------- */

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <FiltersBar
        draftGuildId={draftGuildId}
        onGuildChange={(id) => {
          setDraftGuildId(id);
          setDraftChannelId('');
        }}
        guilds={guilds}
        draftChannelId={draftChannelId}
        onChannelChange={setDraftChannelId}
        channels={channels}
        draftUserLabel={draftUserLabel}
        onUserLabelChange={(label) => {
          setDraftUserLabel(label);
          setDraftUserId('');
          setUserQuery(label);
        }}
        userSuggestions={userSuggestions}
        onSelectUser={selectUser}
        draftFrom={draftFrom}
        onFromChange={setDraftFrom}
        draftTo={draftTo}
        onToChange={setDraftTo}
        draftSearch={draftSearch}
        onSearchChange={setDraftSearch}
        onCommit={commitFilters}
        onClear={clearFilters}
        sort={applied.sort}
        onSortChange={changeSort}
        showSystem={applied.showSystem}
        onShowSystemChange={toggleShowSystem}
        activeFilterCount={activeFilterCount}
        filtersOpenMobile={filtersOpenMobile}
        setFiltersOpenMobile={setFiltersOpenMobile}
      />

      <div ref={parentRef} className="relative flex-1 overflow-y-auto">
        <div
          style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
          className="relative w-full"
        >
          {loading && rows.length === 0 ? (
            <BrowseSkeleton />
          ) : error ? (
            <BrowseEmpty
              title="Something went wrong"
              body={error}
              action={
                <Button size="sm" variant="outline" onClick={() => loadPage(applied, null, false)}>
                  <RotateCcw className="size-3.5" />
                  Retry
                </Button>
              }
            />
          ) : visibleRows.length === 0 ? (
            <BrowseEmpty
              title="No messages"
              body={
                activeFilterCount === 0
                  ? 'There are no logged messages yet.'
                  : 'No messages match the current filters. Try clearing them.'
              }
              action={
                activeFilterCount > 0 ? (
                  <Button size="sm" variant="outline" onClick={clearFilters}>
                    Clear filters
                  </Button>
                ) : null
              }
            />
          ) : (
            rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const entry = visibleRows[virtualRow.index];
              if (!entry) return null;
              const { message, isSystem } = entry;
              return (
                <div
                  key={message.id}
                  data-index={virtualRow.index}
                  ref={rowVirtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <BrowseRow message={message} dimmed={isSystem} />
                </div>
              );
            })
          )}
        </div>

        {/* Bottom sentinel for infinite scroll */}
        <div ref={bottomSentinelRef} className="h-1 w-full" />

        {isLoadingMore && (
          <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading more…
          </div>
        )}

        {!hasMore && visibleRows.length > 0 && !loading ? (
          <div className="py-6 text-center text-xs text-muted-foreground">
            {applied.sort === 'oldest'
              ? 'Reached the most recent messages.'
              : 'Reached the earliest logged messages.'}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Filters bar                                                        */
/* ------------------------------------------------------------------ */

interface FiltersBarProps {
  draftGuildId: string;
  onGuildChange: (id: string) => void;
  guilds: GuildItem[];
  draftChannelId: string;
  onChannelChange: (id: string) => void;
  channels: ChannelItem[];
  draftUserLabel: string;
  onUserLabelChange: (label: string) => void;
  userSuggestions: SuggestItem[];
  onSelectUser: (item: SuggestItem) => void;
  draftFrom: string;
  onFromChange: (value: string) => void;
  draftTo: string;
  onToChange: (value: string) => void;
  draftSearch: string;
  onSearchChange: (value: string) => void;
  onCommit: () => void;
  onClear: () => void;
  sort: SortMode;
  onSortChange: (sort: SortMode) => void;
  showSystem: boolean;
  onShowSystemChange: (checked: boolean) => void;
  activeFilterCount: number;
  filtersOpenMobile: boolean;
  setFiltersOpenMobile: (open: boolean) => void;
}

function FiltersBar(props: FiltersBarProps) {
  const controls = (
    <>
      <Field label="Guild" icon={<SlidersHorizontal className="size-3.5" />}>
        <select
          value={props.draftGuildId}
          onChange={(e) => props.onGuildChange(e.target.value)}
          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="">All guilds</option>
          {props.guilds.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Channel" icon={<Hash className="size-3.5" />}>
        <select
          value={props.draftChannelId}
          onChange={(e) => props.onChannelChange(e.target.value)}
          disabled={!props.draftGuildId}
          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="">{props.draftGuildId ? 'All channels' : 'Select a guild first'}</option>
          {props.channels.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name ?? c.id}
            </option>
          ))}
        </select>
      </Field>

      <Field label="User" icon={<UserIcon className="size-3.5" />} className="relative">
        <Input
          value={props.draftUserLabel}
          onChange={(e) => props.onUserLabelChange(e.target.value)}
          placeholder="Search by username…"
          className="h-9"
          autoComplete="off"
        />
        {props.userSuggestions.length > 0 && (
          <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-md border bg-popover shadow-md">
            {props.userSuggestions.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => props.onSelectUser(s)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
              >
                <span className="truncate">{s.label}</span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {s.count.toLocaleString()}
                </span>
              </button>
            ))}
          </div>
        )}
      </Field>

      <Field label="From" icon={<Calendar className="size-3.5" />}>
        <Input
          type="date"
          value={props.draftFrom}
          onChange={(e) => props.onFromChange(e.target.value)}
          className="h-9"
        />
      </Field>

      <Field label="To" icon={<Calendar className="size-3.5" />}>
        <Input
          type="date"
          value={props.draftTo}
          onChange={(e) => props.onToChange(e.target.value)}
          className="h-9"
        />
      </Field>

      <Field label="Full-text search" icon={<SearchIcon className="size-3.5" />} className="md:min-w-[200px]">
        <Input
          value={props.draftSearch}
          onChange={(e) => props.onSearchChange(e.target.value)}
          placeholder="Content search (FTS)…"
          className="h-9"
          autoComplete="off"
        />
      </Field>
    </>
  );

  return (
    <div className="z-10 shrink-0 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="flex items-center gap-2 px-4 py-2.5">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Filter className="size-4" />
          Filters
          {props.activeFilterCount > 0 && (
            <Badge variant="secondary" className="rounded-md px-1.5 text-[10px]">
              {props.activeFilterCount}
            </Badge>
          )}
        </div>

        {/* Sort toggle */}
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-xs text-muted-foreground sm:inline">Sort</span>
          <div className="inline-flex rounded-md border bg-background p-0.5 text-xs">
            <SortButton active={props.sort === 'newest'} onClick={() => props.onSortChange('newest')}>
              <ChevronDown className="size-3" />
              Newest
            </SortButton>
            <SortButton active={props.sort === 'oldest'} onClick={() => props.onSortChange('oldest')}>
              <ChevronUp className="size-3" />
              Oldest
            </SortButton>
          </div>

          {/* System messages toggle */}
          <label className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
            <span>System</span>
            <Switch
              checked={props.showSystem}
              onChange={(e) => props.onShowSystemChange(e.target.checked)}
              className="peer"
            />
          </label>

          {/* Mobile expand */}
          <Button
            variant="ghost"
            size="sm"
            className="md:hidden"
            onClick={() => props.setFiltersOpenMobile(!props.filtersOpenMobile)}
          >
            {props.filtersOpenMobile ? 'Hide' : 'Show'}
          </Button>
        </div>
      </div>

      {/* Filters grid — always visible on desktop, collapsible on mobile */}
      <div className={cn('px-4 pb-3', props.filtersOpenMobile ? 'block' : 'hidden md:block')}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {controls}
        </div>

        <div className="mt-3 flex items-center gap-2">
          <Button size="sm" onClick={props.onCommit}>
            <ArrowDownToLine className="size-3.5" />
            Apply
          </Button>
          <Button size="sm" variant="outline" onClick={props.onClear}>
            <X className="size-3.5" />
            Clear
          </Button>
          {props.activeFilterCount > 0 && (
            <span className="text-xs text-muted-foreground">
              {props.activeFilterCount} filter{props.activeFilterCount === 1 ? '' : 's'} active
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  icon,
  className,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <span className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
        {icon}
        {label}
      </span>
      {children}
    </div>
  );
}

function SortButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 rounded px-2 py-1 transition-colors',
        active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
      )}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Browse row                                                         */
/* ------------------------------------------------------------------ */

const MAX_CONTENT_LINES = 4;

function BrowseRow({ message, dimmed }: { message: BrowseMessage; dimmed: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [showToggle, setShowToggle] = useState(false);
  const contentRef = useRef<HTMLParagraphElement>(null);

  const username = message.author?.username ?? `User ${message.authorId.slice(-4)}`;
  const initials = username.slice(0, 2).toUpperCase();
  const channelName = message.channel?.name ?? `#${message.channelId.slice(-6)}`;
  const content = message.content?.trim() ?? '';
  const time = formatRelativeTime(message.createdAt);
  const deleted = !!message.deletedAt;
  const edited = !!message.editedAt;

  const embeds = useMemo(() => parseEmbeds(message.embedsJson), [message.embedsJson]);
  const stickerUrls = useMemo(() => parseStickers(message.stickerLinks), [message.stickerLinks]);
  const thumbUrls = useMemo(
    () => collectThumbUrls(message.attachments, embeds, stickerUrls),
    [message.attachments, embeds, stickerUrls]
  );
  const long = useMemo(() => {
    if (!content) return false;
    // heuristic: many lines or very long string
    const lines = content.split('\n').length;
    return lines > MAX_CONTENT_LINES || content.length > 240;
  }, [content]);

  useEffect(() => {
    const el = contentRef.current;
    if (el) setShowToggle(el.scrollHeight > el.clientHeight + 2 || long);
  }, [content, long]);

  return (
    <Link
      to={`/messages/${message.id}`}
      className={cn(
        'group mx-3 my-1.5 flex gap-3 rounded-lg border bg-card/60 px-3 py-2.5 transition-colors hover:bg-accent/30',
        dimmed && 'opacity-55 hover:opacity-90',
        deleted && 'opacity-70'
      )}
    >
      <Avatar className="size-9 shrink-0">
        <AvatarImage src={message.author?.avatarUrl ?? undefined} alt={username} />
        <AvatarFallback className="text-xs">{initials}</AvatarFallback>
      </Avatar>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate text-sm font-semibold">{username}</span>
          <Badge variant="secondary" className="shrink-0 gap-1 px-1.5 py-0 text-[10px]">
            <Hash className="size-2.5" />
            {channelName}
          </Badge>
          {edited && (
            <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
              edited
            </Badge>
          )}
          {deleted && (
            <Badge variant="destructive" className="px-1.5 py-0 text-[10px]">
              deleted
            </Badge>
          )}
          {message.replyToId && (
            <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
              reply
            </Badge>
          )}
          <span className="ml-auto shrink-0 text-[11px] text-muted-foreground tabular-nums" title={formatDateTime(message.createdAt)}>
            {time}
          </span>
        </div>

        {content ? (
          <p
            ref={contentRef}
            className={cn(
              'whitespace-pre-wrap break-words text-sm text-foreground',
              !expanded && 'line-clamp-4'
            )}
          >
            {content}
          </p>
        ) : stickerUrls.length > 0 ? (
          <p className="text-sm italic text-muted-foreground">
            <Sticker className="mr-1 inline-block size-3.5" />
            {stickerUrls.length} sticker{stickerUrls.length > 1 ? 's' : ''}
            {dimmed && <span className="ml-1.5">· system event</span>}
          </p>
        ) : (message.attachmentCount ?? 0) > 0 ? (
          <p className="text-sm italic text-muted-foreground">
            <MessageSquareOff className="mr-1 inline-block size-3.5" />
            {(message.attachmentCount ?? 0)} attachment{(message.attachmentCount ?? 0) > 1 ? 's' : ''}
            {dimmed && <span className="ml-1.5">· system event</span>}
          </p>
        ) : (
          <p className="text-sm italic text-muted-foreground">
            <MessageSquareOff className="mr-1 inline-block size-3.5" />
            No text content
            {dimmed && <span className="ml-1.5">· system event</span>}
          </p>
        )}

        {showToggle && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              setExpanded((v) => !v);
            }}
            className="self-start text-[11px] text-primary hover:underline"
          >
            {expanded ? 'Show less' : 'Show more'}
          </button>
        )}

        {thumbUrls.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-2">
            {thumbUrls.slice(0, 6).map((thumb, i) => (
              <Thumb key={`${thumb.src}-${i}`} thumb={thumb} />
            ))}
            {thumbUrls.length > 6 && (
              <span className="self-center text-[11px] text-muted-foreground">
                +{thumbUrls.length - 6} more
              </span>
            )}
          </div>
        )}

        {embeds.length > 0 && thumbUrls.length === 0 && (
          <div className="mt-1 inline-flex w-fit items-center gap-1 rounded-md border bg-muted/40 px-2 py-1 text-[10px] text-muted-foreground">
            <SearchIcon className="size-3" />
            {embeds.length} embed{embeds.length > 1 ? 's' : ''}
          </div>
        )}
      </div>
    </Link>
  );
}

function Thumb({ thumb }: { thumb: ThumbUrl }) {
  const isVideo = /video\//.test(thumb.contentType ?? '');
  if (isVideo) {
    return (
      <div className="flex size-16 items-center justify-center rounded-md border bg-muted/50 text-[10px] text-muted-foreground">
        video
      </div>
    );
  }
  return (
    <img
      src={thumb.src}
      alt={thumb.alt}
      loading="lazy"
      className="size-16 rounded-md border object-cover"
      onError={(e) => {
        (e.currentTarget as HTMLImageElement).style.display = 'none';
      }}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Empty + skeleton states                                            */
/* ------------------------------------------------------------------ */

function BrowseEmpty({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[260px] flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{body}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

function BrowseSkeleton() {
  return (
    <div className="flex flex-col">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="mx-3 my-1.5 flex gap-3 rounded-lg border p-3">
          <Skeleton className="size-9 shrink-0 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-full max-w-md" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */


interface ParsedEmbed {
  image?: { url?: string };
  thumbnail?: { url?: string };
  type?: string;
}

function parseEmbeds(json?: string | null): ParsedEmbed[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as ParsedEmbed[]) : [];
  } catch {
    return [];
  }
}

interface ParsedSticker {
  name: string;
  url: string;
}

/** Parse `sticker_links`, a JSON array of markdown hyperlinks like
 *  `[StickerName](https://media.discordapp.net/stickers/…/…png?size=300)`.
 *  APNG/JSON-format stickers don't have a raster preview, so those are
 *  excluded from the thumbnail set but still count as non-system content. */
function parseStickers(json?: string | null): ParsedSticker[] {
  if (!json) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const out: ParsedSticker[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'string') continue;
    const match = entry.match(/^\[([^\]]*)\]\(([^)]+)\)$/);
    if (!match) continue;
    const url = match[2];
    // Only raster formats render as thumbnails; skip Lottie (json) & APNG.
    if (/\.(json)$/i.test(url)) continue;
    out.push({ name: match[1] || 'sticker', url });
  }
  return out;
}

interface ThumbUrl {
  src: string;
  alt: string;
  contentType?: string | null;
}

function collectThumbUrls(
  attachments: AttachmentThumb[],
  embeds: ParsedEmbed[],
  stickers: ParsedSticker[]
): ThumbUrl[] {
  const thumbs: ThumbUrl[] = [];
  for (const a of attachments) {
    const isImage = (a.contentType ?? '').startsWith('image/') || !a.contentType;
    if (!isImage) continue;
    thumbs.push({
      src: `/api/v1/attachments/${encodeURIComponent(a.id)}/preview`,
      alt: a.fileName ?? 'attachment',
      contentType: a.contentType,
    });
  }
  for (const s of stickers) {
    if (s.url.startsWith('http://') || s.url.startsWith('https://')) {
      thumbs.push({ src: s.url, alt: s.name });
    }
  }
  for (const e of embeds) {
    const url = e.image?.url ?? e.thumbnail?.url;
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
      thumbs.push({ src: url, alt: 'embed image' });
    }
  }
  return thumbs;
}

/**
 * System-message heuristic. There's no dedicated `messageType` column in the
 * schema, so we approximate "system / join / pin" noise as messages with no
 * authored text content, no embeds, no stickers, and no attachments. These
 * are dimmed by default and hidden when the System toggle is off.
 *
 * Stickers live in `stickerLinks` (a JSON array of markdown hyperlinks),
 * not in `attachments`/`embeds`, so they must be checked explicitly.
 * `attachmentCount` is the reliable signal that a message had attachments
 * even when the attachment downloader is disabled (in which case there are
 * no rows in the attachments table to enrich from).
 */
function isSystemMessage(m: BrowseMessage): boolean {
  const hasContent = !!m.content?.trim();
  if (hasContent) return false;
  const embeds = parseEmbeds(m.embedsJson);
  if (embeds.length > 0) return false;
  if (parseStickers(m.stickerLinks).length > 0) return false;
  if ((m.attachmentCount ?? 0) > 0) return false;
  if (m.attachments && m.attachments.length > 0) return false;
  return true;
}
