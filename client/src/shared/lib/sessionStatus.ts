import type { SessionStatus } from '@/shared/types/session';

// Shared across SessionCard (used at both sizes by UpcomingMatches and the Matches page) and
// SessionDetailModal so the 4-state status badge reads identically everywhere a Session appears.
export const SESSION_STATUS_LABEL: Record<SessionStatus, string> = {
  SCHEDULED: 'Scheduled',
  ONGOING: 'Ongoing',
  PREPARING: 'Preparing',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export const SESSION_STATUS_CLASSES: Record<SessionStatus, string> = {
  SCHEDULED: 'text-text-accent',
  ONGOING: 'text-text-success',
  // The app's reserved warning color (client/CLAUDE.md) — PREPARING is the "needs attention
  // before it starts" state, same semantic the approval-queue card already uses this token for.
  PREPARING: 'text-amber-800',
  COMPLETED: 'text-text-muted',
  CANCELLED: 'text-text-danger',
};
