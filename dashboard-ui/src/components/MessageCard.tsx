import { Link } from 'react-router-dom';
import { Edit3, Reply, Paperclip, Sticker } from 'lucide-react';

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
    createdAt: number;
    editedAt?: number | null;
    deletedAt?: number | null;
    replyToId?: string | null;
    stickerLinks?: string | null;
    embedsJson?: string | null;
    author?: MessageAuthor | null;
  };
  compact?: boolean;
  isLive?: boolean;
}

export function MessageCard({ message, compact, isLive }: MessageCardProps) {
  const ts = new Date(message.createdAt * 1000);
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
      className={`group rounded-lg border transition-all ${
        isLive ? 'animate-slide-up border-discord-blurple/30 bg-discord-blurple/5' : 'border-transparent hover:bg-gray-850 bg-gray-900'
      } ${deleted ? 'opacity-50' : ''}`}
    >
      <div className={`flex gap-3 ${compact ? 'p-2' : 'p-3'}`}>
        <Link to={`/users/${message.authorId}`} className="shrink-0">
          {message.author?.avatarUrl ? (
            <img
              src={message.author.avatarUrl}
              alt={message.author.username}
              className={`rounded-full object-cover ${compact ? 'w-8 h-8' : 'w-10 h-10'}`}
            />
          ) : (
            <div
              className={`rounded-full bg-discord-blurple flex items-center justify-center text-white font-bold ${
                compact ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm'
              }`}
            >
              {(message.author?.username ?? '?').charAt(0).toUpperCase()}
            </div>
          )}
        </Link>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              to={`/users/${message.authorId}`}
              className="text-sm font-semibold text-gray-200 hover:underline"
            >
              {message.author?.username ?? message.authorId}
            </Link>
            <span className="text-[10px] text-gray-500">
              {ts.toLocaleDateString()} {ts.toLocaleTimeString()}
            </span>
            {edited && (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-discord-yellow">
                <Edit3 className="w-3 h-3" />
                edited
              </span>
            )}
            {deleted && (
              <span className="text-[10px] text-discord-red font-medium">deleted</span>
            )}
            {message.replyToId && (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-gray-400">
                <Reply className="w-3 h-3" />
                reply
              </span>
            )}
          </div>

          <div className="mt-1 text-sm text-gray-100 whitespace-pre-wrap break-words">
            {message.content ?? <span className="text-gray-500 italic">No content</span>}
          </div>

          {/* Stickers */}
          {stickerLinks.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {stickerLinks.map((link, i) => (
                <a
                  key={i}
                  href={link.match(/\(([^)]+)\)/)?.[1] ?? '#'}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-discord-blurple hover:underline"
                >
                  <Sticker className="w-3 h-3" />
                  {link.match(/\[([^\]]+)\]/)?.[1] ?? 'Sticker'}
                </a>
              ))}
            </div>
          )}

          {/* Embeds indicator */}
          {embeds.length > 0 && (
            <div className="mt-2 inline-flex items-center gap-1 text-[10px] text-gray-500 bg-gray-950 px-2 py-1 rounded">
              <Paperclip className="w-3 h-3" />
              {embeds.length} embed{embeds.length > 1 ? 's' : ''}
            </div>
          )}

          {!compact && (
            <div className="mt-2 flex items-center gap-3">
              <Link
                to={`/messages/${message.id}`}
                className="text-[10px] text-gray-500 hover:text-discord-blurple transition-colors"
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
