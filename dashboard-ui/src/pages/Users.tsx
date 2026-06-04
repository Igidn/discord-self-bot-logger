import { useEffect, useMemo, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  Search,
  User,
  Users,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import apiClient from '../api/client';

interface UserItem {
  userId: string;
  username: string | null;
  avatarUrl: string | null;
  bot: number | null;
  messageCount: number;
}

interface UsersResponse {
  data: UserItem[];
  total: number;
  page: number;
  limit: number;
}

type SortOption = 'messages_desc' | 'messages_asc' | 'username_asc' | 'username_desc';

const SORT_LABELS: Record<SortOption, string> = {
  messages_desc: 'Most messages',
  messages_asc: 'Least messages',
  username_asc: 'Username A–Z',
  username_desc: 'Username Z–A',
};

const DEBOUNCE_MS = 300;

export default function UsersPage() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sort, setSort] = useState<SortOption>('messages_desc');
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [result, setResult] = useState<UsersResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // Debounce search input
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [search]);

  // Reset to page 1 when search or sort changes
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, sort]);

  useEffect(() => {
    async function fetchUsers() {
      setLoading(true);
      try {
        const res = await apiClient.get<UsersResponse>('/users', {
          params: {
            search: debouncedSearch,
            sort,
            page: String(page),
            limit: String(limit),
          },
        });
        setResult(res.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchUsers();
  }, [debouncedSearch, sort, page, limit]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil((result?.total ?? 0) / limit)),
    [result, limit]
  );

  const handlePrev = useCallback(() => setPage((p) => Math.max(1, p - 1)), []);
  const handleNext = useCallback(
    () => setPage((p) => Math.min(totalPages, p + 1)),
    [totalPages]
  );

  const startItem = (page - 1) * limit + 1;
  const endItem = Math.min(page * limit, result?.total ?? 0);

  return (
    <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Users className="size-5 text-muted-foreground" />
            <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            All tracked users sorted by message activity.
          </p>
        </div>
      </div>

      {/* Controls */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                placeholder="Search by username…"
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground hidden sm:inline">Sort by</span>
              <div className="relative">
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortOption)}
                  className="h-9 appearance-none rounded-md border border-input bg-background pr-8 pl-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {(Object.entries(SORT_LABELS) as [SortOption, string][]).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <UsersTableSkeleton />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-16 text-center">Rank</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead className="text-right">Messages</TableHead>
                    <TableHead className="w-24 text-center">Type</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result && result.data.length > 0 ? (
                    result.data.map((user, index) => {
                      const rank = startItem + index;
                      return (
                        <TableRow key={user.userId}>
                          <TableCell className="text-center text-xs tabular-nums text-muted-foreground">
                            {rank}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar className="size-8 shrink-0">
                                <AvatarImage
                                  src={user.avatarUrl ?? undefined}
                                  alt={user.username ?? undefined}
                                />
                                <AvatarFallback className="text-xs">
                                  {(user.username ?? 'U').slice(0, 2).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex min-w-0 flex-col">
                                <Link
                                  to={`/users/${user.userId}`}
                                  className="truncate text-sm font-medium hover:underline"
                                >
                                  {user.username ?? `User ${user.userId.slice(-6)}`}
                                </Link>
                                <span className="text-[10px] text-muted-foreground tabular-nums">
                                  ID: {user.userId}
                                </span>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1.5 text-sm tabular-nums">
                              <MessageSquare className="size-3.5 text-muted-foreground" />
                              {user.messageCount.toLocaleString()}
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            {user.bot ? (
                              <Badge variant="secondary" className="text-[10px]">
                                Bot
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={4} className="h-32 text-center">
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          <User className="size-8 opacity-40" />
                          <p className="text-sm">
                            {debouncedSearch
                              ? 'No users match your search.'
                              : 'No users tracked yet.'}
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>

              {/* Pagination */}
              {result && result.total > 0 && (
                <div className="flex items-center justify-between border-t px-4 py-3">
                  <p className="text-xs text-muted-foreground">
                    {startItem}–{endItem} of {result.total.toLocaleString()} users
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handlePrev}
                      disabled={page <= 1}
                      className="h-8 px-2.5"
                    >
                      <ChevronLeft className="size-4" />
                      <span className="sr-only">Previous page</span>
                    </Button>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      Page {page} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleNext}
                      disabled={page >= totalPages}
                      className="h-8 px-2.5"
                    >
                      <ChevronRight className="size-4" />
                      <span className="sr-only">Next page</span>
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function UsersTableSkeleton() {
  return (
    <div className="flex flex-col gap-0">
      <div className="grid grid-cols-[64px_1fr_120px_96px] gap-4 border-b px-4 py-3 text-xs font-medium text-muted-foreground">
        <div className="text-center">Rank</div>
        <div>User</div>
        <div className="text-right">Messages</div>
        <div className="text-center">Type</div>
      </div>
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="grid grid-cols-[64px_1fr_120px_96px] items-center gap-4 border-b px-4 py-3 last:border-b-0"
        >
          <Skeleton className="mx-auto h-4 w-6" />
          <div className="flex items-center gap-3">
            <Skeleton className="size-8 rounded-full" />
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
          <Skeleton className="ml-auto h-4 w-16" />
          <Skeleton className="mx-auto h-5 w-10 rounded-full" />
        </div>
      ))}
    </div>
  );
}
