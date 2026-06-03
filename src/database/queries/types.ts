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

export interface MessageDetail {
  message: typeof schema.messages.$inferSelect | undefined;
  edits: (typeof schema.messageEdits.$inferSelect)[];
  attachments: (typeof schema.attachments.$inferSelect)[];
  reactions: (typeof schema.reactions.$inferSelect)[];
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
  topChannels: { channelId: string; channelName: string | null; guildIconUrl: string | null; count: number }[];
  topUsers: { userId: string; count: number }[];
}

export interface OverviewStats {
  dailyCounts: { day: string; count: number }[];
  totalMessages: number;
  totalGuilds: number;
  totalUsers: number;
  topChannels: { channelId: string; channelName: string | null; guildIconUrl: string | null; count: number }[];
  topUsers: { userId: string; username: string | null; count: number }[];
}
