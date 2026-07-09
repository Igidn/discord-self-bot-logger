import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ChevronRight,
  MessageSquare,
  Calendar,
  Hash,
  UserCircle,
  Palette,
  Users as UsersIcon,
  Link as LinkIcon,
} from "lucide-react";
import apiClient from "../api/client";
import { ActivityHeatmap } from "../components/ActivityHeatmap";
import { MessageCard } from "../components/MessageCard";
import { UserTimelines } from "../components/UserTimelines";
import { formatDate, formatDateTime, type TimestampValue } from "../utils/datetime";

interface UserProfileData {
  id: string;
  username: string;
  discriminator?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  bot?: number;
  firstSeenAt?: TimestampValue;
  stats: {
    messageCount: number;
    guildCount: number;
    firstMessageAt?: TimestampValue;
    lastMessageAt?: TimestampValue;
  };
}

interface UserStats {
  messageCount: number;
  guildCount: number;
  firstMessageAt?: TimestampValue;
  lastMessageAt?: TimestampValue;
}

interface UserAbout {
  bio: string | null;
  pronouns: string | null;
  accentColor: number | null;
  bannerColor: number | null;
  publicFlags: number | null;
  badges: string[];
  avatarDecorationUrl: string | null;
  primaryGuild: { identityGuildId?: string | null; identityEnabled?: boolean | null; tag?: string | null } | null;
  createdAt: number;
  system: boolean;
  mutualGuildsCount: number | null;
  mutualFriendsCount: number | null;
  connectedAccounts: Array<Record<string, unknown>> | null;
}

interface UserMessage {
  id: string;
  guildId?: string | null;
  channelId: string;
  authorId: string;
  content?: string | null;
  createdAt: TimestampValue;
  editedAt?: TimestampValue;
  deletedAt?: TimestampValue;
  author?: {
    id: string;
    username: string;
    avatarUrl?: string | null;
  } | null;
}

