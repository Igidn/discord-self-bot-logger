import { Link } from 'react-router-dom';
import { Edit3, Reply, Paperclip, Sticker } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatDateAndTime, type TimestampValue } from '../utils/datetime';

interface MessageAuthor {
  id: string;
  username: string;
  discriminator?: string | null;
  avatarUrl?: string | null;
}

interface MessageCardProps {
  message: {
    id: string;
    guildId?: string | null;
    channelId: string;
    authorId: string;
    content?: string | null;
    createdAt: TimestampValue;
    editedAt?: TimestampValue;
    deletedAt?: TimestampValue;
    replyToId?: string | null;
    stickerLinks?: string | null;
    embedsJson?: string | null;
    author?: MessageAuthor | null;
  };
  compact?: boolean;
  isLive?: boolean;
}

export function MessageCard({ message, compact, isLive }: MessageCardProps) {
  const timestampLabel = formatDateAndTime(message.createdAt);
  const edited = !!message.editedAt;
  const deleted = !!message.deletedAt;

  const stickerLinks: string[] = (() => {
    try {
      if (message.stickerLinks) return JSON.parse(message.stickerLinks) as string[];
    } catch {
      // ignore
    }
    return [];
  })();

  const embeds: unknown[] = (() => {
    try {
      if (message.embedsJson) return JSON.parse(message.embedsJson) as unknown[];
    } catch {
      // ignore
    }
    return [];
  })();

  return (
    <div
      className={cn(
        'group rounded-xl border bg-card/70 transition-colors hover:bg-accent/20',
        isLive && 'animate-slide-up border-primary/30 bg-primary/5',
        deleted && 'opacity-60',
      )}
    >
      <div className={cn('flex gap-3', compact ? 'p-3' : 'p-4')}>
        <Link to={`/users/${message.authorId}`} className="shrink-0">
          <Avatar className={compact ? 'size-8' : 'size-10'}>
            <AvatarImage src={message.author?.avatarUrl ?? undefined} alt={message.author?.username} />
            <AvatarFallback className="bg-primary/10 text-primary">
              {(message.author?.username ?? '?').charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </Link>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              to={`/users/${message.authorId}`}
              className="text-sm font-semibold text-foreground hover:underline"
            >
              {message.author?.username ?? message.authorId}
            </Link>
            <span className="text-[10px] text-muted-foreground">
              {timestampLabel}
            </span>
            {edited && (
              <Badge variant="secondary" className="gap-1 rounded-md px-1.5 py-0 text-[10px]">
                <Edit3 className="size-3" />
                edited
              </Badge>
            )}
            {deleted && (
              <Badge variant="destructive" className="rounded-md px-1.5 py-0 text-[10px]">
                deleted
              </Badge>
            )}
            {message.replyToId && (
              <Badge variant="outline" className="gap-1 rounded-md px-1.5 py-0 text-[10px]">
                <Reply className="size-3" />
                reply
              </Badge>
            )}
          </div>

          <div className="mt-1 whitespace-pre-wrap break-words text-sm text-foreground">
            {message.content ?? <span className="italic text-muted-foreground">No content</span>}
          </div>

          {stickerLinks.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {stickerLinks.map((link, i) => (
                <a
                  key={i}
                  href={link.match(/\(([^)]+)\)/)?.[1] ?? '#'}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <Sticker className="size-3" />
                  {link.match(/\[([^\]]+)\]/)?.[1] ?? 'Sticker'}
                </a>
              ))}
            </div>
          )}

          {embeds.length > 0 && (
            <div className="mt-2 inline-flex items-center gap-1 rounded-md border bg-muted/40 px-2 py-1 text-[10px] text-muted-foreground">
              <Paperclip className="size-3" />
              {embeds.length} embed{embeds.length > 1 ? 's' : ''}
            </div>
          )}

          {!compact && (
            <div className="mt-2 flex items-center gap-3">
              <Link
                to={`/messages/${message.id}`}
                className="text-[10px] text-muted-foreground transition-colors hover:text-primary"
              >
                View detail
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
