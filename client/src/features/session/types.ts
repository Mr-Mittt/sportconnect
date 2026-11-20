// Full Session/SessionParticipant shapes live in shared/types/session.ts (both the Matches
// page and the cross-page UpcomingMatches rail card need them) — re-exported here so this
// feature's own imports read naturally. Write-only payloads (typed 1:1 against
// modules/session/session-api/.../dto/{CreateSessionRequest,UpdateSessionRequest,
// CancelSessionRequest}) stay local — no other feature needs them.
import type { FriendUser } from '@/features/friends/types';
import type { FeeType, Session } from '@/shared/types/session';

export type {
  Session,
  SessionParticipant,
  SessionType,
  SessionStatus,
  ParticipantStatus,
  FeeType,
  StartTimeFilter,
} from '@/shared/types/session';

/** Who a group session is for (`GroupSessionAudience` on the server). */
export type GroupSessionAudience = 'ALL_MEMBERS' | 'SPECIFIC';

export interface CreateSessionPayload {
  /** Omitted = standalone. Set = a group session: any member of the group may create one (`403 SESSION_GROUP_MEMBER_REQUIRED` otherwise). */
  groupId?: number;
  /** Required when groupId is omitted; a group session takes the group's sport and ignores this. */
  sportId?: number;
  /** CLIENT-GROUP-SESSION-1: a group session only. `ALL_MEMBERS` (the server's default) or `SPECIFIC`, which needs `audienceUserIds`. Who is told; every member can still see and join. */
  audience?: GroupSessionAudience;
  /** With `SPECIFIC`: the other members to tell, at least one, no upper limit (`400 SESSION_AUDIENCE_REQUIRED`, `400 SESSION_AUDIENCE_NOT_MEMBER`). */
  audienceUserIds?: string[];
  title?: string;
  description?: string;
  /** SESSION-24: omitted -> the session is created PREPARING instead of SCHEDULED (CLIENT-SESSION-21). */
  locationId?: number;
  locationNote?: string;
  scheduledStart: string; // Instant — offset-aware ISO-8601, e.g. "2026-08-01T19:00:00+07:00" (SESSION-33)
  durationMinutes?: number;
  /** Mandatory on the real backend (SESSION-5) — no default fallback for a missing field. */
  capacity: number;
  /** SESSION-24: omitted -> the session is created PREPARING instead of SCHEDULED (CLIENT-SESSION-21). */
  feeType?: FeeType;
  /** Required only when feeType is FIXED; omitted otherwise. */
  feeAmountVnd?: number;
  /** Participants already accounted for outside the app — folded into the backend's reported
   * `participantCount` on top of the real joined count. Omitted -> backend defaults to 0. */
  initialSlot?: number;
  /** Omitted -> backend defaults to false (non-invited joiners land in REQUESTED). */
  autoApprove?: boolean;
  /** SESSION-69: omitted -> public. `false` makes a private session, seen only by its creator and its invitees. */
  isPublic?: boolean;
  /** SESSION-46: seats for men / women among the open ones; omitted or 0 = not specified. */
  maleSlots?: number;
  femaleSlots?: number;
  /** SESSION-46: 1 to 10, required by the server (the form always sends it, default 5). */
  gameMood: number;
  /** SESSION-46: at most 300 characters. */
  feeNote?: string;
  /** Pre-creates an INVITED participant row per id, bypassing the approval gate once that user
   * joins. The caller's own id and duplicates are silently deduped backend-side. Omitted/empty
   * -> no invitees. */
  inviteeIds?: string[];
  /** CLIENT-SESSION-15 / SESSION-23: sport-specific structured attributes, keyed by each
   * attribute's full `/`-separated path from the sport's *session* attribute schema (A17).
   * Server-filtered against that schema — unknown keys, wrong-shaped values, and writes to a
   * switched-off attribute are dropped silently; the surviving map is stored wholesale. Omitted
   * -> the session carries no attributes. */
  attributes?: Record<string, unknown>;
}

export interface UpdateSessionPayload {
  title?: string;
  description?: string;
  locationId?: number;
  locationNote?: string;
  /** Offset-aware ISO-8601 (`toOffsetAwareIso`) — an offset-less value is a 400 (SESSION-33). */
  scheduledStart?: string;
  durationMinutes?: number;
  capacity?: number;
  feeType?: FeeType;
  feeAmountVnd?: number;
  initialSlot?: number;
  autoApprove?: boolean;
  /** SESSION-69: switches a standalone session public / private (PREPARING only); sent only when it changed. */
  isPublic?: boolean;
  /** SESSION-46: a non-null value replaces, `0` clears the slots. */
  maleSlots?: number;
  femaleSlots?: number;
  /** SESSION-46: 1 to 10. */
  gameMood?: number;
  /** SESSION-46: a non-null value replaces, `""` clears. */
  feeNote?: string;
  /** SESSION-23: replaces the stored attributes wholesale; an explicit empty map clears them. */
  attributes?: Record<string, unknown>;
}

