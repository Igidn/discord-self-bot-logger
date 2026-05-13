import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Edit3,
  Trash2,
  Smile,
  Paperclip,
  FileText,
  Image as ImageIcon,
  Download,
} from 'lucide-react';
import apiClient from '../api/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { formatDateTime, type TimestampValue } from '../utils/datetime';

interface Attachment {
  id: string;
  fileName: string;
  originalUrl: string;
  localPath?: string | null;
  contentType?: string | null;
  width?: number | null;
  height?: number | null;
  compressedSizeBytes?: number | null;
  originalSizeBytes?: number | null;
}

interface Reaction {
  id: number;
  messageId: string;
  userId: string;
  emojiId?: string | null;
  emojiName?: string | null;
}

interface Edit {
  id: number;
  messageId: string;
  oldContent?: string | null;
  newContent?: string | null;
  editedAt: TimestampValue;
}

interface MessageDetailData {
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
}

function isImageAttachment(att: Attachment): boolean {
  if (att.contentType?.startsWith('image/')) return true;
  const ext = att.fileName.split('.').pop()?.toLowerCase();
  return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext ?? '');
}

function formatFileSize(bytes?: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function MessageDetail() {
  const { id } = useParams<{ id: string }>();
  const [message, setMessage] = useState<MessageDetailData | null>(null);
  const [edits, setEdits] = useState<Edit[]>([]);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    async function fetchData() {
      try {
        const [mRes, eRes, rRes, aRes] = await Promise.all([
          apiClient.get<MessageDetailData>(`/messages/${id}`),
          apiClient.get<Edit[]>(`/messages/${id}/edits`).catch(() => ({ data: [] })),
          apiClient.get<Reaction[]>(`/messages/${id}/reactions`).catch(() => ({ data: [] })),
          apiClient.get<Attachment[]>(`/messages/${id}/attachments`).catch(() => ({ data: [] })),
        ]);
        setMessage(mRes.data);
        setEdits(eRes.data);
        setReactions(rRes.data);
        setAttachments(aRes.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [id]);

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-sm text-muted-foreground">Loading message...</div>
      </div>
    );
  }

  if (!message) {
    return (
      <div className="p-6">
        <div className="text-sm text-muted-foreground">Message not found.</div>
      </div>
    );
  }

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
    <div className="p-6 space-y-6 overflow-y-auto max-w-4xl">
      <div className="flex items-center gap-3">
        <button
          onClick={() => history.back()}
          className="p-2 rounded-lg border bg-card hover:bg-accent transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="text-xl font-bold">Message Detail</h1>
      </div>

      {/* Message Header */}
      <div className="rounded-xl border bg-card/70 p-5 space-y-4">
        <div className="flex items-start gap-4">
          <Link to={`/users/${message.authorId}`} className="shrink-0">
            <Avatar className="size-14">
              <AvatarImage src={message.author?.avatarUrl ?? undefined} alt={message.author?.username} />
              <AvatarFallback className="bg-primary/10 text-primary text-lg">
                {(message.author?.username ?? '?').charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </Link>
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Link
                to={`/users/${message.authorId}`}
                className="text-base font-semibold text-foreground hover:underline"
              >
                {message.author?.username ?? message.authorId}
              </Link>
              <span className="text-xs text-muted-foreground">
                {formatDateTime(message.createdAt)}
              </span>
              {message.editedAt && (
                <Badge variant="secondary" className="gap-1 rounded-md px-1.5 py-0 text-[10px]">
                  <Edit3 className="size-3" />
                  edited
                </Badge>
              )}
              {message.deletedAt && (
                <Badge variant="destructive" className="rounded-md px-1.5 py-0 text-[10px]">
                  deleted
                </Badge>
              )}
              {message.replyToId && (
                <Badge variant="outline" className="rounded-md px-1.5 py-0 text-[10px]">
                  reply
                </Badge>
              )}
            </div>

            <div className="whitespace-pre-wrap break-words text-sm text-foreground leading-relaxed">
              {message.content ?? <span className="italic text-muted-foreground">No content</span>}
            </div>

            {stickerLinks.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {stickerLinks.map((link, i) => (
                  <a
                    key={i}
                    href={link.match(/\(([^)]+)\)/)?.[1] ?? '#'}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <Smile className="size-3" />
                    {link.match(/\[([^\]]+)\]/)?.[1] ?? 'Sticker'}
                  </a>
                ))}
              </div>
            )}

            {embeds.length > 0 && (
              <div className="inline-flex items-center gap-1 rounded-md border bg-muted/40 px-2 py-1 text-[10px] text-muted-foreground">
                <Paperclip className="size-3" />
                {embeds.length} embed{embeds.length > 1 ? 's' : ''}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Attachments */}
      {attachments.length > 0 && (
        <div className="rounded-xl border bg-card/70 overflow-hidden">
          <div className="p-4 border-b flex items-center gap-2">
            <Paperclip className="w-4 h-4 text-primary" />
            <h2 className="font-semibold text-sm">Attachments</h2>
            <span className="ml-auto text-xs text-muted-foreground">{attachments.length}</span>
          </div>
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {attachments.map((att) => {
              const isImage = isImageAttachment(att);
              return (
                <div
                  key={att.id}
                  className="group relative rounded-lg overflow-hidden border bg-muted/40"
                >
                  {isImage ? (
                    <a
                      href={att.originalUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="block"
                    >
                      <img
                        src={`/api/v1/attachments/${att.id}/preview`}
                        alt={att.fileName}
                        className="w-full h-40 object-cover group-hover:opacity-90 transition-opacity"
                        loading="lazy"
                      />
                    </a>
                  ) : (
                    <div className="w-full h-40 flex flex-col items-center justify-center gap-2 text-muted-foreground bg-muted/60">
                      <FileText className="size-8" />
                      <span className="text-xs text-center px-2 truncate max-w-full">
                        {att.fileName}
                      </span>
                    </div>
                  )}
                  <div className="p-2 flex items-center justify-between gap-2 bg-card border-t">
                    <div className="min-w-0">
                      <div className="text-xs font-medium truncate">{att.fileName}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {formatFileSize(att.originalSizeBytes ?? att.compressedSizeBytes)}
                      </div>
                    </div>
                    <a
                      href={att.originalUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 p-1.5 rounded-md hover:bg-accent transition-colors"
                      title="Open / Download"
                    >
                      <Download className="size-3.5" />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Reactions */}
      {reactions.length > 0 && (
        <div className="rounded-xl border bg-card/70 overflow-hidden">
          <div className="p-4 border-b flex items-center gap-2">
            <Smile className="w-4 h-4 text-yellow-500" />
            <h2 className="font-semibold text-sm">Reactions</h2>
          </div>
          <div className="p-4 flex flex-wrap gap-2">
            {reactions.map((r, i) => (
              <Link
                key={`${r.id}-${i}`}
                to={`/users/${r.userId}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted border text-sm hover:bg-accent transition-colors"
              >
                <span>{r.emojiName ?? r.emojiId ?? '❓'}</span>
                <span className="text-xs text-muted-foreground">{r.userId.slice(0, 8)}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Edit History */}
      {edits.length > 0 && (
        <div className="rounded-xl border bg-card/70 overflow-hidden">
          <div className="p-4 border-b flex items-center gap-2">
            <Edit3 className="w-4 h-4 text-green-500" />
            <h2 className="font-semibold text-sm">Edit History</h2>
          </div>
          <div className="divide-y">
            {edits.map((edit) => (
              <div key={edit.id} className="p-4 space-y-2">
                <div className="text-xs text-muted-foreground">
                  {formatDateTime(edit.editedAt)}
                </div>
                {edit.oldContent !== null && (
                  <div className="text-sm text-muted-foreground line-through">{edit.oldContent}</div>
                )}
                <div className="text-sm text-foreground">{edit.newContent}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {message.deletedAt && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 flex items-center gap-3 text-destructive">
          <Trash2 className="w-5 h-5" />
          <div>
            <div className="font-medium">This message was deleted</div>
            <div className="text-xs">
              Deleted at {formatDateTime(message.deletedAt)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
