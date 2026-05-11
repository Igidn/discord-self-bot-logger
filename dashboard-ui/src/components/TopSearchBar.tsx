import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { parseDiscordSearchQuery } from '@/lib/search-query';

const EXAMPLE_QUERY = 'hello in:1241473215264460885';

export function TopSearchBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const currentQuery = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('query') ?? '';
  }, [location.search]);

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(currentQuery);

  useEffect(() => {
    setDraft(currentQuery);
  }, [currentQuery]);

  const parsed = useMemo(() => parseDiscordSearchQuery(draft), [draft]);
  const placeholder = currentQuery || EXAMPLE_QUERY;

  const submit = () => {
    const nextQuery = parsed.normalizedQuery;
    navigate(nextQuery ? `/search?query=${encodeURIComponent(nextQuery)}` : '/search');
    setOpen(false);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 min-w-52 justify-start gap-2 font-normal text-muted-foreground md:min-w-80">
          <Search data-icon="inline-start" />
          <span className="truncate">{placeholder}</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="top" className="mx-auto flex w-full max-w-4xl flex-col gap-4 border-x border-b px-4 pb-6 pt-12 sm:px-6">
        <SheetHeader className="gap-1">
          <SheetTitle>Search messages</SheetTitle>
          <SheetDescription>
            Use Discord-style filters like `from:`, `in:`, `server:`, `has:` and `is:`. Misspelled filter names are autocorrected.
          </SheetDescription>
        </SheetHeader>

        <div className="flex gap-2">
          <Input
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                submit();
              }
            }}
            placeholder={EXAMPLE_QUERY}
            className="h-11"
          />
          <Button onClick={submit} className="h-11 px-5">
            <Search data-icon="inline-start" />
            Search
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {parsed.chips.length > 0 ? (
            parsed.chips.map((chip) => (
              <Badge key={chip} variant="secondary" className="rounded-md px-2 py-1 text-xs font-medium">
                {chip}
              </Badge>
            ))
          ) : (
            <Badge variant="outline" className="rounded-md px-2 py-1 text-xs text-muted-foreground">
              Free text search
            </Badge>
          )}
        </div>

        <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
          <p>`hello in:1241473215264460885` searches for hello in one channel.</p>
          <p>`deploy from:123 has:file is:edited` combines text and filters.</p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
