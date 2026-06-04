import { sql } from 'drizzle-orm';
import { db } from '../index.js';

export interface AllUsersQuery {
  search?: string;
  sort?: 'messages_desc' | 'messages_asc' | 'username_asc' | 'username_desc';
  page?: number;
  limit?: number;
}

export interface AllUsersItem {
  userId: string;
  username: string | null;
  avatarUrl: string | null;
  bot: number | null;
  messageCount: number;
}

export interface AllUsersResult {
  data: AllUsersItem[];
  total: number;
  page: number;
  limit: number;
}

function escapeLikeValue(value: string): string {
  return value.replace(/[%_\\]/g, '\\$&');
}

export function getAllUsers(query: AllUsersQuery = {}): AllUsersResult {
  const search = query.search?.trim() ?? '';
  const sort = query.sort ?? 'messages_desc';
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(100, Math.max(1, query.limit ?? 20));
  const offset = (page - 1) * limit;

  const searchParam = search ? `%${escapeLikeValue(search)}%` : '';

  const orderByClause = (() => {
    switch (sort) {
      case 'messages_asc':
        return 'messageCount ASC, u.username ASC';
      case 'username_asc':
        return 'u.username ASC, messageCount DESC';
      case 'username_desc':
        return 'u.username DESC, messageCount DESC';
      case 'messages_desc':
      default:
        return 'messageCount DESC, u.username ASC';
    }
  })();

  const orderBySql = sql.raw(orderByClause);

  const rows = db.all<AllUsersItem>(sql`
    SELECT
      u.id AS userId,
      u.username,
      u.avatar_url AS avatarUrl,
      u.bot,
      COALESCE(m.messageCount, 0) AS messageCount
    FROM users u
    LEFT JOIN (
      SELECT author_id, count(*) AS messageCount
      FROM messages
      GROUP BY author_id
    ) m ON m.author_id = u.id
    WHERE (${searchParam} = '' OR u.username LIKE ${searchParam} ESCAPE '\')
    ORDER BY ${orderBySql}
    LIMIT ${limit} OFFSET ${offset}
  `);

  const countRow = db.all<{ count: number }>(sql`
    SELECT count(*) AS count FROM users u
    WHERE (${searchParam} = '' OR u.username LIKE ${searchParam} ESCAPE '\')
  `);

  return {
    data: rows,
    total: countRow[0]?.count ?? 0,
    page,
    limit,
  };
}
