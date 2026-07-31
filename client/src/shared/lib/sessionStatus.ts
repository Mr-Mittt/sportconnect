import type { SessionStatus } from '@/shared/types/session';

// Shared across UpcomingMatches (rail), SessionListCard, and SessionDetailModal so the
// 4-state status badge reads identically everywhere a Session appears.
export const SESSION_STATUS_LABEL: Record<SessionStatus, string> = {
  SCHEDULED: 'Scheduled',
  ONGOING: 'Ongoing',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export const SESSION_STATUS_CLASSES: Record<SessionStatus, string> = {
  SCHEDULED: 'text-text-accent',
  ONGOING: 'text-text-success',
  COMPLETED: 'text-text-muted',
  CANCELLED: 'text-text-danger',
};
