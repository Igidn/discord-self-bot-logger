import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Edit3,
  Trash2,
  Smile,
  Paperclip,
  MessageSquare,
} from 'lucide-react';
import apiClient from '../api/client';
import { MessageCard } from '../components/MessageCard';
import { formatDateTime, type TimestampValue } from '../utils/datetime';

interface Attachment {
  id: string;
  fileName: string;
  originalUrl: string;
  localPath?: string | null;
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
        <div className="text-sm text-gray-500">Loading message...</div>
      </div>
    );
  }

  if (!message) {
    return (
      <div className="p-6">
        <div className="text-sm text-gray-500">Message not found.</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 overflow-y-auto max-w-4xl">
      <div className="flex items-center gap-3">
        <button
          onClick={() => history.back()}
          className="p-2 rounded-lg bg-gray-900 border border-gray-800 hover:bg-gray-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="text-xl font-bold">Message Detail</h1>
      </div>

      <MessageCard message={message} />

      {/* Attachments */}
      {attachments.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl">
          <div className="p-4 border-b border-gray-800 flex items-center gap-2">
            <Paperclip className="w-4 h-4 text-discord-blurple" />
            <h2 className="font-semibold">Attachments</h2>
            <span className="ml-auto text-xs text-gray-500">{attachments.length}</span>
          </div>
          <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {attachments.map((att) => (
              <a
                key={att.id}
                href={att.originalUrl}
                target="_blank"
                rel="noreferrer"
                className="group relative block rounded-lg overflow-hidden border border-gray-800 bg-gray-850"
              >
                {att.localPath ? (
                  <img
                    src={`/api/v1/attachments/${att.id}/preview`}
                    alt={att.fileName}
                    className="w-full h-32 object-cover group-hover:opacity-80 transition-opacity"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-32 flex items-center justify-center text-gray-500 text-xs">
                    {att.fileName}
                  </div>
                )}
                <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1 text-[10px] text-gray-300 truncate">
                  {att.fileName}
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Reactions */}
      {reactions.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl">
          <div className="p-4 border-b border-gray-800 flex items-center gap-2">
            <Smile className="w-4 h-4 text-discord-yellow" />
            <h2 className="font-semibold">Reactions</h2>
          </div>
          <div className="p-4 flex flex-wrap gap-2">
            {reactions.map((r, i) => (
              <Link
                key={`${r.id}-${i}`}
                to={`/users/${r.userId}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-850 border border-gray-800 text-sm hover:bg-gray-800 transition-colors"
              >
                <span>{r.emojiName ?? r.emojiId ?? '❓'}</span>
                <span className="text-xs text-gray-400">{r.userId.slice(0, 8)}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Edit History */}
      {edits.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl">
          <div className="p-4 border-b border-gray-800 flex items-center gap-2">
            <Edit3 className="w-4 h-4 text-discord-green" />
            <h2 className="font-semibold">Edit History</h2>
          </div>
          <div className="divide-y divide-gray-800">
            {edits.map((edit) => (
              <div key={edit.id} className="p-4 space-y-2">
                <div className="text-xs text-gray-500">
                  {formatDateTime(edit.editedAt)}
                </div>
                {edit.oldContent !== null && (
                  <div className="text-sm text-gray-400 line-through">{edit.oldContent}</div>
                )}
                <div className="text-sm text-gray-100">{edit.newContent}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {message.deletedAt && (
        <div className="bg-discord-red/10 border border-discord-red/30 rounded-xl p-4 flex items-center gap-3 text-discord-red">
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
