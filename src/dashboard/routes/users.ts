import { Router } from 'express';
import z from 'zod';
import { eq } from 'drizzle-orm';
import {
  getUserById,
  getUserStats,
  getMessagesByUser,
  getAllUsers,
  getUserActivityHeatmap,
  getMemberEvents,
  getVoiceEvents,
  getPresenceUpdates,
  getLatestPresenceByUser,
} from '@/database/queries.js';
import { db } from '@/database/index.js';
import { users } from '@/database/schema.js';
import { client } from '@/bot/client.js';
import { snowflakeToMilliseconds } from '@/utils/snowflake.js';
import { logger } from '@/utils/logger.js';

const router = Router();

const listQuery = z.object({
  search: z.string().optional(),
  sort: z.enum(['messages_desc', 'messages_asc', 'username_asc', 'username_desc']).optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

const messagesQuery = z.object({
  limit: z.coerce.number().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

const heatmapQuery = z.object({
  days: z.coerce.number().int().min(1).max(730).optional(),
  tz: z.coerce.number().int().min(-720).max(720).optional(),
});

const timelineQuery = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

router.get('/', async (req, res, next) => {
  try {
    const query = listQuery.parse(req.query);
    const result = getAllUsers({
      search: query.search,
      sort: query.sort,
      page: query.page,
      limit: query.limit,
    });
    res.json(result);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors });
      return;
    }
    logger.error(err, 'Failed to fetch users list');
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const user = getUserById(req.params.id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    // ponytail: gateway message payloads omit the banner hash, so bannerUrl
    // is null for most users. Fetch once on first profile view via the REST
    // /users/:id endpoint and cache in the DB; the attempt set guarantees we
    // only try once per ID per server lifetime — a user with no banner stays
    // null after a successful fetch, and a 403 doesn't spam the log on every
    // view. Gated on client.readyAt so a not-yet-logged-in bot doesn't 500.
    let resolved = user;
    if (!user.bannerUrl && client.readyAt && !bannerFetchAttempted.has(req.params.id)) {
      resolved = (await refreshUserBanner(req.params.id, user)) ?? user;
      bannerFetchAttempted.add(req.params.id);
    }
    const stats = getUserStats(req.params.id);
    res.json({
      ...resolved,
      stats,
    });
  } catch (err) {
    logger.error(err, 'Failed to fetch user');
    next(err);
  }
});

// ponytail: badges are the public-facing UserFlags bits Discord actually
// renders on a profile. Private/internal flags (SPAMMER, DELETED, ...) are
// intentionally excluded so we never surface moderation-internal state.
const PUBLIC_BADGES: Record<number, string> = {
  1: 'Discord Staff',
  2: 'Partnered Server Owner',
  4: 'Hypesquad Events',
  8: 'Bug Hunter (L1)',
  64: 'Hypesquad Bravery',
  128: 'Hypesquad Brilliance',
  256: 'Hypesquad Balance',
  512: 'Early Supporter',
  16384: 'Bug Hunter (L2)',
  65536: 'Verified Bot',
  131072: 'Early Verified Bot Developer',
  262144: 'Certified Moderator',
  4194304: 'Active Developer',
};

function badgesForFlags(bitfield: number | null | undefined): string[] {
  if (!bitfield) return [];
  return Object.entries(PUBLIC_BADGES)
    .filter(([bit]) => (bitfield & Number(bit)) !== 0)
    .map(([, label]) => label);
}

// /users/:id/about — Discord "About Me" + extra account details fetched live
// from the bot's view of the user. Best-effort: the profile endpoint only
// works for users the bot shares a mutual guild/friend with, so bio/pronouns/
// mutual counts are null when that fetch fails. User-level fields (accent
// color, public flags, account age from snowflake) always come back.
router.get('/:id/about', async (req, res, next) => {
  try {
    if (!client.readyAt) {
      res.status(503).json({ error: 'Bot not ready' });
      return;
    }
    const fetched = await client.users.fetch(req.params.id, { force: false, cache: true });

    // Profile (bio/pronouns/mutuals) is gated on a shared guild/friend link.
    // Wrapped so a 403/rate-limit still returns the user-level details.
    let profile: Awaited<ReturnType<typeof fetched.getProfile>> | null = null;
    try {
      profile = await fetched.getProfile();
    } catch (err) {
      logger.warn({ userId: req.params.id, err }, 'Profile fetch failed');
    }

    const userProfile = (profile as Record<string, unknown> | null)?.user_profile as
      | Record<string, unknown>
      | undefined;
    const bio =
      (userProfile?.bio as string | undefined) ??
      (profile as Record<string, unknown> | null)?.bio as string | undefined ??
      null;
    const pronouns = (userProfile?.pronouns as string | undefined) ?? null;
    const mutualGuildsCount =
      (profile as Record<string, unknown> | null)?.mutual_guilds_count as number | undefined ?? null;
    const mutualFriendsCount =
      (profile as Record<string, unknown> | null)?.mutual_friends_count as number | undefined ?? null;
    const connectedAccounts =
      (profile as Record<string, unknown> | null)?.connected_accounts as
        | Array<Record<string, unknown>>
        | undefined ?? null;

    res.json({
      bio: bio ?? null,
      pronouns: pronouns ?? null,
      accentColor: fetched.accentColor ?? null,
      bannerColor: fetched.bannerColor ?? null,
      publicFlags: fetched.flags?.bitfield ?? null,
      badges: badgesForFlags(fetched.flags?.bitfield),
      avatarDecorationUrl: fetched.avatarDecorationData?.asset
        ? `https://cdn.discordapp.com/avatar-decoration-presets/${fetched.avatarDecorationData.asset}.png?size=96&passthrough=true`
        : null,
      primaryGuild: fetched.primaryGuild ?? null,
      createdAt: snowflakeToMilliseconds(fetched.id),
      system: fetched.system ?? false,
      mutualGuildsCount,
      mutualFriendsCount,
      connectedAccounts,
    });
  } catch (err) {
    logger.error(err, 'Failed to fetch user about');
    next(err);
  }
});

// IDs we've already attempted an on-demand banner fetch for this session.
// A user with no banner stays null after a successful fetch, and a 403
// (deleted/inaccessible account) would otherwise re-fire every view.
// ponytail: in-process Set, resets on restart — fine, one retry per boot.
const bannerFetchAttempted = new Set<string>();

// On-demand banner/displayName fetch. Best-effort: never breaks the page when
// the fetch fails (rate limit, unknown user, network). Returns the updated
// row or null to fall back to what we already have.
async function refreshUserBanner(
  id: string,
  current: typeof users.$inferSelect,
): Promise<typeof users.$inferSelect | null> {
  try {
    const fetched = await client.users.fetch(id, { force: true, cache: true });
    const bannerUrl = fetched.banner ? fetched.bannerURL({ size: 512 }) : null;
    const displayName = fetched.globalName ?? null;
    const set: Record<string, unknown> = {};
    if (bannerUrl !== null) set.bannerUrl = bannerUrl;
    if (displayName !== null) set.displayName = displayName;
    if (Object.keys(set).length > 0) {
      db.update(users).set(set).where(eq(users.id, id)).run();
    }
    return { ...current, bannerUrl, displayName };
  } catch (err: unknown) {
    // 40001 / 403 Unauthorized = the bot can't see this user (deleted,
    // blocked, or no shared guild). Expected, not a bug — log at debug so
    // it doesn't look like a fault, and the attempt set above stops retries.
    const code = (err as { code?: number; httpStatus?: number })?.code;
    const httpStatus = (err as { httpStatus?: number })?.httpStatus;
    if (code === 40001 || httpStatus === 403) {
      logger.debug({ userId: id }, 'Banner fetch skipped: bot cannot access user');
    } else {
      logger.warn({ userId: id, err }, 'On-demand banner fetch failed');
    }
    return null;
  }
}

router.get('/:id/activity/heatmap', async (req, res, next) => {
  try {
    const query = heatmapQuery.parse(req.query);
    const days = query.days ?? 365;
    const tz = query.tz ?? 0;
    const data = getUserActivityHeatmap(req.params.id, days, tz);
    res.json({ days, tz, data });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors });
      return;
    }
    logger.error(err, 'Failed to fetch user activity heatmap');
    next(err);
  }
});

