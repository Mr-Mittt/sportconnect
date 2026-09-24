// Full Session/SessionParticipant shapes live in shared/types/session.ts (both the Matches
// page and the cross-page UpcomingMatches rail card need them) — re-exported here so this
// feature's own imports read naturally. Write-only payloads (typed 1:1 against
// modules/session/session-api/.../dto/{CreateSessionRequest,UpdateSessionRequest,
// CancelSessionRequest}) stay local — no other feature needs them.
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

export interface CreateSessionPayload {
  /** Omitted = standalone. Set = group-linked, gated on canManageMembers backend-side. */
  groupId?: number;
  /** Required when groupId is omitted; inherited from the group otherwise. */
  sportId?: number;
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
