import type { Location } from '@/shared/types/location';

// Typed 1:1 against the real backend DTOs (modules/session/session-api/.../dto/) — SessionResponse,
// SessionParticipantResponse, SessionType, SessionStatus, ParticipantStatus. Lives in shared/ (not
// features/session/) because both the Matches page and the cross-page UpcomingMatches rail card
// need it — the same reasoning shared/types/rail.ts already documents for SportKey/SportProfile.

// TOURNAMENT/TRAINING are reserved backend enum values with no supporting logic yet
// (modules/session/session-impl/CLAUDE.md) — included here for type-completeness only.
export type SessionType = 'GROUP_RECURRING' | 'STANDALONE' | 'TOURNAMENT' | 'TRAINING';

export type SessionStatus = 'SCHEDULED' | 'ONGOING' | 'COMPLETED' | 'CANCELLED';

// SESSION-6: REQUESTED = self-initiated join awaiting creator/owner-admin approval (only reachable
// when the session's autoApprove is false). INVITED = pre-created at session creation from
// CreateSessionRequest.inviteeIds, resolved only by the invitee's own joinSession call (which
// bypasses the approval gate regardless of autoApprove) — no separate accept endpoint exists.
export type ParticipantStatus = 'JOINED' | 'LEFT' | 'REQUESTED' | 'INVITED';

// SESSION-5: capacity is display-only (never enforced by joinSession); feeAmountVnd is
// meaningful only when feeType is FIXED (null otherwise).
export type FeeType = 'FREE' | 'SPLIT' | 'FIXED';

export interface Session {
  id: number;
  groupId: number | null;
  sessionType: SessionType;
  createdBy: string;
  createdByFullName: string;
  sportId: number;
  sportName: string;
  title: string | null;
  description: string | null;
  location: Location;
  locationNote: string | null;
  scheduledStart: string; // ISO, LocalDateTime (no timezone)
  scheduledEndAt: string | null;
  status: SessionStatus;
  cancelReason: string | null;
  cancelledBy: string | null;
  cancelledByFullName: string | null;
  cancelledAt: string | null;
  /** Real JOINED SessionParticipant rows + initialSlot, computed backend-side — not a raw
   * participant-table count. */
  participantCount: number;
  capacity: number;
  feeType: FeeType;
  feeAmountVnd: number | null;
  /** Participants the creator already accounts for outside the app, folded into
   * `participantCount` above (backend-side, `SessionServiceImpl.mapToResponses`). */
  initialSlot: number;
  /** SESSION-6: false = non-invited joiners land in REQUESTED, awaiting creator/owner-admin
   * approval. An INVITED row always bypasses this gate regardless of this value. */
  autoApprove: boolean;
  /** Like state of this session's own SESSION_POST anchor (backend-side, SESSION-10's
   * "post-ship addition" — `POST/DELETE /sessions/{id}/like`). */
  likeCount: number;
  isLikedByCurrentUser: boolean;
  /** SESSION-9: the caller's own SessionParticipant row for this session, or null if they have
   * none. userFullName/userAvatarUrl are unset on it (the caller already knows their own
   * identity) — only id/sessionId/userId/status/rejectReason/createdAt are meaningful. Drives
   * the Join/Accept/Decline/Cancel/Leave action on both the session card and SessionDetailModal:
   * null or LEFT -> Join, INVITED -> Accept/Decline, REQUESTED -> Cancel, JOINED -> Leave. */
  callerParticipation: SessionParticipant | null;
  createdAt: string;
  updatedAt: string;
}

export interface SessionParticipant {
  id: number;
  sessionId: number;
  userId: string;
  userFullName: string;
  userAvatarUrl: string | null;
  status: ParticipantStatus;
  /** Set only by rejectParticipant — null otherwise, including for a LEFT row from a self-leave. */
  rejectReason: string | null;
  createdAt: string;
}
