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
} from '@/shared/types/session';

export interface CreateSessionPayload {
  /** Omitted = standalone. Set = group-linked, gated on canManageMembers backend-side. */
  groupId?: number;
  /** Required when groupId is omitted; inherited from the group otherwise. */
  sportId?: number;
  title?: string;
  description?: string;
  locationId: number;
  locationNote?: string;
  scheduledStart: string; // LocalDateTime, e.g. "2026-08-01T19:00:00"
  durationMinutes?: number;
  /** Mandatory on the real backend (SESSION-5) — no default fallback for a missing field. */
  capacity: number;
  feeType: FeeType;
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
}

export interface UpdateSessionPayload {
  title?: string;
  description?: string;
  locationId?: number;
  locationNote?: string;
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
 * client-side filtering — 'location'/'gear' render as disabled placeholders (no gear/equipment
 * domain exists in this app yet, per client/CLAUDE.md's phase roadmap). */
export type SessionSearchMode = 'sessions' | 'location' | 'gear';