export interface CancelSessionPayload {
  reason?: string;
}

/** A `Session` with its group's display name resolved (null for a standalone session) — the
 * Matches page's aggregator already has the group list in hand while merging per-group
 * sessions, so it resolves this once instead of every card doing its own lookup. */
export interface SessionListItem extends Session {
  groupName: string | null;
}

/** CLIENT-SESSION-6's Discover panel search-scope dropdown. Only 'sessions' is wired to real
 * filtering — server-side `title` search as of CLIENT-SESSION-22 (was a client-side substring
 * filter before). 'location'/'gear' text search render as disabled placeholders (no gear/equipment
 * domain exists in this app yet, per client/CLAUDE.md's phase roadmap; real location filtering is
 * the separate, dedicated Location pill, not this dropdown). */
export type SessionSearchMode = 'sessions' | 'location' | 'gear';

/** CLIENT-SESSION-22 — one collapsible per-date section of the Discover results (replaces the old
 * flat `sessions: SessionListItem[]` list). `count` comes from `GET /discover/counts` and is known
 * even while collapsed/never-fetched; `sessions`/`isLoading`/`isError`/`hasMore`/`isFetchingMore`
 * only become meaningful once `isExpanded` triggers this date's own `GET /discover` fetch. */
export interface DiscoverDateSection {
  /** `yyyy-MM-dd`, also the collapse-state identity. */
  date: string;
  /** 'Today' / 'Tomorrow' / 'dd/MM' — see `discoverDateLabel.ts`. */
  label: string;
  count: number;
  isExpanded: boolean;
  sessions: SessionListItem[];
  isLoading: boolean;
  isError: boolean;
  hasMore: boolean;
  isFetchingMore: boolean;
}

/** CLIENT-SESSION-23 — one entry of `GET /sessions/history?dateCount=`'s `dates` (backend
 * SESSION-27/43): a calendar date, in the caller's `viewerZoneId`, on which the caller has at
 * least one `CANCELLED`/`COMPLETED` session they were `JOINED` to *for the requested sport*, and
 * how many. Typed 1:1 against `SessionHistoryDateCount`. */
export interface SessionHistoryDate {
  /** `yyyy-MM-dd` — also the expand-state identity and the `date=` value that fetches its sessions. */
  date: string;
  count: number;
}

/** `GET /sessions/history?dateCount=` response body (`SessionHistoryDatesResponse`). Pagination is
 * over distinct *dates*, most-recent-first; `hasMore` says a strictly-older date exists, and the
 * last returned `date` is the next page's `before` cursor. */
export interface SessionHistoryDatesResponse {
  dates: SessionHistoryDate[];
  hasMore: boolean;
}

/** CLIENT-GL-50 — one person of `GET /sessions/{id}/thread-people` (SESSION-GL-64): someone who can see the session's
 * discussion thread. Typed 1:1 against `ThreadPersonResponse`; nothing else is ever sent (no email, no status). */
export interface ThreadPerson {
  userId: string;
  fullName: string;
  avatarUrl: string | null;
}

/** CLIENT-SESSION-49 — `data` of `POST /sessions/{id}/shares`, typed 1:1 against `SessionShareResponse` (SESSION-66). */
export interface ShareSessionResponse {
  /** How many friends were notified; lower than the number chosen when some were skipped. */
  sent: number;
  /** Everyone not notified (not a friend, already in the session, deactivated, repeated), never told apart. */
  skipped: number;
}

/**
 * CLIENT-SESSION-49 — what the session modal's "Share" button and dialog need, owned by `useSessionDetailModalData`
 * (the query boundary). Optional on the modal: absent = no Share button (stories and tests that do not exercise it).
 */
export interface SessionShareData {
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  /** The caller's whole friend list, fetched only while the dialog is open. */
  friends: FriendUser[];
  isFriendsLoading: boolean;
  isFriendsError: boolean;
  /** Sends the session to these friends; `onDone` runs once the server accepted it. */
  onShare: (userIds: string[], onDone: () => void) => void;
  isSharing: boolean;
  /** A failure the dialog shows inline (a coded 404 / 403 opens the app-wide error dialog instead). */
  isShareError: boolean;
}