export default function UserProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [user, setUser] = useState<UserProfileData | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [messages, setMessages] = useState<UserMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [about, setAbout] = useState<UserAbout | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"messages" | "activity">(
    "messages",
  );

  useEffect(() => {
    if (!id) return;
    async function fetchData() {
      try {
        const [uRes, mRes] = await Promise.all([
          apiClient.get<UserProfileData>(`/users/${id}`),
          // Message preview is a separate concern from stats
          apiClient.get<{ data: UserMessage[] }>(
            `/users/${id}/messages?limit=20`,
          ),
        ]);
        setUser(uRes.data);
        setMessages(mRes.data.data);
        setStats(uRes.data.stats);
        // ponytail: /about is best-effort (needs a shared guild for bio).
        // Fetched separately so a profile fetch failure doesn't blank the page.
        apiClient
          .get<UserAbout>(`/users/${id}/about`)
          .then((r) => setAbout(r.data))
          .catch(() => setAbout(null));
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
        <div className="text-sm text-muted-foreground">Loading profile...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-6">
        <div className="text-sm text-muted-foreground">User not found.</div>
      </div>
    );
  }

  return (
    <div className="p-6 overflow-y-auto">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => history.back()}
          className="p-2 rounded-lg bg-card border border-border hover:bg-muted transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="text-2xl font-bold">User Profile</h1>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6 items-start">
        {/* Left: profile + stats + tabs */}
        <div className="space-y-6 min-w-0">
          {/* Profile Header — Discord-style banner with overlapping avatar */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            {/* Banner / landscape fallback — Discord banners are ~16:5; matching the
                ratio shows the whole banner unclipped (object-cover == contain here)
                without full-bleed height. */}
            <div className="relative w-full aspect-[16/5] max-h-64">
              {user.bannerUrl ? (
                <img
                  src={user.bannerUrl}
                  alt=""
                  onClick={() => setLightbox(user.bannerUrl!)}
                  className="w-full h-full object-cover cursor-zoom-in"
                />
              ) : (
                // ponytail: gradient fallback uses theme tokens so it stays visible
                // in both light/dark. Upgraded with the user's accent color once
                // the /about fetch resolves, else a neutral theme gradient.
                <div
                  className="w-full h-full"
                  style={
                    about?.accentColor != null
                      ? { backgroundColor: `#${about.accentColor.toString(16).padStart(6, "0")}` }
                      : undefined
                  }
                >
                  {about?.accentColor == null && (
                    <div className="w-full h-full bg-gradient-to-br from-foreground/15 to-muted" />
                  )}
                </div>
              )}
            </div>

            <div className="relative px-6 pb-6 -mt-6">
              <div className="flex items-end gap-4">
                {user.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt={user.username}
                    onClick={() => setLightbox(user.avatarUrl!)}
                    className="w-20 h-20 rounded-full ring-4 ring-card object-cover shrink-0 cursor-zoom-in"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-full ring-4 ring-card bg-muted flex items-center justify-center text-2xl font-bold shrink-0">
                    {user.username.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="pb-1 min-w-0 flex-1">
                  <div className="text-xl font-bold flex items-center gap-2">
                    <span className="truncate">
                      {user.displayName ?? user.username}
                    </span>
                    {user.bot ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-foreground text-background font-medium">
                        BOT
                      </span>
                    ) : null}
                  </div>
                  <div className="text-sm text-muted-foreground truncate">
                    {user.username}
                    {user.discriminator ? `#${user.discriminator}` : ""}
                  </div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground/80">
                <span>ID: {user.id}</span>
                {user.firstSeenAt && (
                  <span>First seen {formatDate(user.firstSeenAt)}</span>
                )}
              </div>
            </div>
          </div>

          {/* About Me + account details — fetched live from Discord.
              Message count always renders (comes from stats); the rest of the
              card is best-effort on the /about fetch. */}
          <AboutCard about={about} messageCount={stats?.messageCount ?? 0} />

          {/* Tabs */}
          <div className="flex gap-2 border-b border-border">
            {(["messages", "activity"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab
                    ? "border-discord-blurple text-discord-blurple"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          {activeTab === "messages" && (
            <div className="space-y-2">
              {messages.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  No messages found.
                </div>
              ) : (
                messages.map((msg) => (
                  <Link
                    key={msg.id}
                    to={`/messages/${msg.id}`}
                    className="block"
                  >
                    <MessageCard message={msg} compact />
                  </Link>
                ))
              )}
              <button
                onClick={() =>
                  navigate(
                    `/browse?authorId=${encodeURIComponent(user.id)}&authorLabel=${encodeURIComponent(
                      user.username +
                        (user.discriminator ? `#${user.discriminator}` : ""),
                    )}`,
                  )
                }
                className="flex items-center justify-center gap-1 w-full mt-3 py-2 text-sm font-medium text-discord-blurple bg-discord-blurple/10 hover:bg-discord-blurple/20 rounded-lg transition-colors"
              >
                View all messages
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {activeTab === "activity" && <ActivityHeatmap userId={user.id} />}
        </div>

        {/* Right: member / voice / presence timelines */}
        <aside className="xl:sticky xl:top-6">
          <UserTimelines userId={user.id} />
        </aside>
      </div>

      {/* Full-size image lightbox. ponytail: no dependency — a fixed overlay
          with click-to-close and Escape support. */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setLightbox(null);
          }}
          tabIndex={0}
          role="button"
          aria-label="Close image"
        >
          <img
            src={lightbox}
            alt=""
            className="max-w-full max-h-full object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

function AboutRow({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ElementType;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 py-2">
      <Icon className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div className="text-sm break-words">{children}</div>
      </div>
    </div>
  );
}

function AboutCard({
  about,
  messageCount,
}: {
  about: UserAbout | null;
  messageCount: number;
}) {
  // ponytail: about is best-effort (needs a shared guild for bio). When it's
  // null we still render the card with the message-count row only, so the
  // one stat that's always available isn't lost.
  const accentHex =
    about?.accentColor != null
      ? `#${about.accentColor.toString(16).padStart(6, "0")}`
      : null;
  const accountAgeYears = about
    ? ((Date.now() - about.createdAt) / (365 * 24 * 3600 * 1000)).toFixed(1)
    : null;

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <UserCircle className="w-4 h-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold uppercase tracking-wider">
          About
        </h2>
        {/* Messages — always available, parked in the card header so it reads
            as a headline stat for the profile rather than just another row. */}
        <div className="ml-auto flex items-center gap-1.5 text-discord-green">
          <MessageSquare className="w-4 h-4" />
          <span className="text-sm font-bold">
            {messageCount.toLocaleString()}
          </span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Messages
          </span>
        </div>
      </div>

      {about?.bio ? (
        <p className="text-sm whitespace-pre-wrap break-words mb-3">
          {about.bio}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground italic mb-3">
          No "About Me" set.
        </p>
      )}

      {about?.badges && about.badges.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {about.badges.map((b) => (
            <span
              key={b}
              className="text-[11px] px-2 py-0.5 rounded-full bg-discord-blurple/15 text-discord-blurple font-medium"
            >
              {b}
            </span>
          ))}
        </div>
      )}

      {about?.pronouns && (
        <AboutRow icon={UserCircle} label="Pronouns">
          {about.pronouns}
        </AboutRow>
      )}

      {about && (
        <AboutRow icon={Calendar} label="Account Created">
          {formatDateTime(about.createdAt)}{" "}
          <span className="text-muted-foreground">({accountAgeYears}y old)</span>
        </AboutRow>
      )}

      {accentHex && about && (
        <AboutRow icon={Palette} label="Accent Color">
          <span className="inline-flex items-center gap-2">
            <span
              className="inline-block w-4 h-4 rounded border border-border"
              style={{ backgroundColor: accentHex }}
            />
            <span className="font-mono">{accentHex}</span>
          </span>
        </AboutRow>
      )}

      {about?.primaryGuild?.tag && (
        <AboutRow icon={Hash} label="Guild Tag">
          {about.primaryGuild.tag}
        </AboutRow>
      )}

      {about && (about.mutualGuildsCount != null || about.mutualFriendsCount != null) && (
        <AboutRow icon={UsersIcon} label="Mutuals">
          {about.mutualGuildsCount != null && (
            <span>{about.mutualGuildsCount} guilds</span>
          )}
          {about.mutualGuildsCount != null && about.mutualFriendsCount != null && (
            <span className="text-muted-foreground"> • </span>
          )}
          {about.mutualFriendsCount != null && (
            <span>{about.mutualFriendsCount} friends</span>
          )}
        </AboutRow>
      )}

      {about?.connectedAccounts && about.connectedAccounts.length > 0 && (
        <AboutRow icon={LinkIcon} label="Connected Accounts">
          <div className="flex flex-wrap gap-1.5">
            {about.connectedAccounts.map((acc, i) => (
              <span
                key={i}
                className="text-[11px] px-2 py-0.5 rounded bg-muted text-foreground"
              >
                {(acc.type as string) ?? "unknown"}
                {acc.name ? `: ${acc.name}` : ""}
              </span>
            ))}
          </div>
        </AboutRow>
      )}
    </div>
  );
}