router.get('/:id/messages', async (req, res, next) => {
  try {
    const query = messagesQuery.parse(req.query);
    const result = getMessagesByUser(req.params.id, { limit: query.limit, cursor: query.cursor });
    res.json(result);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors });
      return;
    }
    next(err);
  }
});

// ponytail: member/voice queries filter by user_id with no per-user index;
// guild-time index won't help, so these table-scan the guild partition.
// Fine for small tables; add (user_id, created_at) index if slower than ~200ms.
router.get('/:id/member-events', async (req, res, next) => {
  try {
    const query = timelineQuery.parse(req.query);
    const data = getMemberEvents(undefined, req.params.id, undefined, query.limit);
    res.json({ data });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors });
      return;
    }
    logger.error(err, 'Failed to fetch member events');
    next(err);
  }
});

router.get('/:id/voice-events', async (req, res, next) => {
  try {
    const query = timelineQuery.parse(req.query);
    const data = getVoiceEvents(undefined, req.params.id, query.limit);
    res.json({ data });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors });
      return;
    }
    logger.error(err, 'Failed to fetch voice events');
    next(err);
  }
});

router.get('/:id/presence', async (req, res, next) => {
  try {
    const query = timelineQuery.parse(req.query);
    const history = getPresenceUpdates(undefined, req.params.id, query.limit);
    const latest = getLatestPresenceByUser(req.params.id);
    res.json({ history, latest });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors });
      return;
    }
    logger.error(err, 'Failed to fetch presence');
    next(err);
  }
});

export default router;
