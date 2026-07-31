// Full Session/SessionParticipant shapes live in shared/types/session.ts (both the Matches
// page and the cross-page UpcomingMatches rail card need them) — re-exported here so this
// feature's own imports read naturally. Write-only payloads (typed 1:1 against
// modules/session/session-api/.../dto/{CreateSessionRequest,UpdateSessionRequest,
// CancelSessionRequest}) stay local — no other feature needs them.
import type { Session } from '@/shared/types/session';

export type {
  Session,
  SessionParticipant,
  SessionType,
  SessionStatus,
  ParticipantStatus,
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
}

export interface UpdateSessionPayload {
  title?: string;
  description?: string;
  locationId?: number;
  locationNote?: string;
  scheduledStart?: string;
  durationMinutes?: number;
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
