import * as schema from '../schema.js';

export interface MessageFilters {
  guildId?: string;
  channelId?: string;
  authorId?: string;
  before?: Date;
  after?: Date;
  search?: string;
  hasAttachment?: boolean;
  hasEmbed?: boolean;
  hasReaction?: boolean;
  isDeleted?: boolean;
  isEdited?: boolean;
  isDm?: boolean;
}

export interface Pagination {
  limit?: number;
  cursor?: string; // format: "createdAtTimestamp:id"
  sort?: 'newest' | 'oldest';
  /** When false, the unfiltered + no-text case returns all rows instead of
   *  short-circuiting to an empty page. Used by the browse endpoint. */
  requireFilter?: boolean;
}

export interface MessageWithAuthor {
  author?: {
    id: string;
    username: string | null;
    avatarUrl?: string | null;
  } | null;
}

export interface PaginatedMessages {
  data: ((typeof schema.messages.$inferSelect) & MessageWithAuthor)[];
  nextCursor: string | null;
}

export interface SearchResult {
  data: ((typeof schema.messages.$inferSelect) & MessageWithAuthor)[];
  nextCursor: string | null;
}

export interface GuildStats {
  totalMessages: number;
  deletedMessages: number;
  totalEdits: number;
  totalAttachments: number;
  totalReactions: number;
  totalMemberEvents: number;
  totalVoiceEvents: number;
  firstLoggedAt: number | null;
  topChannels: { channelId: string; channelName: string | null; guildIconUrl: string | null; count: number }[];
  topUsers: { userId: string; username: string | null; avatarUrl: string | null; count: number }[];
}

export interface ChannelStats {
  channel: {
    id: string;
    name: string | null;
    topic: string | null;
    type: number | null;
    nsfw: number | null;
    parentId: string | null;
    parentName: string | null;
    guildId: string | null;
    guildName: string | null;
  } | null;
  totalMessages: number;
  deletedMessages: number;
  totalEdits: number;
  totalAttachments: number;
  totalReactions: number;
  firstLoggedAt: number | null;
  lastLoggedAt: number | null;
  distinctUsers: number;
  topUsers: { userId: string; username: string | null; avatarUrl: string | null; count: number }[];
  topReactions: { emoji: string | null; emojiId: string | null; count: number }[];
}
