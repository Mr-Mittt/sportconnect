import type { Location } from '@/shared/types/location';

// Typed 1:1 against the real backend DTOs (modules/session/session-api/.../dto/) — SessionResponse,
// SessionParticipantResponse, SessionType, SessionStatus, ParticipantStatus. Lives in shared/ (not
// features/session/) because both the Matches page and the cross-page UpcomingMatches rail card
// need it — the same reasoning shared/types/rail.ts already documents for SportKey/SportProfile.

// TOURNAMENT/TRAINING are reserved backend enum values with no supporting logic yet
// (modules/session/session-impl/CLAUDE.md) — included here for type-completeness only.
export type SessionType = 'GROUP_RECURRING' | 'STANDALONE' | 'TOURNAMENT' | 'TRAINING';

export type SessionStatus = 'SCHEDULED' | 'ONGOING' | 'COMPLETED' | 'CANCELLED';

export type ParticipantStatus = 'JOINED' | 'LEFT';

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
  participantCount: number;
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
  createdAt: string;
}
